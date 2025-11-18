import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, chatMessageSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini } from '../_shared/gemini.ts';
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

    // PHASE 2: Check if embeddings exist for semantic search
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    let combinedContext = '';

    if (useSemanticSearch) {
      // ✅ PHASE 2: Use semantic search with embeddings
      console.log('🎯 [PHASE 2] Using semantic search with embeddings for chat');

      // Use the user's message as the query for semantic search
      const sanitizedMessage = sanitizeString(message);

      // Get top 10 most relevant chunks for the user's question
      const relevantChunks = await semanticSearch(
        supabaseClient,
        sanitizedMessage,
        sourceIds,
        10 // top K - focused on user's question
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

    // Build prompt with RAG context
    let prompt = `Você é um assistente de estudos médicos especializado. Você tem acesso às seguintes fontes do projeto "${sanitizeString(project.name)}":\n\n${combinedContext}\n\n`;

    if (difficulties && difficulties.length > 0) {
      const topicsList = difficulties
        .map((d) => `- ${sanitizeString(d.topico)} (nível de dificuldade: ${d.nivel})`)
        .join('\n');
      prompt += `\nO aluno tem dificuldade nos seguintes tópicos:\n${topicsList}\n\n`;
      prompt += `Ao responder, considere essas dificuldades e ofereça explicações mais detalhadas nesses tópicos quando relevante.\n\n`;
    }

    prompt += `Pergunta do aluno: ${sanitizedMessage}\n\n`;
    prompt += `Instruções:
1. Responda APENAS com base nas fontes fornecidas acima
2. Se a informação não estiver nas fontes, diga claramente que não encontrou
3. Sempre cite a fonte (nome do arquivo) ao mencionar informações específicas
4. Use formatação markdown para melhor legibilidade
5. Se a pergunta relacionar-se com algum tópico de dificuldade do aluno, dê uma explicação mais detalhada
6. Seja didático e claro, usando exemplos quando apropriado

Resposta:`;

    // Call Gemini with RAG context
    const response = await callGemini(prompt, 'gemini-2.5-flash');

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

    // Save chat message to database (with sanitized content)
    const { error: messageError } = await supabaseClient.from('chat_messages').insert({
      project_id,
      user_id: user.id,
      message: sanitizedMessage,
      response: sanitizedResponse,
      sources_cited: citedSources.map((s) => s.id),
    });

    if (messageError) {
      console.error('Error saving message:', messageError);
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
      }
    );

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
