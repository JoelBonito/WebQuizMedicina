import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGeminiWithUsage, parseJsonFromResponse } from '../_shared/gemini.ts';
import { calculateSummaryStrategy, calculateSafeOutputTokens, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
import { logTokenUsage } from '../_shared/token-logger.ts';

// Lazy-initialize AuditLogger to avoid crashes if env vars are missing
let auditLogger: AuditLogger | null = null;
function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
  }
  return auditLogger;
}

// Force re-deploy: Fix AuditLogger lazy initialization with params (2025-11-17 22:45)

serve(async (req) => {
  // Handle CORS preflight - MUST return 200 OK immediately
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: securityHeaders
    });
  }

  try {
    // 1. Rate limiting (10 requests per minute for AI generation)
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION);
    if (!rateLimitResult.allowed) {
      await getAuditLogger().logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req,
        null,
        { endpoint: 'generate-summary', limit: RATE_LIMITS.AI_GENERATION.maxRequests }
      );

      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        {
          status: 429,
          headers: {
            ...securityHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(Math.ceil(rateLimitResult.retryAfter / 1000)),
          },
        }
      );
    }

    // 2. Authentication
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      await getAuditLogger().logAuth(
        AuditEventType.AUTH_FAILED_LOGIN,
        null,
        req,
        { reason: 'Invalid or missing token', endpoint: 'generate-summary' }
      );

      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateSummarySchema);
    const { source_id, project_id } = validatedData;

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    let sources = [];

    // Fetch source(s)
    if (source_id) {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .single();

      if (error) throw error;
      sources = [data];
    } else if (project_id) {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false }); // Most recent first

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // CRITICAL CHANGE: Summaries now use FULL extracted_content (no embeddings/filtering)
    // Reason: Medical summaries require 100% coverage (dosagens, contraindicações, etc)
    // Embeddings/semantic search would lose 70-80% of content, which is unacceptable
    const sourceIds = sources.map(s => s.id);
    let combinedContent = '';

    console.log('📄 [Summary] Using full extracted_content (100% coverage, no semantic filtering)');
    console.log('📊 [Summary] Processing all sources for complete medical summary');

    // Combine ALL content from ALL sources (no filtering, no truncation at this stage)
    for (const source of sources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    console.log(`📊 [Summary] Combined ${sources.length} sources: ${combinedContent.length} chars (~${Math.ceil(combinedContent.length / 4)} tokens)`)

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate summary');
    }

    // PHASE 1: Calculate adaptive summary strategy
    const strategyInfo = calculateSummaryStrategy(combinedContent);

    console.log(`📊 [PHASE 1] Summary strategy: ${strategyInfo.strategy}`);
    console.log(`ℹ️  [PHASE 1] ${strategyInfo.explanation}`);

    // Track token usage across all API calls
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    let parsed: any;

    if (strategyInfo.strategy === 'SINGLE') {
      // Strategy 1: Single complete summary
      // Now handles up to 300k chars (~75k tokens input) with consolidation
      const prompt = `Você é um professor especialista em medicina. Crie um resumo estruturado e CONSOLIDADO do conteúdo abaixo.

CONTEÚDO (pode conter múltiplas fontes com tópicos duplicados):
${combinedContent}

INSTRUÇÕES CRÍTICAS:
1. **CONSOLIDE TÓPICOS DUPLICADOS**:
   - Se o mesmo tópico (ex: "Diabetes Mellitus") aparece em várias fontes, crie UMA ÚNICA seção <h2> integrando TODAS as informações relevantes
   - Evite repetir o mesmo conteúdo de fontes diferentes

2. **PRESERVE TODOS OS DETALHES CLÍNICOS**:
   - Dosagens, posologias, protocolos
   - Contraindicações, efeitos adversos, interações medicamentosas
   - Tabelas, classificações, critérios diagnósticos
   - NUNCA omita informações importantes de segurança

3. **ESTRUTURA HIERÁRQUICA CLARA**:
   - <h2> para tópicos principais únicos (ex: Hipertensão Arterial, Diabetes Mellitus)
   - <h3> para aspectos clínicos (Fisiopatologia, Diagnóstico, Tratamento, Complicações)
   - <h4> para subdivisões específicas se necessário
   - <p> para parágrafos explicativos
   - <ul>/<li> para listas de conceitos, sintomas, medicamentos
   - <strong> para destacar termos médicos importantes
   - <em> para ênfases quando apropriado

4. **PRIORIZE PROFUNDIDADE SOBRE EXTENSÃO**:
   - Máximo 15-20 páginas (aproximadamente)
   - Foque nos conceitos mais importantes com detalhes completos
   - Não liste tudo superficialmente - seja educativo e aprofundado

5. **FORMATAÇÃO RICA** para facilitar estudo e legibilidade

6. **TERMINOLOGIA MÉDICA CORRETA** em Português do Brasil

7. **ORGANIZAÇÃO LÓGICA**: Agrupe tópicos relacionados de forma coerente

IMPORTANTE: Este é material de estudo médico. Completude e precisão são mais importantes que brevidade.

JSON:
{
  "titulo": "string (descritivo dos principais tópicos abordados)",
  "conteudo_html": "string (HTML estruturado, consolidado, sem duplicações)",
  "topicos": ["string", ...] (lista dos tópicos PRINCIPAIS únicos, sem duplicação)
}`;

      // Use dynamically calculated maxOutputTokens to respect combined context limit
      const result = await callGeminiWithUsage(prompt, 'gemini-2.5-flash', strategyInfo.maxOutputTokens, true);

      // Track token usage
      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalCachedTokens += result.usage.cachedTokens || 0;

      parsed = parseJsonFromResponse(result.text);
      console.log(`✅ [PHASE 1] Single summary generated: ${result.usage.outputTokens} tokens, ${parsed.topicos?.length || 0} topics`);
    } else {
      // Strategy 2: Batched sections summary with PARALLEL processing
      console.log(`🔄 [PHASE 1] Generating summary in parallel sections...`);

      // Split content into 50k char chunks (smaller chunks = safer for token limits)
      // This ensures each chunk + output stays within the 30k combined token limit
      // 50k chars ≈ 12.5k tokens input + 6k tokens output = 18.5k total (safe!)
      const chunkSize = 50000;
      const chunks: string[] = [];
      for (let i = 0; i < combinedContent.length; i += chunkSize) {
        chunks.push(combinedContent.substring(i, i + chunkSize));
      }

      console.log(`📑 [PHASE 1] Split into ${chunks.length} sections (${chunkSize} chars each). Processing in PARALLEL...`);

      // CRITICAL: Use Promise.all for parallel processing (time = max, not sum)
      // Example: 3 chunks × 30s (parallel) = ~30s total vs 90s (sequential)
      const sectionPromises = chunks.map(async (chunk, i) => {
        const chunkNum = i + 1;
        const sectionPrompt = `Você é um professor especialista em medicina. Crie um resumo ESTRUTURADO e DETALHADO desta seção.

SEÇÃO ${chunkNum} DE ${chunks.length}:
${chunk}

INSTRUÇÕES:
1. Para cada tópico principal:
   - Use <h3> para o nome do tópico
   - Use <h4> para subtópicos (Fisiopatologia, Diagnóstico, Tratamento, Complicações, etc)
2. PRESERVE TODOS OS DETALHES CLÍNICOS:
   - Dosagens e posologias específicas
   - Contraindicações e efeitos adversos
   - Interações medicamentosas
   - Tabelas e protocolos clínicos
3. Formatação rica:
   - <p> para parágrafos explicativos
   - <ul>/<li> para listas de conceitos, sintomas, medicamentos
   - <strong> para termos médicos importantes
   - <em> para ênfases quando apropriado
4. Se houver tabelas implícitas, preserve-as como listas estruturadas
5. Português do Brasil, terminologia médica correta

CRÍTICO: Material médico educacional. NÃO omita informações clínicas importantes (dosagens, contraindicações, etc).

Retorne APENAS o HTML estruturado (sem JSON, sem markdown, sem explicações).`;

        try {
          // Calculate safe output tokens for this specific chunk
          const safeChunkOutput = calculateSafeOutputTokens(sectionPrompt, 6000);
          const result = await callGeminiWithUsage(sectionPrompt, 'gemini-2.5-flash', safeChunkOutput);
          console.log(`✅ [Seção ${chunkNum}/${chunks.length}] Completed (${result.usage.outputTokens} tokens)`);
          return result;
        } catch (err) {
          console.error(`❌ [Seção ${chunkNum}/${chunks.length}] Failed:`, err);
          // Graceful fallback: don't break entire process if one chunk fails
          return {
            text: `<div class="section-error"><h3>⚠️ Erro na Seção ${chunkNum}</h3><p>Esta seção não pôde ser processada devido a um erro técnico. Por favor, revise manualmente o conteúdo fonte correspondente.</p></div>`,
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
          };
        }
      });

      // Wait for all sections to complete in parallel (time = max, not sum!)
      const results = await Promise.all(sectionPromises);

      // Aggregate results
      const sectionSummaries = results.map(r => r.text);
      totalInputTokens += results.reduce((acc, r) => acc + (r.usage?.inputTokens || 0), 0);
      totalOutputTokens += results.reduce((acc, r) => acc + (r.usage?.outputTokens || 0), 0);
      totalCachedTokens += results.reduce((acc, r) => acc + (r.usage?.cachedTokens || 0), 0);

      // Combine section summaries with topic consolidation
      console.log(`🔄 [PHASE 1] Combining and consolidating ${sectionSummaries.length} sections...`);

      const combinePrompt = `Você é um professor especialista em medicina. Combine os resumos de seção abaixo em um resumo final CONSOLIDADO e COERENTE.

RESUMOS DAS SEÇÕES (cada seção lista seus tópicos principais):
${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n\n')}

INSTRUÇÕES CRÍTICAS DE CONSOLIDAÇÃO:
1. **ELIMINE DUPLICAÇÃO DE TÓPICOS**:
   - Se "Diabetes Mellitus" aparece em múltiplas seções, crie UMA ÚNICA seção <h2>Diabetes Mellitus</h2>
   - Integre TODAS as informações relevantes de todas as menções do mesmo tópico
   - Evite repetir o mesmo conteúdo de diferentes seções

2. **INTEGRE INFORMAÇÕES COMPLEMENTARES**:
   - Se Seção 1 tem fisiopatologia e Seção 3 tem tratamento do MESMO tópico, junte em uma única seção
   - Use <h3> para aspectos clínicos: Fisiopatologia, Diagnóstico, Tratamento, Complicações, Prognóstico

3. **PRESERVE TODOS OS DETALHES CLÍNICOS** (NUNCA omita):
   - Dosagens, posologias, protocolos
   - Contraindicações, efeitos adversos, interações
   - Tabelas, classificações, critérios diagnósticos
   - Informações de segurança e alertas

4. **ESTRUTURA HIERÁRQUICA FINAL**:
   - <h2> tópicos principais únicos (ex: Hipertensão Arterial, Diabetes Mellitus, Insuficiência Cardíaca)
   - <h3> aspectos clínicos (Fisiopatologia, Diagnóstico, Tratamento, Complicações)
   - <h4> subdivisões específicas se necessário
   - <p>, <ul>/<li>, <strong>, <em> para conteúdo rico

5. **TÍTULO DESCRITIVO** que reflita os principais tópicos consolidados

6. **LISTA DE TÓPICOS ÚNICOS** (sem duplicação entre seções)

7. **LIMITE RECOMENDADO: 15-20 páginas**
   - Priorize organização lógica e completude
   - Em medicina: Completude > Brevidade

IMPORTANTE: Este é material de estudo médico. Preserve TODOS os detalhes clínicos importantes.

JSON:
{
  "titulo": "string (descritivo dos principais tópicos)",
  "conteudo_html": "string (HTML completo, consolidado, sem duplicações)",
  "topicos": ["string", ...] (lista de tópicos ÚNICOS consolidados)
}`;

      // Use dynamically calculated maxOutputTokens to respect combined context limit
      const safeOutputTokens = calculateSafeOutputTokens(combinePrompt, 14000);
      const combineResult = await callGeminiWithUsage(combinePrompt, 'gemini-2.5-flash', safeOutputTokens, true);

      // Track token usage
      totalInputTokens += combineResult.usage.inputTokens;
      totalOutputTokens += combineResult.usage.outputTokens;
      totalCachedTokens += combineResult.usage.cachedTokens || 0;

      parsed = parseJsonFromResponse(combineResult.text);
      console.log(`✅ [PHASE 1] Consolidated summary: ${combineResult.usage.outputTokens} tokens, ${parsed.topicos?.length || 0} unique topics`);
    }

    if (!parsed.titulo || !parsed.conteudo_html) {
      console.error('❌ Invalid response format from AI:', {
        hasTitulo: !!parsed.titulo,
        hasConteudo: !!parsed.conteudo_html,
        conteudoLength: parsed.conteudo_html?.length || 0,
        recoveredFields: Object.keys(parsed),
      });
      throw new Error('Invalid response format from AI');
    }

    // Validate minimum content length (allow truncated but substantial content)
    if (parsed.conteudo_html.length < 500) {
      console.warn(`⚠️ Content seems too short (${parsed.conteudo_html.length} chars). May be truncated.`);
      console.warn('Proceeding anyway as this may be a very concise summary.');
    }

    // Save summary to database (sanitize HTML to prevent XSS)
    const { data: insertedSummary, error: insertError } = await supabaseClient
      .from('summaries')
      .insert({
        project_id: project_id || sources[0].project_id,
        titulo: sanitizeString(parsed.titulo),
        conteudo_html: sanitizeHtml(parsed.conteudo_html),
        topicos: Array.isArray(parsed.topicos) ? parsed.topicos.map((t: string) => sanitizeString(t)) : [],
        source_ids: sourceIds,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Log Token Usage for Admin Analytics
    await logTokenUsage(
      supabaseClient,
      user.id,
      project_id || sources[0].project_id,
      'summary',
      {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
      },
      'gemini-2.5-flash',
      {
        summary_id: insertedSummary.id,
        strategy: strategyInfo.strategy,
        sources_count: sources.length,
      }
    );

    // Audit log: AI summary generation
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_SUMMARY_GENERATED,
      user.id,
      project_id || sources[0].project_id,
      req,
      {
        source_count: sources.length,
        summary_id: insertedSummary.id,
      }
    );

    return createSuccessResponse({
      success: true,
      summary: insertedSummary,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 400);
  }
});
