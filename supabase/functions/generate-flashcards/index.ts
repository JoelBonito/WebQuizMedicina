import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFlashcardsSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';
import { validateOutputRequest, calculateBatchSizes, formatBatchProgress, SAFE_OUTPUT_LIMIT } from '../_shared/output-limits.ts';
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
    const { source_id, project_id, count } = validatedData;

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

      // Define query optimized for flashcard generation
      const query = `Criar flashcards sobre conceitos médicos fundamentais, terminologia clínica, mecanismos fisiopatológicos, tratamentos, diagnósticos e aplicações práticas. Focar em definições, processos biológicos, comparações entre condições e procedimentos clínicos.`;

      // Get top 8 most relevant chunks (reduced from 15 to avoid MAX_TOKENS on input)
      const relevantChunks = await semanticSearch(
        supabaseClient,
        query,
        sourceIds,
        8 // top K - reduced to prevent prompt overflow
      );

      if (relevantChunks.length === 0) {
        console.warn('⚠️ [PHASE 2] No relevant chunks found, falling back to concatenation');
        // Fallback to old method
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

        // Safety check: truncate if content still too large
        const MAX_CONTENT_LENGTH = 50000; // ~12500 tokens - increased to accommodate more context with new 12k output limit
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
          console.warn(`⚠️ [PHASE 2] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} characters`);
          combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
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

    for (let i = 0; i < batchSizes.length; i++) {
      const batchCount = batchSizes[i];
      const batchNum = i + 1;

      console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} flashcards...`);

      const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie ${batchCount} flashcards de alta qualidade para estudantes de medicina.

IMPORTANTE: Toda a frente e verso dos flashcards devem ser em Português do Brasil.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Cada flashcard deve ter uma FRENTE (pergunta/conceito) e VERSO (resposta/explicação)
2. Foque em conceitos-chave, definições, mecanismos e fatos importantes
3. A frente deve ser concisa e clara (pergunta ou termo)
4. O verso deve conter uma explicação completa mas sucinta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"
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
      "dificuldade": "médio"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

      const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT);
      const parsed = parseJsonFromResponse(response);

      if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
        throw new Error(`Invalid response format from AI in batch ${batchNum}`);
      }

      allFlashcards.push(...parsed.flashcards);
      console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.flashcards.length} flashcards`);
    }

    console.log(`✅ [PHASE 1] Total flashcards generated: ${allFlashcards.length}`);

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
