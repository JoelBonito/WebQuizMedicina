import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';
import { calculateSummaryStrategy, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
import { hasAnyEmbeddings, semanticSearch } from '../_shared/embeddings.ts';

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

    // PHASE 2: Check if embeddings exist for semantic search
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    let combinedContent = '';

    if (useSemanticSearch) {
      // ✅ PHASE 2: Use semantic search with embeddings
      console.log('🎯 [PHASE 2] Using semantic search with embeddings');

      // Define query optimized for summary generation
      const query = `Gerar resumo abrangente sobre os principais conceitos, tópicos centrais, processos fundamentais, terminologia chave, mecanismos importantes e aplicações práticas do conteúdo médico. Incluir aspectos clínicos, diagnósticos e terapêuticos relevantes.`;

      // Get top 20 most relevant chunks (more for comprehensive summary)
      const relevantChunks = await semanticSearch(
        supabaseClient,
        query,
        sourceIds,
        20 // top K - more chunks for better coverage
      );

      if (relevantChunks.length === 0) {
        console.warn('⚠️ [PHASE 2] No relevant chunks found, falling back to concatenation');
        useSemanticSearch = false;
      } else {
        // Build context from relevant chunks
        combinedContent = relevantChunks
          .map((chunk, idx) => {
            const similarity = (chunk.similarity * 100).toFixed(1);
            return `[Trecho ${idx + 1} - Relevância: ${similarity}%]\n${chunk.content}`;
          })
          .join('\n\n---\n\n');

        const avgSimilarity = (relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length * 100).toFixed(1);
        console.log(`✅ [PHASE 2] Using ${relevantChunks.length} relevant chunks (avg similarity: ${avgSimilarity}%)`);
        console.log(`📊 [PHASE 2] Total content: ${combinedContent.length} characters`);
      }
    }

    if (!useSemanticSearch) {
      // ⚠️ PHASE 0: Fallback to truncated concatenation (legacy method)
      console.warn('⚠️ [PHASE 0] No embeddings found. Using fallback method (truncated concatenation)');

      const MAX_SOURCES = 3;
      const MAX_CONTENT_LENGTH = 40000; // ~10k tokens

      let usedSources = sources;
      if (sources.length > MAX_SOURCES) {
        console.warn(`⚠️ [PHASE 0] Limiting from ${sources.length} to ${MAX_SOURCES} most recent sources`);
        usedSources = sources.slice(0, MAX_SOURCES);
      }

      // Combine content from all sources
      for (const source of usedSources) {
        if (source.extracted_content) {
          const sanitizedContent = sanitizeString(source.extracted_content);
          combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
        }
      }

      // Truncate if content exceeds limit
      if (combinedContent.length > MAX_CONTENT_LENGTH) {
        console.warn(`⚠️ [PHASE 0] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} characters`);
        combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
      }
    }

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate summary');
    }

    // PHASE 1: Calculate adaptive summary strategy
    const strategyInfo = calculateSummaryStrategy(combinedContent);

    console.log(`📊 [PHASE 1] Summary strategy: ${strategyInfo.strategy}`);
    console.log(`ℹ️  [PHASE 1] ${strategyInfo.explanation}`);

    let parsed: any;

    if (strategyInfo.strategy === 'SINGLE') {
      // Strategy 1: Single complete summary
      const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie um resumo estruturado e completo para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie um título descritivo e atrativo para o resumo
2. Organize o conteúdo em HTML bem estruturado usando:
   - <h2> para seções principais
   - <h3> para subseções
   - <p> para parágrafos
   - <ul> e <li> para listas
   - <strong> para termos importantes
   - <em> para ênfase
3. Identifique os tópicos principais abordados
4. Seja claro, conciso mas completo
5. Mantenha a terminologia médica correta
6. Organize logicamente (introdução → conceitos → mecanismos → aplicações clínicas)

FORMATO DE SAÍDA (JSON estrito):
{
  "titulo": "Título do Resumo",
  "conteudo_html": "<h2>Seção 1</h2><p>Conteúdo...</p><h3>Subseção</h3><ul><li>Item 1</li><li>Item 2</li></ul>",
  "topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

      const response = await callGemini(prompt, 'gemini-2.5-pro', SAFE_OUTPUT_LIMIT);
      parsed = parseJsonFromResponse(response);
    } else if (strategyInfo.strategy === 'BATCHED') {
      // Strategy 2: Batched sections summary
      console.log(`🔄 [PHASE 1] Generating summary in sections...`);

      // Split content into chunks (approximately 25k chars each)
      const chunkSize = 25000;
      const chunks: string[] = [];
      for (let i = 0; i < combinedContent.length; i += chunkSize) {
        chunks.push(combinedContent.substring(i, i + chunkSize));
      }

      console.log(`📑 [PHASE 1] Split into ${chunks.length} sections`);

      const sectionSummaries: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkNum = i + 1;
        console.log(`🔄 [PHASE 1] [Seção ${chunkNum}/${chunks.length}] Generating section summary...`);

        const sectionPrompt = `Você é um professor especialista em medicina. Resuma esta seção do conteúdo de forma estruturada.

SEÇÃO ${chunkNum} DE ${chunks.length}:
${chunks[i]}

INSTRUÇÕES:
1. Crie um resumo estruturado em HTML desta seção
2. Use <h3> para subtítulos, <p> para parágrafos, <ul>/<li> para listas
3. Mantenha informações importantes e terminologia médica correta
4. Seja conciso mas completo

Retorne APENAS o HTML do resumo, sem texto adicional.`;

        const sectionResponse = await callGemini(sectionPrompt, 'gemini-2.5-flash', 4000);
        sectionSummaries.push(sectionResponse);
        console.log(`✅ [PHASE 1] [Seção ${chunkNum}/${chunks.length}] Section summary generated`);
      }

      // Combine section summaries
      console.log(`🔄 [PHASE 1] Combining section summaries...`);

      const combinePrompt = `Você é um professor especialista em medicina. Combine os resumos de seções abaixo em um resumo final estruturado e coerente.

RESUMOS DAS SEÇÕES:
${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n')}

INSTRUÇÕES:
1. Crie um título geral descritivo
2. Organize o conteúdo em HTML bem estruturado
3. Elimine redundâncias entre seções
4. Mantenha a estrutura lógica
5. Identifique os tópicos principais

FORMATO DE SAÍDA (JSON estrito):
{
  "titulo": "Título do Resumo Completo",
  "conteudo_html": "<h2>Seção 1</h2><p>Conteúdo combinado...</p>",
  "topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

      const combineResponse = await callGemini(combinePrompt, 'gemini-2.5-pro', SAFE_OUTPUT_LIMIT);
      parsed = parseJsonFromResponse(combineResponse);
      console.log(`✅ [PHASE 1] Combined summary generated`);
    } else {
      // Strategy 3: Executive summary (ultra-compressed)
      console.log(`🔄 [PHASE 1] Generating executive summary (ultra-compressed)...`);

      const executivePrompt = `Você é um professor especialista em medicina. Crie um RESUMO EXECUTIVO ultra-comprimido do conteúdo extenso abaixo.

CONTEÚDO (${combinedContent.length} caracteres):
${combinedContent.substring(0, 50000)}... [conteúdo extenso]

INSTRUÇÕES:
1. Crie um título descritivo
2. Foque APENAS nos conceitos mais importantes e essenciais
3. Organize em HTML usando <h2>, <p>, <ul>/<li>
4. Máximo de 3-4 seções principais
5. Seja extremamente conciso - este é um resumo executivo
6. Liste os tópicos principais cobertos

FORMATO DE SAÍDA (JSON estrito):
{
  "titulo": "Resumo Executivo: [Título]",
  "conteudo_html": "<h2>Conceitos Essenciais</h2><p>...</p>",
  "topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

      const response = await callGemini(executivePrompt, 'gemini-2.5-flash', 2500);
      parsed = parseJsonFromResponse(response);
      console.log(`✅ [PHASE 1] Executive summary generated`);
    }

    if (!parsed.titulo || !parsed.conteudo_html) {
      throw new Error('Invalid response format from AI');
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
