import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFocusedSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGeminiWithUsage } from '../_shared/gemini.ts';
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
        { endpoint: 'generate-focused-summary', limit: RATE_LIMITS.AI_GENERATION.maxRequests }
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
        { reason: 'Invalid or missing token', endpoint: 'generate-focused-summary' }
      );

      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateFocusedSummarySchema);
    const { project_id } = validatedData;

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

    // Verify project ownership
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found or unauthorized' }),
        { status: 404, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's difficulties (not resolved, ordered by level)
    const { data: difficulties, error: difficultiesError } = await supabaseClient
      .from('difficulties')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })
      .limit(10);

    if (difficultiesError) {
      throw difficultiesError;
    }

    if (!difficulties || difficulties.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No difficulties found. Study with quiz and flashcards first to identify your weak points.'
        }),
        { status: 400, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all sources for this project
    const { data: sources, error: sourcesError } = await supabaseClient
      .from('sources')
      .select('id, name, extracted_content')
      .eq('project_id', project_id)
      .eq('status', 'ready')
      .not('extracted_content', 'is', null);

    if (sourcesError) {
      throw sourcesError;
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No sources available. Please upload and process sources first.'
        }),
        { status: 400, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build difficulty list for context
    const difficultiesList = difficulties
      .map((d, index) => {
        const stars = '⚠️'.repeat(Math.min(d.nivel, 5));
        const sanitizedTopic = sanitizeString(d.topico || 'Unknown');
        const sanitizedType = sanitizeString(d.tipo_origem || 'unknown');
        return `${index + 1}. ${sanitizedTopic} ${stars} (nível ${d.nivel}) - origem: ${sanitizedType}`;
      })
      .join('\n');

    const topTopics = difficulties.slice(0, 5).map(d => sanitizeString(d.topico));

    // OPTIMIZATION 1: Semantic search to reduce input tokens
    // Check if embeddings are available for semantic search
    const hasEmbeddings = await hasAnyEmbeddings(
      supabaseClient,
      sources.map(s => s.id)
    );

    let combinedContext: string;
    let actualTokensUsed = 0;
    let usedSemanticSearch = false;

    if (hasEmbeddings) {
      console.log('🔍 [SEMANTIC] Using semantic search for focused content');

      // Create search query from student's difficulties
      const searchQuery = difficulties
        .map(d => d.topico)
        .join(' ');

      console.log(`🎯 [SEMANTIC] Query: "${searchQuery.substring(0, 100)}..."`);

      // Fetch only relevant chunks (targeting 5k tokens instead of 13k+)
      const relevantChunks = await semanticSearchWithTokenLimit(
        supabaseClient,
        searchQuery,
        sources.map(s => s.id),
        5000, // Target 5k tokens (62% reduction from typical 13k)
        0.6   // Minimum 60% similarity
      );

      if (relevantChunks.length > 0) {
        actualTokensUsed = relevantChunks.reduce((sum, c) => sum + c.tokenCount, 0);

        combinedContext = relevantChunks
          .map((chunk, i) =>
            `[Trecho ${i+1} - Relevância ${(chunk.similarity * 100).toFixed(0)}%]\n${chunk.content}`
          )
          .join('\n\n---\n\n');

        usedSemanticSearch = true;
        console.log(`✅ [SEMANTIC] ${relevantChunks.length} relevant chunks (~${actualTokensUsed} tokens)`);
      } else {
        console.warn('⚠️ [SEMANTIC] No relevant chunks found, falling back to full sources');
        // Fallback to full sources
        combinedContext = sources
          .map((source) => {
            const sanitizedName = sanitizeString(source.name || 'Unknown');
            const sanitizedContent = sanitizeString(source.extracted_content || '');
            return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
          })
          .join('\n\n---\n\n');
      }
    } else {
      console.log('📚 [SOURCES] No embeddings available, using all sources');

      // Combine all sources (sanitize to prevent prompt injection)
      combinedContext = sources
        .map((source) => {
          const sanitizedName = sanitizeString(source.name || 'Unknown');
          const sanitizedContent = sanitizeString(source.extracted_content || '');
          return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
        })
        .join('\n\n---\n\n');
    }

    // OPTIMIZATION 2: Use project-level cache (reuse across operations)
    // Create or retrieve cached content for this project
    let cacheName: string | null = null;

    try {
      cacheName = await getOrCreateProjectCache(
        supabaseClient,
        project_id,
        'focused-summary-sources',
        combinedContext,
        'gemini-2.5-pro', // Cache works with Pro too!
        1800 // 30 minutes TTL
      );
    } catch (error) {
      console.warn('⚠️ [CACHE] Failed to create/retrieve cache, continuing without cache:', error);
      // Continue without cache rather than failing
    }

    // OPTIMIZATION 3: Optimized prompt (reduced from ~450 tokens to ~180 tokens)
    const prompt = `Você é professor médico criando material didático personalizado.

CONTEXTO: Aluno estudando "${sanitizeString(project.name)}" com ${difficulties.length} dificuldades identificadas.

${!cacheName ? `MATERIAL DISPONÍVEL:\n${combinedContext}\n\n` : ''}🎯 DIFICULDADES (por prioridade):
${difficultiesList}

TAREFA: Crie resumo didático FOCADO nos tópicos acima. Para CADA tópico inclua:
1. Explicação simples e clara (linguagem acessível)
2. Analogia ou exemplo prático
3. 3-5 pontos-chave para memorizar (frases curtas, dicas mnemônicas)
4. Aplicação clínica (se aplicável)
5. Conexões com outros conceitos

HTML: Use estrutura semântica:
- <div class="focused-summary"> container principal
- <div class="summary-header"> com h1, p.subtitle, p.meta
- <section class="difficulty-topic" data-nivel="X"> para cada tópico
- Dentro: divs com classes explanation, analogy, key-points, clinical-application, connections
- Use h2/h3 para títulos, <ul>/<li> para listas, <strong> para ênfase

INSTRUÇÕES:
- HTML válido e bem formatado
- PRIORIZE tópicos com mais ⚠️
- Seja DIDÁTICO, não técnico demais
- Tom encorajador e positivo
- Foque em COMPREENSÃO

Responda APENAS com HTML formatado.`;

    // Call Gemini Pro with optimized prompt and cache
    const result = await callGeminiWithUsage(
      prompt,
      'gemini-2.5-pro',
      undefined, // maxTokens (use default)
      undefined, // systemInstruction
      cacheName || undefined // Use cache if available
    );

    // Sanitize AI-generated HTML to prevent XSS
    const sanitizedHtml = sanitizeHtml(result.text);

    // Save the focused summary (with sanitized content)
    const { data: summary, error: summaryError } = await supabaseClient
      .from('summaries')
      .insert({
        project_id,
        titulo: `🎯 Resumo Focado nas Suas Dificuldades`,
        conteudo_html: sanitizedHtml,
        topicos: topTopics,
      })
      .select()
      .single();

    if (summaryError) {
      throw summaryError;
    }

    // Log Token Usage for Admin Analytics (with optimization metrics)
    await logTokenUsage(
      supabaseClient,
      user.id,
      project_id,
      'summary',
      {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cachedTokens: result.usage.cachedTokens || 0,
      },
      'gemini-2.5-pro',
      {
        summary_id: summary.id,
        summary_type: 'focused',
        difficulties_count: difficulties.length,
        sources_count: sources.length,
        used_semantic_search: usedSemanticSearch,
        semantic_tokens_used: usedSemanticSearch ? actualTokensUsed : null,
        used_cache: cacheName !== null,
        cache_hit: (result.usage.cachedTokens || 0) > 0,
      }
    );

    // Audit log: AI focused summary generation
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_SUMMARY_GENERATED,
      user.id,
      project_id,
      req,
      {
        summary_type: 'focused',
        difficulties_count: difficulties.length,
        sources_count: sources.length,
        summary_id: summary.id,
      }
    );

    return createSuccessResponse({
      success: true,
      summary,
      difficulties_count: difficulties.length,
      top_topics: topTopics,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 500);
  }
});
