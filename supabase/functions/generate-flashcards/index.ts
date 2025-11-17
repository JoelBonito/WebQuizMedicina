import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateFlashcardsSchema, sanitizeString } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';

const auditLogger = new AuditLogger();
// Force re-deploy: CORS fixes in _shared/security.ts (2025-11-17)

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
      await auditLogger.logSecurity(
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
      await auditLogger.logAuth(
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
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // Combine content from all sources
    let combinedContent = '';
    for (const source of sources) {
      if (source.extracted_content) {
        // Sanitize content to prevent prompt injection
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate flashcards');
    }

    // Generate flashcards with Gemini
    const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie ${count} flashcards de alta qualidade para estudantes de medicina.

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

    const response = await callGemini(prompt);
    const parsed = parseJsonFromResponse(response);

    if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
      throw new Error('Invalid response format from AI');
    }

    // Save flashcards to database (sanitize all text fields)
    const flashcardsToInsert = parsed.flashcards.map((f: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
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
    await auditLogger.logAIGeneration(
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
      flashcards: insertedFlashcards,
    });
  } catch (error) {
    // Secure error response (no stack traces to client)
    return createErrorResponse(error as Error, 400);
  }
});
