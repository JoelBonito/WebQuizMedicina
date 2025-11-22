import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, chatMessageSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini } from '../_shared/gemini.ts';
import { hasAnyEmbeddings, semanticSearch } from '../_shared/embeddings.ts';
import { createContextCache, safeDeleteCache } from '../_shared/gemini-cache.ts';

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

// PHASE 2C: Background cache renewal function
// This runs asynchronously after responding to the user to prevent delays
async function renewCacheInBackground(
  userId: string,
  projectId: string,
  projectName: string,
  combinedContext: string,
  authHeader: string
) {
  try {
    console.log(`🔄 [BACKGROUND RENEWAL] Starting cache renewal for project ${projectId.substring(0, 8)}`);

    // Create new cache
    const cacheContent = `CONTEXTO DO PROJETO DE ESTUDOS MÉDICOS "${projectName}":

${combinedContext}

---
Este contexto contém as fontes de estudo do aluno e será usado para responder perguntas sobre medicina.
Todas as respostas devem se basear EXCLUSIVAMENTE neste conteúdo.`;

    const cacheInfo = await createContextCache(
      cacheContent,
      'gemini-2.5-flash',
      {
        ttlSeconds: 600, // 10 minutes
        displayName: `chat-renewed-${projectId.substring(0, 8)}`
      }
    );

    const newCacheName = cacheInfo.name;
    const expiresAt = new Date(cacheInfo.expireTime);

    console.log(`✅ [BACKGROUND RENEWAL] New cache created: ${newCacheName}`);

    // Update database with new cache
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { error: updateError } = await supabaseClient
      .from('chat_sessions')
      .update({
        cache_id: newCacheName,
        cache_expires_at: expiresAt.toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('project_id', projectId);

    if (updateError) {
      console.error('⚠️ [BACKGROUND RENEWAL] Failed to update session:', updateError);
    } else {
      console.log(`✅ [BACKGROUND RENEWAL] Cache renewed successfully, expires at ${expiresAt.toISOString()}`);
    }

    // Note: We don't delete the old cache immediately as it might still be in use
    // Let it expire naturally (TTL handles cleanup)

  } catch (error) {
    console.error('⚠️ [BACKGROUND RENEWAL] Error renewing cache:', error);
    // Non-critical: user already got their response
  }
}

// Force re-deploy: Fix AuditLogger lazy initialization with params (2025-11-18)

serve(async (req) => {
  // Handle CORS preflight - MUST return 200 OK immediately
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: securityHeaders
    });
  }

  try {
    // 1. Rate limiting (30 requests per minute for chat)
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.CHAT);
    if (!rateLimitResult.allowed) {
      await getAuditLogger().logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req,
        null,
        { endpoint: 'chat', limit: RATE_LIMITS.CHAT.maxRequests }
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
        { reason: 'Invalid or missing token', endpoint: 'chat' }
      );

      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, chatMessageSchema);
    const { message, project_id } = validatedData;

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

    // Get all sources for this project
    let { data: sources, error: sourcesError } = await supabaseClient
      .from('sources')
      .select('id, name, extracted_content, type, created_at')
      .eq('project_id', project_id)
      .eq('status', 'ready')
      .not('extracted_content', 'is', null)
      .order('created_at', { ascending: false }); // Most recent first

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

    // Get user's difficulties for context
    const { data: difficulties } = await supabaseClient
      .from('difficulties')
      .select('topico, nivel')
      .eq('user_id', user.id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })
      .limit(5);

    // PHASE 2: Get conversation history for context (last 2 exchanges = 4 messages)
    // This enables the bot to remember recent context without excessive token cost
    const { data: history } = await supabaseClient
      .from('chat_messages')
      .select('role, content')
      .eq('project_id', project_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4); // Last 4 messages = 2 user questions + 2 assistant answers

    console.log(`💬 [Chat] Retrieved ${history?.length || 0} previous messages for context`);

    // PHASE 2: Check if embeddings exist for semantic search
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    let combinedContext = '';

    if (useSemanticSearch) {
      // ✅ PHASE 2: Use semantic search with embeddings
      console.log('🎯 [PHASE 2] Using semantic search with embeddings for chat');

      // Use the user's message as the query for semantic search
      const sanitizedMessage = sanitizeString(message);

      // Get top 6 most relevant chunks for the user's question (reduced from 10 to avoid MAX_TOKENS)
      const relevantChunks = await semanticSearch(
        supabaseClient,
        sanitizedMessage,
        sourceIds,
        6 // top K - reduced to prevent prompt overflow
      );

      if (relevantChunks.length === 0) {
        console.warn('⚠️ [PHASE 2] No relevant chunks found, falling back to concatenation');
        useSemanticSearch = false;
      } else {
        // Build context from relevant chunks
        combinedContext = relevantChunks
          .map((chunk, idx) => {
            const similarity = (chunk.similarity * 100).toFixed(1);
            return `[Trecho ${idx + 1} - Relevância: ${similarity}%]\n${chunk.content}`;
          })
          .join('\n\n---\n\n');

        const avgSimilarity = (relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length * 100).toFixed(1);
        console.log(`✅ [PHASE 2] Using ${relevantChunks.length} relevant chunks (avg similarity: ${avgSimilarity}%)`);
        console.log(`📊 [PHASE 2] Total context: ${combinedContext.length} characters`);

        // Safety check: truncate if content still too large
        const MAX_CONTEXT_LENGTH = 25000; // ~6000 tokens - leaves room for conversation
        if (combinedContext.length > MAX_CONTEXT_LENGTH) {
          console.warn(`⚠️ [PHASE 2] Truncating context from ${combinedContext.length} to ${MAX_CONTEXT_LENGTH} characters`);
          combinedContext = combinedContext.substring(0, MAX_CONTEXT_LENGTH) + '\n\n[Contexto truncado para evitar limite de tokens]';
        }
      }
    }

    if (!useSemanticSearch) {
      // ⚠️ PHASE 0: Fallback to truncated concatenation (legacy method)
      console.warn('⚠️ [PHASE 0] No embeddings found. Using fallback method (truncated concatenation)');

      // OPTIMIZATION: Reduce fallback context from 40k to 20k chars (~5k tokens)
      // If question is very short (<20 chars), likely a greeting - use minimal context
      const isShortMessage = message.trim().length < 20;
      const MAX_SOURCES = isShortMessage ? 1 : 3;
      const MAX_CONTENT_LENGTH = isShortMessage ? 5000 : 20000; // Reduced from 40000 to save tokens

      if (isShortMessage) {
        console.log('💬 [PHASE 0] Short message detected, using minimal context');
      }

      let usedSources = sources;
      if (sources.length > MAX_SOURCES) {
        console.warn(`⚠️ [PHASE 0] Limiting from ${sources.length} to ${MAX_SOURCES} most recent sources`);
        usedSources = sources.slice(0, MAX_SOURCES);
      }

      // Combine all sources (sanitize to prevent prompt injection)
      combinedContext = usedSources
        .map((source) => {
          const sanitizedName = sanitizeString(source.name || 'Unknown');
          const sanitizedContent = sanitizeString(source.extracted_content || '');
          return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
        })
        .join('\n\n---\n\n');

      // Truncate if content exceeds limit
      if (combinedContext.length > MAX_CONTENT_LENGTH) {
        console.warn(`⚠️ [PHASE 0] Truncating context from ${combinedContext.length} to ${MAX_CONTENT_LENGTH} characters`);
        combinedContext = combinedContext.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
      }
    }

    // Sanitize user message to prevent prompt injection
    const sanitizedMessage = sanitizeString(message);

    // PHASE 2B: Persistent cache management for chat sessions
    // This enables cache reuse across multiple HTTP requests (different messages)
    // saving ~95% on input tokens for conversations with 2+ messages

    let cacheName: string | null = null;
    let shouldRenewCache = false; // PHASE 2C: Flag to trigger background renewal
    const CACHE_TTL_SECONDS = 600; // 10 minutes
    const CACHE_RENEWAL_THRESHOLD_SECONDS = 120; // Renew if < 2 minutes left

    try {
      // Step 1: Check if user has an active chat session with valid cache
      const { data: existingSession } = await supabaseClient
        .from('chat_sessions')
        .select('id, cache_id, cache_expires_at')
        .eq('user_id', user.id)
        .eq('project_id', project_id)
        .maybeSingle();

      const now = new Date();
      let needsNewCache = true;

      if (existingSession?.cache_id && existingSession?.cache_expires_at) {
        const expiresAt = new Date(existingSession.cache_expires_at);
        const secondsUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000;

        if (secondsUntilExpiry > 0) {
          // Cache still valid
          cacheName = existingSession.cache_id;
          needsNewCache = false;

          console.log(`♻️  [CACHE] Reusing existing cache: ${cacheName}`);
          console.log(`⏰ [CACHE] Expires in ${Math.round(secondsUntilExpiry)}s`);

          // PHASE 2C: Check if we should renew (cache close to expiring)
          if (secondsUntilExpiry < CACHE_RENEWAL_THRESHOLD_SECONDS) {
            shouldRenewCache = true;
            console.log(`🔄 [CACHE] Cache expiring soon (${Math.round(secondsUntilExpiry)}s left), will renew in background after response`);
          }
        } else {
          console.log(`⏰ [CACHE] Existing cache expired, creating new one`);
        }
      } else {
        console.log(`🆕 [CACHE] No existing cache found, creating new one`);
      }

      // Step 2: Create new cache if needed
      if (needsNewCache) {
        console.log(`💰 [CACHE] Creating persistent cache for chat session`);

        const cacheContent = `CONTEXTO DO PROJETO DE ESTUDOS MÉDICOS "${sanitizeString(project.name)}":

${combinedContext}

---
Este contexto contém as fontes de estudo do aluno e será usado para responder perguntas sobre medicina.
Todas as respostas devem se basear EXCLUSIVAMENTE neste conteúdo.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          'gemini-2.5-flash',
          {
            ttlSeconds: CACHE_TTL_SECONDS,
            displayName: `chat-${project_id.substring(0, 8)}`
          }
        );

        cacheName = cacheInfo.name;
        const expiresAt = new Date(cacheInfo.expireTime);

        console.log(`✅ [CACHE] New cache created: ${cacheName}`);
        console.log(`⏰ [CACHE] Expires at: ${expiresAt.toISOString()}`);

        // Step 3: Save/update cache in database
        const { error: upsertError } = await supabaseClient
          .from('chat_sessions')
          .upsert({
            user_id: user.id,
            project_id: project_id,
            cache_id: cacheName,
            cache_expires_at: expiresAt.toISOString(),
            last_activity_at: now.toISOString(),
          }, {
            onConflict: 'user_id,project_id' // Update if exists
          });

        if (upsertError) {
          console.error('⚠️ [CACHE] Failed to save session to database:', upsertError);
          // Non-critical: cache still works, just won't be reused next time
        } else {
          console.log(`✅ [CACHE] Session saved to database for future reuse`);
        }
      } else {
        // Step 4: Update last_activity_at for existing session
        const { error: updateError } = await supabaseClient
          .from('chat_sessions')
          .update({
            last_activity_at: now.toISOString(),
          })
          .eq('user_id', user.id)
          .eq('project_id', project_id);

        if (updateError) {
          console.error('⚠️ [CACHE] Failed to update session activity:', updateError);
          // Non-critical
        }
      }

    } catch (cacheError) {
      console.error('⚠️ [CACHE] Error managing cache, proceeding without cache:', cacheError);
      cacheName = null; // Fallback: no cache
    }

    // Build prompt with RAG context
    // IMPORTANT: If using cache, DON'T include combinedContext (it's in the cache)
    let prompt = '';

    if (cacheName) {
      // Using cache: context already in cache, only send instructions
      prompt = `Você é um assistente de estudos médicos especializado respondendo perguntas sobre o projeto "${sanitizeString(project.name)}".\n\n`;
      console.log(`📊 [CACHE] Building prompt WITHOUT context (using cached content)`);
    } else {
      // No cache: include full context in prompt
      prompt = `Você é um assistente de estudos médicos especializado. Você tem acesso às seguintes fontes do projeto "${sanitizeString(project.name)}":\n\n${combinedContext}\n\n`;
      console.log(`📊 [NO CACHE] Building prompt WITH full context`);
    }

    if (difficulties && difficulties.length > 0) {
      const topicsList = difficulties
        .map((d) => `- ${sanitizeString(d.topico)} (nível de dificuldade: ${d.nivel})`)
        .join('\n');
      prompt += `\nO aluno tem dificuldade nos seguintes tópicos:\n${topicsList}\n\n`;
      prompt += `Ao responder, considere essas dificuldades e ofereça explicações mais detalhadas nesses tópicos quando relevante.\n\n`;
    }

    // PHASE 2: Include conversation history for context (if available)
    if (history && history.length > 0) {
      // Reverse to chronological order (oldest first)
      const chronologicalHistory = [...history].reverse();

      // Format conversation history
      const formattedHistory = chronologicalHistory
        .map((msg) => {
          const roleLabel = msg.role === 'user' ? 'Aluno' : 'Assistente';
          const content = sanitizeString(msg.content || '');
          return `${roleLabel}: ${content}`;
        })
        .join('\n\n');

      prompt += `\nHistórico recente da conversa:\n${formattedHistory}\n\n`;
      prompt += `IMPORTANTE: Use este histórico para entender o contexto da conversa atual. Se o aluno fizer referência a algo mencionado anteriormente (por exemplo: "explique melhor", "e sobre o que você disse antes"), use o histórico para responder adequadamente.\n\n`;

      console.log(`💬 [Chat] Including ${history.length} messages in conversation history`);
    }

    prompt += `Pergunta atual do aluno: ${sanitizedMessage}\n\n`;
    prompt += `Instruções:
0. IMPORTANTE: Responda SEMPRE em Português do Brasil
1. Responda APENAS com base nas fontes fornecidas acima
2. Se a informação não estiver nas fontes, diga claramente que não encontrou
3. Sempre cite a fonte (nome do arquivo) ao mencionar informações específicas
4. Use formatação markdown para melhor legibilidade:
   - Organize o texto em parágrafos curtos e bem espaçados
   - Use quebras de linha entre parágrafos para facilitar a leitura
   - Use listas quando apropriado
   - Use negrito para termos importantes
   - Use títulos (##) para separar seções quando necessário
5. Escreva de forma clara e amigável, como se estivesse conversando diretamente com o aluno
6. Se a pergunta relacionar-se com algum tópico de dificuldade do aluno, dê uma explicação mais detalhada
7. Seja didático e claro, usando exemplos quando apropriado

Resposta:`;

    // Call Gemini with RAG context (and cached content if available)
    const response = await callGemini(
      prompt,
      'gemini-2.5-flash',
      8192, // maxOutputTokens - reasonable for chat responses
      false, // jsonMode - not needed for chat (free-form response)
      cacheName || undefined // Use cache if available
    );

    // Sanitize AI response before storing
    const sanitizedResponse = sanitizeString(response);

    // Extract sources mentioned (simple approach - match file names in response)
    const citedSources = sources
      .filter((source) => sanitizedResponse.toLowerCase().includes(source.name.toLowerCase()))
      .map((source) => ({
        id: source.id,
        file_name: source.name,  // Keep as file_name for response interface compatibility
        file_type: source.type,  // Keep as file_type for response interface compatibility
      }));

    // Save chat messages to database (with sanitized content)
    // Insert user message
    const { error: userMessageError } = await supabaseClient.from('chat_messages').insert({
      project_id,
      user_id: user.id,
      role: 'user',
      content: sanitizedMessage,
      sources_cited: null,
    });

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError);
    }

    // Insert assistant response
    const { error: assistantMessageError } = await supabaseClient.from('chat_messages').insert({
      project_id,
      user_id: user.id,
      role: 'assistant',
      content: sanitizedResponse,
      sources_cited: citedSources.length > 0 ? citedSources.map((s) => s.id) : null,
    });

    if (assistantMessageError) {
      console.error('Error saving assistant message:', assistantMessageError);
      // Don't throw - still return the response
    }

    // Check if response suggests topics related to difficulties
    const suggestedTopics = difficulties
      ? difficulties
          .filter((d) => sanitizedResponse.toLowerCase().includes(d.topico.toLowerCase()))
          .map((d) => d.topico)
      : [];

    // Audit log: AI chat message
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_CHAT_MESSAGE,
      user.id,
      project_id,
      req,
      {
        message_length: message.length,
        sources_count: sources.length,
        cited_sources_count: citedSources.length,
        has_difficulties_context: difficulties && difficulties.length > 0,
        has_conversation_history: history && history.length > 0, // PHASE 2: Track if history was used
        history_messages_count: history?.length || 0, // PHASE 2: How many messages in history
        used_persistent_cache: cacheName !== null, // PHASE 2B: Track if cache was used
        cache_reused: cacheName !== null && !cacheName.includes('new'), // Approximate: if cache exists, likely reused
        cache_renewal_triggered: shouldRenewCache, // PHASE 2C: Track if background renewal was triggered
      }
    );

    // PHASE 2C: Trigger background cache renewal if needed
    // This runs asynchronously and doesn't block the response to the user
    if (shouldRenewCache) {
      // Fire-and-forget: start renewal but don't wait for it
      renewCacheInBackground(
        user.id,
        project_id,
        sanitizeString(project.name),
        combinedContext,
        req.headers.get('Authorization')!
      ).catch((error) => {
        console.error('⚠️ [CACHE RENEWAL] Background renewal failed:', error);
        // Non-critical: user already got their response
      });
    }

    return createSuccessResponse({
      response: sanitizedResponse,
      cited_sources: citedSources,
      suggested_topics: suggestedTopics,
      has_difficulties_context: difficulties && difficulties.length > 0,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 500);
  }
});
