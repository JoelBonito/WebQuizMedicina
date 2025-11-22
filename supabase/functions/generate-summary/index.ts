import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGeminiWithUsage, parseJsonFromResponse } from '../_shared/gemini.ts';
import { calculateSummaryStrategy, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
import { logTokenUsage } from '../_shared/token-logger.ts';
import { hasAnyEmbeddings, semanticSearchWithTokenLimit } from '../_shared/embeddings.ts';
import { getOrCreateProjectCache } from '../_shared/project-cache.ts';

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

      // PHASE 3: Use token-based limit instead of fixed chunk count (20k tokens for summary - needs comprehensive coverage)
      const relevantChunks = await semanticSearchWithTokenLimit(
        supabaseClient,
        query,
        sourceIds,
        20000 // Max tokens instead of fixed chunk count
      );

      if (relevantChunks.length === 0) {
        console.warn('⚠️ [PHASE 3] No relevant chunks found, falling back to concatenation');
        useSemanticSearch = false;
      } else {
        // Build context from relevant chunks
        console.log(`📊 [Summary] Using ${relevantChunks.length} chunks (${relevantChunks.reduce((sum, c) => sum + c.tokenCount, 0)} tokens)`);
        combinedContent = relevantChunks
          .map((chunk, idx) => {
            const similarity = (chunk.similarity * 100).toFixed(1);
            return `[Trecho ${idx + 1} - Relevância: ${similarity}%]\n${chunk.content}`;
          })
          .join('\n\n---\n\n');

        const avgSimilarity = (relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length * 100).toFixed(1);
        console.log(`✅ [PHASE 2] Using ${relevantChunks.length} relevant chunks (avg similarity: ${avgSimilarity}%)`);
        console.log(`📊 [PHASE 2] Total content: ${combinedContent.length} characters`);

        // Safety check: truncate if content still too large
        // Reduced from 50k to 40k chars (~10k tokens) to prevent MAX_TOKENS errors
        // This ensures safe margin for 8k output tokens even with large inputs
        const MAX_SEMANTIC_CONTENT = 40000;
        if (combinedContent.length > MAX_SEMANTIC_CONTENT) {
          console.warn(`⚠️ [PHASE 2] Truncating content from ${combinedContent.length} to ${MAX_SEMANTIC_CONTENT} characters`);
          combinedContent = combinedContent.substring(0, MAX_SEMANTIC_CONTENT) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
        }
      }
    }

    if (!useSemanticSearch) {
      // ⚠️ PHASE 0: Fallback to truncated concatenation (legacy method)
      console.warn('⚠️ [PHASE 0] No embeddings found. Using fallback method (truncated concatenation)');

      const MAX_SOURCES = 3;
      // Reduced from 60k to 40k chars (~10k tokens) to prevent MAX_TOKENS errors
      // This ensures safe margin for 8k output tokens even with large inputs
      const MAX_CONTENT_LENGTH = 40000;

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
      // CRITICAL: Limit to 35k to ensure 2 sections max (35k/20k chunks = 1.75 ≈ 2)
      // 2 sections × 25s + 1 combine × 20s = ~70s (close to 60s limit, but acceptable)
      // Reduced from 40k to 35k for safety margin
      const SAFE_MAX_FOR_TIMEOUT = 35000;
      if (combinedContent.length > SAFE_MAX_FOR_TIMEOUT) {
        console.warn(`⚠️ [PHASE 0] Truncating content from ${combinedContent.length} to ${SAFE_MAX_FOR_TIMEOUT} characters (timeout safety)`);
        combinedContent = combinedContent.substring(0, SAFE_MAX_FOR_TIMEOUT) + '\n\n[Conteúdo truncado para evitar timeout]';
      }
    }

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
      // Optimized prompt with JSON mode (no need for verbose formatting instructions)
      const prompt = `Você é um professor especialista em medicina. Crie um resumo estruturado e completo do conteúdo abaixo.

CONTEÚDO:
${combinedContent}

ESTRUTURA:
- Título descritivo e atrativo
- HTML organizado: <h2> seções, <h3> subseções, <p> parágrafos, <ul><li> listas, <strong> termos importantes
- Lógica: introdução → conceitos → mecanismos → aplicações clínicas
- Identifique tópicos principais
- Terminologia médica correta, Português do Brasil

JSON:
{
  "titulo": "string",
  "conteudo_html": "string (HTML)",
  "topicos": ["string", ...]
}`;

      // Use 8000 tokens for SINGLE (safe for content < 30k)
      const result = await callGeminiWithUsage(prompt, 'gemini-2.5-flash', 8000, true);

      // Track token usage
      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalCachedTokens += result.usage.cachedTokens || 0;

      parsed = parseJsonFromResponse(result.text);
    } else {
      // Strategy 2: Batched sections summary
      console.log(`🔄 [PHASE 1] Generating summary in sections...`);

      // Split content into larger chunks to stay under 60s timeout
      // 20k chars (~5k tokens input) with 12k output limit = ~25-30s per section
      // Fewer chunks = faster processing while maintaining quality
      const chunkSize = 20000;
      const chunks: string[] = [];
      for (let i = 0; i < combinedContent.length; i += chunkSize) {
        chunks.push(combinedContent.substring(i, i + chunkSize));
      }

      console.log(`📑 [PHASE 1] Split into ${chunks.length} sections`);

      const sectionSummaries: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkNum = i + 1;
        console.log(`🔄 [PHASE 1] [Seção ${chunkNum}/${chunks.length}] Generating section summary...`);

        const sectionPrompt = `Você é um professor especialista em medicina. Crie um resumo COMPLETO e DETALHADO desta seção do conteúdo.

SEÇÃO ${chunkNum} DE ${chunks.length}:
${chunks[i]}

INSTRUÇÕES:
1. Crie um resumo estruturado em HTML com TODO o conteúdo importante
2. Use <h3> para subtítulos principais, <h4> para subtópicos se necessário
3. Use <p> para parágrafos explicativos, <ul>/<li> para listas de conceitos
4. Use <strong> para destacar termos médicos importantes
5. Mantenha: conceitos fundamentais, mecanismos, processos, terminologia, aplicações clínicas
6. Seja ABRANGENTE - este é material educacional médico, não um resumo superficial
7. Todo o conteúdo em Português do Brasil

IMPORTANTE: NÃO omita detalhes importantes. Seja completo e educativo.

Retorne APENAS o HTML do resumo detalhado, sem texto adicional.`;

        // Based on empirical data: sections generate 2200-4800 tokens (avg ~3500)
        // Use 6000 as safe upper limit (allows for variance)
        const sectionResult = await callGeminiWithUsage(sectionPrompt, 'gemini-2.5-flash', 6000);

        // Track token usage
        totalInputTokens += sectionResult.usage.inputTokens;
        totalOutputTokens += sectionResult.usage.outputTokens;
        totalCachedTokens += sectionResult.usage.cachedTokens || 0;

        sectionSummaries.push(sectionResult.text);
        console.log(`✅ [PHASE 1] [Seção ${chunkNum}/${chunks.length}] Section summary generated`);
      }

      // Combine section summaries
      console.log(`🔄 [PHASE 1] Combining section summaries...`);

      // Optimized: Use Flash instead of Pro for combining (10x cheaper, sufficient for formatting task)
      const combinePrompt = `Você é um professor especialista em medicina. Combine os resumos de seção abaixo em um resumo final COMPLETO, estruturado e coerente.

RESUMOS DAS SEÇÕES:
${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n')}

INSTRUÇÕES IMPORTANTES:
1. Mantenha TODO o conteúdo importante de todas as seções
2. Organize em uma estrutura lógica e fluida com <h2> para seções principais, <h3> para subseções
3. Use <p> para parágrafos, <ul>/<li> para listas, <strong> para termos importantes
4. Elimine apenas repetições óbvias, mas preserve detalhes clínicos, mecanismos, terminologia
5. Crie um título descritivo que reflita o conteúdo completo
6. Liste os principais tópicos abordados
7. Todo o conteúdo em Português do Brasil

IMPORTANTE: Este é um resumo médico educacional. Seja ABRANGENTE e DETALHADO, não superficial.

JSON:
{
  "titulo": "string",
  "conteudo_html": "string (HTML completo e detalhado)",
  "topicos": ["string", ...]
}`;

      // Based on empirical data: combination generates ~8600 tokens for 4 sections
      // For 2-3 sections, 10000 tokens provides safe headroom
      const combineResult = await callGeminiWithUsage(combinePrompt, 'gemini-2.5-flash', 10000, true);

      // Track token usage
      totalInputTokens += combineResult.usage.inputTokens;
      totalOutputTokens += combineResult.usage.outputTokens;
      totalCachedTokens += combineResult.usage.cachedTokens || 0;

      parsed = parseJsonFromResponse(combineResult.text);
      console.log(`✅ [PHASE 1] Combined summary generated`);
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
