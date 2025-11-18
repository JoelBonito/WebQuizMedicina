import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authenticateRequest,
  checkRateLimit,
  createErrorResponse,
  createSuccessResponse,
  getSecurityHeaders,
  RATE_LIMITS,
} from "../_shared/security.ts";
import {
  generateQuizSchema,
  sanitizeString,
  validateRequest,
} from "../_shared/validation.ts";
import { AuditEventType, AuditLogger } from "../_shared/audit.ts";
import { callGemini, parseJsonFromResponse } from "../_shared/gemini.ts";

// Lazy-initialize AuditLogger to avoid crashes if env vars are missing
let auditLogger: AuditLogger | null = null;
function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    auditLogger = new AuditLogger(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
  }
  return auditLogger;
}

// CORS configuration - defined at top level to avoid any dependency issues
const ALLOWED_ORIGINS = [
  "https://web-quiz-medicina.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Standalone CORS headers function for OPTIONS - no dependencies, always works
function getCorsHeadersForPreflight(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req) => {
  // Handle CORS preflight - MUST return 200 OK immediately
  // This handler is completely independent and will never throw errors
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeadersForPreflight(req),
    });
  }

  try {
    // 1. Rate limiting
    const rateLimitResult = await checkRateLimit(
      req,
      RATE_LIMITS.AI_GENERATION,
    );
    if (!rateLimitResult.allowed) {
      await getAuditLogger().logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req,
        null,
        {
          endpoint: "generate-quiz",
          limit: RATE_LIMITS.AI_GENERATION.maxRequests,
        },
      );

      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            ...getSecurityHeaders(req),
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(
              Math.ceil((rateLimitResult.retryAfter || 60000) / 1000),
            ),
          },
        },
      );
    }

    // 2. Authentication
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      await getAuditLogger().logAuth(
        AuditEventType.AUTH_FAILED_LOGIN,
        null,
        req,
        { reason: "Invalid or missing token", endpoint: "generate-quiz" },
      );

      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...getSecurityHeaders(req),
            "Content-Type": "application/json",
          },
        },
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateQuizSchema);
    const { source_id, project_id, count } = validatedData;

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    let sources = [];

    // Fetch source(s)
    if (source_id) {
      const { data, error } = await supabaseClient
        .from("sources")
        .select("*")
        .eq("id", source_id)
        .single();

      if (error) throw error;
      sources = [data];
    } else if (project_id) {
      const { data, error } = await supabaseClient
        .from("sources")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "ready");

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error("No sources found");
    }

    // Combine content from all sources
    let combinedContent = "";
    for (const source of sources) {
      if (source.extracted_content) {
        const sanitizedContent = sanitizeString(source.extracted_content);
        combinedContent += `\n\n=== ${
          sanitizeString(source.name)
        } ===\n${sanitizedContent}`;
      }
    }

    if (!combinedContent.trim()) {
      throw new Error("No content available to generate quiz");
    }

    // Generate quiz with Gemini
    const prompt =
      `Você é um professor especialista em medicina. Analise o conteúdo abaixo e gere ${count} perguntas de múltipla escolha de alta qualidade para estudantes de medicina.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES:
1. Crie perguntas que testem compreensão profunda, não apenas memorização
2. Cada pergunta deve ter 4 alternativas (A, B, C, D)
3. Apenas UMA alternativa deve estar correta
4. Forneça uma justificativa clara e educativa para a resposta correta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"
6. Identifique o tópico principal da pergunta
7. Quando apropriado, forneça uma dica que ajude sem revelar a resposta

FORMATO DE SAÍDA (JSON estrito):
{
  "perguntas": [
    {
      "pergunta": "Texto da pergunta aqui?",
      "opcoes": ["A) Primeira opção", "B) Segunda opção", "C) Terceira opção", "D) Quarta opção"],
      "resposta_correta": "A",
      "justificativa": "Explicação detalhada do porquê esta é a resposta correta e por que as outras estão erradas.",
      "dica": "Uma dica útil sem revelar a resposta",
      "topico": "Nome do tópico principal",
      "dificuldade": "médio"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

    // Use higher token limit for quiz to avoid truncation (quizzes can be long)
    const response = await callGemini(prompt, 'gemini-2.5-flash', 16384);
    const parsed = parseJsonFromResponse(response);

    if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
      throw new Error("Invalid response format from AI");
    }

    // Save questions to database
    const questionsToInsert = parsed.perguntas.map((q: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      pergunta: sanitizeString(q.pergunta || ""),
      opcoes: Array.isArray(q.opcoes)
        ? q.opcoes.map((opt: string) => sanitizeString(opt))
        : [],
      resposta_correta: sanitizeString(q.resposta_correta || ""),
      justificativa: sanitizeString(q.justificativa || ""),
      dica: q.dica ? sanitizeString(q.dica) : null,
      topico: q.topico ? sanitizeString(q.topico) : null,
      dificuldade: ["fácil", "médio", "difícil"].includes(q.dificuldade)
        ? q.dificuldade
        : "médio",
    }));

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from("questions")
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    // Audit log
    await getAuditLogger().logAIGeneration(
      AuditEventType.AI_QUIZ_GENERATED,
      user.id,
      project_id || sources[0].project_id,
      req,
      {
        source_count: sources.length,
        questions_generated: insertedQuestions.length,
        count_requested: count,
      },
    );

    return createSuccessResponse(
      {
        success: true,
        count: insertedQuestions.length,
        questions: insertedQuestions,
      },
      200,
      req,
    );
  } catch (error) {
    return createErrorResponse(error as Error, 400, req);
  }
});
