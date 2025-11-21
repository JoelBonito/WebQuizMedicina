import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
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
import { validateOutputRequest, calculateBatchSizes, formatBatchProgress, SAFE_OUTPUT_LIMIT } from "../_shared/output-limits.ts";
import { hasAnyEmbeddings, semanticSearch } from "../_shared/embeddings.ts";

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

// CORS configuration
const ALLOWED_ORIGINS = [
  "https://web-quiz-medicina.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "*" // Permissivo para evitar bloqueios durante desenvolvimento/testes
];

function getCorsHeadersForPreflight(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req) => {
  // 0. Handle CORS preflight - MUST return 200 OK immediately
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeadersForPreflight(req),
    });
  }

  try {
    // 1. Rate limiting
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        {
          status: 429,
          headers: {
            ...getCorsHeadersForPreflight(req),
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateLimitResult.retryAfter || 60000) / 1000)),
          },
        },
      );
    }

    // 2. Authentication
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
        },
      );
    }

    const user = authResult.user;

    // 3. Input validation
    const validatedData = await validateRequest(req, generateQuizSchema);
    const { source_id, project_id, count, difficulty } = validatedData;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    let sources = [];

    // Fetch source(s)
    if (source_id) {
      const { data, error } = await supabaseClient.from("sources").select("*").eq("id", source_id).single();
      if (error) throw error;
      sources = [data];
    } else if (project_id) {
      const { data, error } = await supabaseClient.from("sources").select("*").eq("project_id", project_id).eq("status", "ready").order("created_at", { ascending: false });
      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) throw new Error("No sources found");

    // PHASE 2: Prepare Content
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);
    let combinedContent = "";
    let avgSimilarity: number | null = null;

    if (useSemanticSearch) {
      try {
        const query = `Gerar questões de múltipla escolha sobre conceitos médicos, casos clínicos, diagnósticos diferenciais, tratamentos.`;
        const relevantChunks = await semanticSearch(supabaseClient, query, sourceIds, 8);

        if (relevantChunks.length > 0) {
          combinedContent = relevantChunks.map((chunk, idx) => chunk.content).join('\n\n---\n\n');
          avgSimilarity = relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length;
        } else {
          useSemanticSearch = false;
        }
      } catch (e) {
        console.warn("Semantic search failed, falling back:", e);
        useSemanticSearch = false;
      }
    }

    if (!useSemanticSearch || !combinedContent) {
      const MAX_SOURCES = 3;
      const MAX_CONTENT_LENGTH = 30000;
      let usedSources = sources.slice(0, MAX_SOURCES);
      
      for (const source of usedSources) {
        if (source.extracted_content) {
          combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
        }
      }
      
      if (combinedContent.length > MAX_CONTENT_LENGTH) {
        combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
      }
    }

    if (!combinedContent.trim()) throw new Error("No content available");

    // PHASE 3: Generate Quiz
    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const sessionId = crypto.randomUUID();
    const allQuestions: any[] = [];

    for (let i = 0; i < batchSizes.length; i++) {
      const batchCount = batchSizes[i];
      
      // PROMPT CORRIGIDO: Proíbe estritamente outros tipos de pergunta
      const prompt = `Você é um professor universitário de medicina.
Gere ${batchCount} questões de Múltipla Escolha baseadas no conteúdo abaixo.

CONTEÚDO:
${combinedContent.substring(0, 30000)}

REGRAS RÍGIDAS (Siga ou a geração falhará):
1. Crie APENAS questões de "Escolha Simples" (1 resposta correta entre 4 opções).
2. PROIBIDO: "Citar 3 exemplos", "Assinale as incorretas", "Verdadeiro ou Falso", "Completar lacunas".
3. FORMATO DAS OPÇÕES: Exatamente 4 alternativas (A, B, C, D).
4. RESPOSTA CORRETA: Apenas a letra (ex: "A").
5. Nível: ${difficulty || "médio"}.
6. Idioma: Português do Brasil.

Retorne APENAS um JSON válido:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Enunciado claro e direto...",
      "opcoes": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
      "resposta_correta": "A",
      "justificativa": "Explicação detalhada do porquê A está certa e as outras erradas.",
      "dica": "Dica clínica curta.",
      "topico": "Cardiologia",
      "dificuldade": "médio"
    }
  ]
}`;

      const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT, true);
      const parsed = parseJsonFromResponse(response);
      
      if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
        allQuestions.push(...parsed.perguntas);
      }
    }

    // Sanitização Final e Inserção
    const questionsToInsert = allQuestions.map((q: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      session_id: sessionId,
      tipo: "multipla_escolha", // Força o tipo correto no banco
      pergunta: sanitizeString(q.pergunta || ""),
      opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((opt: string) => sanitizeString(opt)) : [],
      resposta_correta: sanitizeString(q.resposta_correta || "").trim().toUpperCase().charAt(0), // Garante "A"
      justificativa: sanitizeString(q.justificativa || ""),
      dica: q.dica ? sanitizeString(q.dica) : null,
      topico: q.topico ? sanitizeString(q.topico) : "Geral",
      dificuldade: q.dificuldade || "médio",
    }));

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from("questions")
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    // Audit Log (Silent fail if audit fails)
    try {
      await getAuditLogger().logAIGeneration(
        AuditEventType.AI_QUIZ_GENERATED,
        user.id,
        project_id || sources[0].project_id,
        req,
        { count_requested: count, questions_generated: insertedQuestions.length }
      );
    } catch (e) { console.error("Audit log error", e); }

    return createSuccessResponse(
      {
        success: true,
        count: insertedQuestions.length,
        session_id: sessionId,
        questions: insertedQuestions,
      },
      200,
      req, // Pass req to helper for proper CORS
    );

  } catch (error) {
    console.error("Critical Error:", error);
    // Retorna erro 500 mas com headers CORS corretos para o frontend não bloquear
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      }
    );
  }
});
