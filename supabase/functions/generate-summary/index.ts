import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';
import { calculateSummaryStrategy, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
import { hasAnyEmbeddings, semanticSearchWithTokenLimit } from '../_shared/embeddings.ts';

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
        const MAX_SEMANTIC_CONTENT = 50000; // ~12500 tokens - increased to accommodate more context with new 12k output limit
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
      const MAX_CONTENT_LENGTH = 60000; // ~15k tokens - increased to accommodate more context with new 12k output limit

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

      // Use Flash instead of Pro for single summaries (10x cheaper, same quality for this task)
      const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT, true);
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

IMPORTANTE: Todo o conteúdo deve ser em Português do Brasil.

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

      // Optimized: Use Flash instead of Pro for combining (10x cheaper, sufficient for formatting task)
      const combinePrompt = `Combine os resumos abaixo em um resumo final estruturado e coerente.

RESUMOS:
${sectionSummaries.map((s, i) => `\n=== SEÇÃO ${i + 1} ===\n${s}`).join('\n')}

REGRAS:
- Título geral descritivo
- HTML bem estruturado
- Elimine redundâncias
- Identifique tópicos principais
- Português do Brasil

JSON:
{
  "titulo": "string",
  "conteudo_html": "string (HTML)",
  "topicos": ["string", ...]
}`;

      // OPTIMIZATION: Flash instead of Pro saves ~90% cost (sufficient for combining/formatting)
      const combineResponse = await callGemini(combinePrompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT, true);
      parsed = parseJsonFromResponse(combineResponse);
      console.log(`✅ [PHASE 1] Combined summary generated`);
    } else {
      // Strategy 3: Executive summary (ultra-compressed)
      console.log(`🔄 [PHASE 1] Generating executive summary (ultra-compressed)...`);

      // Optimized executive summary with JSON mode
      const executivePrompt = `Crie um RESUMO EXECUTIVO ultra-comprimido do conteúdo extenso.

CONTEÚDO (${combinedContent.length} chars):
${combinedContent.substring(0, 50000)}

REGRAS:
- Título descritivo com "Resumo Executivo:"
- APENAS conceitos essenciais
- HTML: <h2>, <p>, <ul><li>
- Máximo 3-4 seções
- Extremamente conciso
- Português do Brasil

JSON:
{
  "titulo": "string",
  "conteudo_html": "string (HTML)",
  "topicos": ["string", ...]
}`;

      const response = await callGemini(executivePrompt, 'gemini-2.5-flash', 2500, true);
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
