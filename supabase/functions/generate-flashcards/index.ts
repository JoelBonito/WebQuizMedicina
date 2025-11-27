import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFlashcardsSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGeminiWithUsage, parseJsonFromResponse } from '../_shared/gemini.ts';
import { createContextCache, safeDeleteCache } from '../_shared/gemini-cache.ts';
import { validateOutputRequest, calculateBatchSizes, formatBatchProgress, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
import { logTokenUsage, type TokenUsage } from '../_shared/token-logger.ts';


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
        { endpoint: 'generate-flashcards', limit: RATE_LIMITS.AI_GENERATION.maxRequests }
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
        { reason: 'Invalid or missing token', endpoint: 'generate-flashcards' }
      );

      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateFlashcardsSchema);
    const { source_id, project_id, count, difficulty } = validatedData;

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

    // Validate that at least one source has extracted content
    const sourcesWithContent = sources.filter(s => s.extracted_content && s.extracted_content.trim());
    if (sourcesWithContent.length === 0) {
      const sourceStatuses = sources.map(s => `${s.name} (status: ${s.status})`).join(', ');
      throw new Error(`Sources found but no content available. Sources: ${sourceStatuses}. Please ensure sources have been processed and have status 'ready'.`);
    }

    // CRITICAL CHANGE: Flashcards now use FULL extracted_content (no embeddings/filtering)
    // Reason: Flashcards should cover ALL material studied, not filter to specific topics
    // Embeddings/semantic search would lose 70-80% of content, reducing coverage
    const sourceIds = sources.map(s => s.id);
    let combinedContent = '';

    console.log('📚 [Flashcards] Using full extracted_content (comprehensive coverage of all material)');

    // Combine ALL content from ALL sources (no filtering)
    // Limit to 5 most recent sources to keep input manageable (~300k chars / ~75k tokens)
    const MAX_SOURCES = 5;
    const usedSources = sourcesWithContent.slice(0, MAX_SOURCES);

    for (const source of usedSources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    // Truncate if content exceeds safe limit for input (~300k chars / ~75k tokens)
    const MAX_CONTENT_LENGTH = 300000;
    if (combinedContent.length > MAX_CONTENT_LENGTH) {
      console.warn(`⚠️ [Flashcards] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} chars`);
      combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
    }

    console.log(`📊 [Flashcards] Using ${usedSources.length} sources: ${combinedContent.length} chars (~${Math.ceil(combinedContent.length / 4)} tokens)`)

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate flashcards');
    }

    // PHASE 1: Validate output request and calculate batches
    const validation = validateOutputRequest('FLASHCARD', count);

    console.log(`📊 [PHASE 1] Flashcard generation request: ${count} items, estimated ${validation.estimatedTokens} tokens`);

    if (validation.needsBatching) {
      console.warn(`⚠️ [PHASE 1] ${validation.warning}`);
    }

    const batchSizes = calculateBatchSizes('FLASHCARD', count);
    const totalBatches = batchSizes.length;

    console.log(`🔄 [PHASE 1] Processing in ${totalBatches} batch(es): ${batchSizes.join(', ')} flashcards each`);

    // Generate a unique session_id for this flashcard generation
    const sessionId = crypto.randomUUID();
    console.log(`📝 [PHASE 1] Session ID: ${sessionId}`);

    // Generate flashcards in batches
    const allFlashcards: any[] = [];

    // Track token usage across all batches
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    // PHASE 1: Create context cache if multiple batches (saves ~95% on input tokens)
    let cacheName: string | null = null;
    const useCache = totalBatches > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${totalBatches} batches to save ~95% on input tokens`);

        const cacheContent = `CONTEÚDO MÉDICO BASE PARA GERAÇÃO DE FLASHCARDS:

${combinedContent}

---
Este conteúdo será usado como base para criar flashcards de medicina.
Todos os flashcards devem se basear EXCLUSIVAMENTE neste conteúdo.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600, // 10 minutes - enough for batch processing
            displayName: `flashcards-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // PHASE 2: Generate flashcards in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} flashcards...`);

        // Prompt WITHOUT content when using cache (content is in cache)
        // Prompt WITH content when NOT using cache (single batch)
        const prompt = `Você é um professor especialista em medicina. Analise o conteúdo ${useCache ? 'já fornecido no contexto' : 'abaixo'} e crie ${batchCount} flashcards de alta qualidade para estudantes de medicina.

IMPORTANTE: Toda a frente e verso dos flashcards devem ser em Português do Brasil.

${!useCache ? `CONTEÚDO:
${combinedContent}

` : ''}INSTRUÇÕES:
1. Cada flashcard deve ter uma FRENTE (pergunta/conceito) e VERSO (resposta/explicação)
2. Foque em conceitos-chave, definições, mecanismos e fatos importantes
3. A frente deve ser concisa e clara (pergunta ou termo)
4. O verso deve conter uma explicação completa mas sucinta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"${difficulty ? ` - IMPORTANTE: TODOS os flashcards devem ser de nível "${difficulty}"` : ''}
6. Identifique o tópico principal
7. Varie entre diferentes tipos: definições, mecanismos, comparações, aplicações clínicas
${totalBatches > 1 ? `8. Este é o lote ${batchNum} de ${totalBatches}. Varie os tópicos em relação aos lotes anteriores.` : ''}

FORMATO DE SAÍDA (JSON estrito):
{
  "flashcards": [
    {
      "frente": "Pergunta ou conceito aqui",
      "verso": "Resposta ou explicação detalhada aqui",
      "topico": "Nome do tópico principal",
      "dificuldade": "${difficulty || 'médio'}"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

        // Enable JSON mode to save tokens and ensure valid JSON output
        const result = await callGeminiWithUsage(
          prompt,
          'gemini-2.5-flash',
          SAFE_OUTPUT_LIMIT,
          true,
          cacheName || undefined // Use cache if available
        );

        // Accumulate token usage
        totalInputTokens += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;
        totalCachedTokens += result.usage.cachedTokens || 0;

        const parsed = parseJsonFromResponse(result.text);

        if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
          throw new Error(`Invalid response format from AI in batch ${batchNum}`);
        }

        allFlashcards.push(...parsed.flashcards);
        console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.flashcards.length} flashcards`);
      }

      console.log(`✅ [PHASE 1] Total flashcards generated: ${allFlashcards.length}`);

    } finally {
      // PHASE 3: Always cleanup cache (even if error occurs)
      if (cacheName) {
        await safeDeleteCache(cacheName);
      }
    }

    // Save all flashcards to database (sanitize all text fields)
    const flashcardsToInsert = allFlashcards.map((f: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      session_id: sessionId,
      frente: sanitizeString(f.frente || ''),
      verso: sanitizeString(f.verso || ''),
      topico: f.topico ? sanitizeString(f.topico) : null,
      dificuldade: ['fácil', 'médio', 'difícil'].includes(f.dificuldade) ? f.dificuldade : 'médio',
    }));

    const { data: insertedFlashcards, error: insertError } = await supabaseClient
      .from('flashcards')
      .insert(flashcardsToInsert)
      .select();

    if (insertError) throw insertError;

    // Log Token Usage for Admin Analytics
    await logTokenUsage(
      supabaseClient,
      user.id,
      project_id || sources[0].project_id,
      'flashcard',
      {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
      },
      'gemini-2.5-flash',
      {
        session_id: sessionId,
        flashcards_generated: insertedFlashcards.length,
        source_id: source_id,
      }
    );

    // Audit log: AI flashcard generation
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_FLASHCARDS_GENERATED,
      user.id,
      project_id || sources[0].project_id,
      req,
      {
        source_count: sources.length,
        flashcards_generated: insertedFlashcards.length,
        count_requested: count,
      }
    );

    return createSuccessResponse({
      success: true,
      count: insertedFlashcards.length,
      session_id: sessionId,
      flashcards: insertedFlashcards,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 400);
  }
});
