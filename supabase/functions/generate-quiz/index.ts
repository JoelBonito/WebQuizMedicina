import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  authenticateRequest,
  checkRateLimit,
  createSuccessResponse,
  RATE_LIMITS,
} from "../_shared/security.ts";
import {
  generateQuizSchema,
  sanitizeString,
  validateRequest,
} from "../_shared/validation.ts";
import { AuditEventType, AuditLogger } from "../_shared/audit.ts";
import { callGemini, parseJsonFromResponse } from "../_shared/gemini.ts";
import { calculateBatchSizes, SAFE_OUTPUT_LIMIT } from "../_shared/output-limits.ts";
import { hasAnyEmbeddings, semanticSearch } from "../_shared/embeddings.ts";

// Configuração de Logs
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

// Configuração CORS
const ALLOWED_ORIGINS = [
  "https://web-quiz-medicina.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "*" 
];

function getCorsHeadersForPreflight(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: getCorsHeadersForPreflight(req) });
  }

  try {
    // 1. Rate Limit
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION);
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
        status: 429,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      });
    }

    // 2. Auth
    const authResult = await authenticateRequest(req);
    if (!authResult.authenticated || !authResult.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      });
    }
    const user = authResult.user;

    // 3. Validação e Setup
    const validatedData = await validateRequest(req, generateQuizSchema);
    const { source_id, project_id, count, difficulty } = validatedData;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    // 4. Busca de Conteúdo (Sources)
    let sources = [];
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

    // 5. Preparação do Contexto (Embeddings ou Concatenação)
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);
    let combinedContent = "";

    if (useSemanticSearch) {
      try {
        const query = `Gerar questões de medicina variadas: casos clínicos, diagnósticos, tratamentos, fisiologia.`;
        const relevantChunks = await semanticSearch(supabaseClient, query, sourceIds, 8);
        if (relevantChunks.length > 0) {
          combinedContent = relevantChunks.map((c) => c.content).join('\n\n---\n\n');
        } else {
          useSemanticSearch = false;
        }
      } catch (e) {
        console.warn("Semantic search failed, fallback to text.", e);
        useSemanticSearch = false;
      }
    }

    if (!useSemanticSearch || !combinedContent) {
      const MAX_CONTENT_LENGTH = 30000;
      let usedSources = sources.slice(0, 3);
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

    // 6. Geração do Quiz com Prompt Atualizado
    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const sessionId = crypto.randomUUID();
    const allQuestions: any[] = [];

    for (let i = 0; i < batchSizes.length; i++) {
      const batchCount = batchSizes[i];

      const prompt = `
Você é um professor universitário de medicina criando um quiz.
Gere ${batchCount} questões variadas baseadas no conteúdo abaixo.

CONTEÚDO:
${combinedContent.substring(0, 30000)}

DISTRIBUIÇÃO OBRIGATÓRIA DOS TIPOS DE QUESTÃO:
Tente balancear entre os seguintes 4 tipos (pelo menos uma de cada se possível):
1. "multipla_escolha": Pergunta padrão de conhecimento (A, B, C, D).
2. "verdadeiro_falso": Uma afirmação onde as opções são apenas "Verdadeiro" e "Falso".
3. "citar": Pergunta do tipo "Qual destes é um exemplo de..." ou "Complete a frase...". (Use 4 opções, apenas 1 correta).
4. "caso_clinico": Um pequeno cenário clínico seguido de uma pergunta sobre diagnóstico ou conduta. (4 opções).

REGRAS DE OURO (PARA EVITAR ERROS NO APP):
- TODAS as questões devem ser de ESCOLHA ÚNICA (apenas uma alternativa correta).
- NUNCA peça "Cite 3 exemplos" ou "Selecione todas as corretas".
- Para "citar", pergunte: "Qual das alternativas abaixo é um sintoma de X?".
- Para "verdadeiro_falso", o array de opções deve ter EXATAMENTE ["Verdadeiro", "Falso"] ou ["Falso", "Verdadeiro"].

FORMATO JSON ESPERADO:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha" | "verdadeiro_falso" | "citar" | "caso_clinico",
      "pergunta": "Texto da pergunta...",
      "opcoes": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "resposta_correta": "Opção A",
      "justificativa": "Explicação didática...",
      "dificuldade": "fácil" | "médio" | "difícil",
      "topico": "Cardiologia"
    }
  ]
}
      `;

      const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT, true);
      const parsed = parseJsonFromResponse(response);
      
      if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
        allQuestions.push(...parsed.perguntas);
      }
    }

    // 7. Sanitização e Inserção no Banco
    const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];
    
    const questionsToInsert = allQuestions.map((q: any) => {
      // Limpeza especial para resposta correta
      let respostaLimpa = sanitizeString(q.resposta_correta || "");
      
      // Se for Verdadeiro/Falso, mantém a palavra inteira. Se for A/B/C/D, pega só a letra.
      // Mas para garantir compatibilidade com o código de comparação anterior (normalizeAnswer), 
      // vamos tentar manter o padrão que o frontend espera.
      
      // Lógica de fallback para tipo
      const tipo = validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha";

      return {
        project_id: project_id || sources[0].project_id,
        source_id: source_id || null,
        session_id: sessionId,
        tipo: tipo,
        pergunta: sanitizeString(q.pergunta || ""),
        opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((opt: string) => sanitizeString(opt)) : [],
        resposta_correta: respostaLimpa, 
        justificativa: sanitizeString(q.justificativa || ""),
        dica: q.dica ? sanitizeString(q.dica) : null,
        topico: q.topico ? sanitizeString(q.topico) : "Geral",
        dificuldade: q.dificuldade || "médio",
      };
    });

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from("questions")
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    try {
      await getAuditLogger().logAIGeneration(
        AuditEventType.AI_QUIZ_GENERATED,
        user.id,
        project_id || sources[0].project_id,
        req,
        { count_requested: count, questions_generated: insertedQuestions.length }
      );
    } catch (e) { console.error("Audit error ignored", e); }

    return createSuccessResponse(
      {
        success: true,
        count: insertedQuestions.length,
        session_id: sessionId,
        questions: insertedQuestions,
      },
      200,
      req
    );

  } catch (error) {
    console.error("Critical Error in generate-quiz:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      }
    );
  }
});
