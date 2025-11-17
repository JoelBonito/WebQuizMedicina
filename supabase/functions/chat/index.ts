import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, chatMessageSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini } from '../_shared/gemini.ts';

const auditLogger = new AuditLogger();

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
      await auditLogger.logSecurity(
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
      await auditLogger.logAuth(
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
    const { data: sources, error: sourcesError } = await supabaseClient
      .from('sources')
      .select('id, file_name, extracted_content, file_type')
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

    // Get user's difficulties for context
    const { data: difficulties } = await supabaseClient
      .from('difficulties')
      .select('topico, nivel')
      .eq('user_id', user.id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })
      .limit(5);

    // Simple RAG: Combine all sources (sanitize to prevent prompt injection)
    const combinedContext = sources
      .map((source) => {
        const sanitizedName = sanitizeString(source.file_name || 'Unknown');
        const sanitizedContent = sanitizeString(source.extracted_content || '');
        return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
      })
      .join('\n\n---\n\n');

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
      .filter((source) => sanitizedResponse.toLowerCase().includes(source.file_name.toLowerCase()))
      .map((source) => ({
        id: source.id,
        file_name: source.file_name,
        file_type: source.file_type,
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
    await auditLogger.logAIGeneration(
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
