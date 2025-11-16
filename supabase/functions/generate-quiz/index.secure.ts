// SECURE VERSION: Generate Quiz Edge Function with all security layers
// This is an example showing how to implement all security best practices
// Copy this pattern to other Edge Functions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';
import {
  authenticateRequest,
  checkRateLimit,
  RATE_LIMITS,
  RateLimitError,
  securityHeaders,
  createSuccessResponse,
  createErrorResponse,
} from '../_shared/security.ts';
import {
  validateRequest,
  generateQuizSchema,
  ValidationError,
} from '../_shared/validation.ts';
import {
  getAuditLogger,
  AuditEventType,
} from '../_shared/audit.ts';

serve(async (req) => {
  const audit = getAuditLogger();
  const origin = req.headers.get('origin') || undefined;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...getCorsHeaders(origin),
        ...securityHeaders,
      },
    });
  }

  try {
    // ============================================
    // 1. RATE LIMITING
    // ============================================
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION);

    if (!rateLimitResult.allowed) {
      await audit.logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req,
        undefined,
        { remaining: rateLimitResult.remaining }
      );

      throw new RateLimitError(rateLimitResult.resetAt);
    }

    // ============================================
    // 2. AUTHENTICATION
    // ============================================
    const { user, supabaseClient } = await authenticateRequest(req);

    // ============================================
    // 3. INPUT VALIDATION
    // ============================================
    const validatedData = await validateRequest(req, generateQuizSchema);
    const { source_id, project_id, count } = validatedData;

    // ============================================
    // 4. AUTHORIZATION (Resource Ownership)
    // ============================================
    if (project_id) {
      const { data: project, error } = await supabaseClient
        .from('projects')
        .select('id, user_id')
        .eq('id', project_id)
        .eq('user_id', user.id)
        .single();

      if (error || !project) {
        await audit.logSecurity(
          AuditEventType.SECURITY_UNAUTHORIZED_ACCESS,
          req,
          user.id,
          { project_id, reason: 'not_owner' }
        );

        throw new Error('Project not found or unauthorized');
      }
    }

    // ============================================
    // 5. FETCH DATA (with ownership validation)
    // ============================================
    let sources = [];

    if (source_id) {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('id', source_id)
        .eq('user_id', user.id) // Ownership check
        .single();

      if (error) throw error;
      if (!data) throw new Error('Source not found or unauthorized');

      sources = [data];
    } else if (project_id) {
      const { data, error } = await supabaseClient
        .from('sources')
        .select('*')
        .eq('project_id', project_id)
        .eq('user_id', user.id) // Ownership check
        .eq('status', 'ready')
        .not('extracted_content', 'is', null);

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources available for quiz generation');
    }

    // ============================================
    // 6. BUSINESS LOGIC (AI Generation)
    // ============================================
    const combinedContext = sources
      .map((source: any) => `[Fonte: ${source.file_name}]\n${source.extracted_content}`)
      .join('\n\n---\n\n');

    const prompt = `Você é um professor especializado em medicina. Com base no conteúdo abaixo, crie ${count} questões de múltipla escolha no formato JSON.

MATERIAL DE ESTUDO:
${combinedContext}

INSTRUÇÕES:
1. Crie ${count} questões desafiadoras
2. 4 alternativas por questão (a, b, c, d)
3. Apenas uma alternativa correta
4. Inclua justificativa detalhada
5. Adicione uma dica útil

FORMATO JSON (array de objetos):
[{
  "pergunta": "texto da pergunta",
  "alternativas": {
    "a": "texto alternativa A",
    "b": "texto alternativa B",
    "c": "texto alternativa C",
    "d": "texto alternativa D"
  },
  "resposta_correta": "a" (ou b, c, d),
  "justificativa": "explicação detalhada da resposta",
  "dica": "dica para ajudar na resolução"
}]

Responda APENAS com o JSON, sem texto adicional.`;

    const aiResponse = await callGemini(prompt, 'gemini-2.5-flash');
    const questions = parseJsonFromResponse(aiResponse);

    // ============================================
    // 7. SAVE TO DATABASE
    // ============================================
    const questionsToInsert = questions.map((q: any) => ({
      project_id: project_id || sources[0].project_id,
      user_id: user.id,
      pergunta: q.pergunta,
      alternativas: q.alternativas,
      resposta_correta: q.resposta_correta,
      justificativa: q.justificativa || '',
      dica: q.dica || '',
    }));

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from('questions')
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    // ============================================
    // 8. AUDIT LOGGING
    // ============================================
    await audit.logAIGeneration(
      AuditEventType.AI_QUIZ_GENERATED,
      user.id,
      project_id || sources[0].project_id,
      req,
      {
        source_id,
        questions_count: questions.length,
        sources_used: sources.length,
      }
    );

    // ============================================
    // 9. SUCCESS RESPONSE
    // ============================================
    return createSuccessResponse({
      success: true,
      questions: insertedQuestions,
      count: insertedQuestions?.length || 0,
    });

  } catch (error) {
    // ============================================
    // 10. ERROR HANDLING
    // ============================================
    console.error('Error in generate-quiz function:', error);

    // Log error to audit if we have user context
    try {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const { user } = await authenticateRequest(req);
        await audit.logError(error as Error, user?.id, req, {
          endpoint: 'generate-quiz',
        });
      }
    } catch {
      // Ignore auth errors in error handler
    }

    // Handle specific error types
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify(error.toJSON()),
        {
          status: error.statusCode,
          headers: {
            ...getCorsHeaders(origin),
            ...securityHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (error instanceof RateLimitError) {
      return new Response(
        JSON.stringify(error.toJSON()),
        {
          status: error.statusCode,
          headers: {
            ...getCorsHeaders(origin),
            ...securityHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((error.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // Generic error response (hide details in production)
    return createErrorResponse(
      error as Error,
      500
    );
  }
});
