import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { securityHeaders, createErrorResponse, createSuccessResponse, RATE_LIMITS, checkRateLimit, authenticateRequest } from '../_shared/security.ts';
import { validateRequest, generateSummarySchema, sanitizeString, sanitizeHtml } from '../_shared/validation.ts';
import { AuditLogger, AuditEventType } from '../_shared/audit.ts';
import { callGemini, parseJsonFromResponse } from '../_shared/gemini.ts';

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
        .eq('status', 'ready');

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error('No sources found');
    }

    // Combine content from all sources
    let combinedContent = '';
    const sourceIds = [];
    for (const source of sources) {
      sourceIds.push(source.id);
      if (source.extracted_content) {
        // Sanitize content to prevent prompt injection
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizedContent}`;
      }
    }

    if (!combinedContent.trim()) {
      throw new Error('No content available to generate summary');
    }

    // Generate summary with Gemini
    const prompt = `Você é um professor especialista em medicina. Analise o conteúdo abaixo e crie um resumo estruturado e completo para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie um título descritivo e atrativo para o resumo
2. Organize o conteúdo em HTML bem estruturado usando:
   - <h2> para seções principais
   - <h3> para subseções
   - <p> para parágrafos
   - <ul> e <li> para listas
   - <strong> para termos importantes
   - <em> para ênfase
3. Identifique os tópicos principais abordados
4. Seja claro, conciso mas completo
5. Mantenha a terminologia médica correta
6. Organize logicamente (introdução → conceitos → mecanismos → aplicações clínicas)

FORMATO DE SAÍDA (JSON estrito):
{
  "titulo": "Título do Resumo",
  "conteudo_html": "<h2>Seção 1</h2><p>Conteúdo...</p><h3>Subseção</h3><ul><li>Item 1</li><li>Item 2</li></ul>",
  "topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

    const response = await callGemini(prompt, 'gemini-2.5-pro');
    const parsed = parseJsonFromResponse(response);

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
