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
import { hasAnyEmbeddings, semanticSearchWithTokenLimit } from "../_shared/embeddings.ts";
import { createContextCache, safeDeleteCache } from "../_shared/gemini-cache.ts";

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

    // 5. Preparação do Contexto
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);
    let combinedContent = "";

    if (useSemanticSearch) {
      try {
        const query = `Gerar questões de medicina aprofundadas: fisiopatologia, diagnóstico diferencial, tratamento, casos clínicos.`;
        // PHASE 3: Use token-based limit instead of fixed chunk count (15k tokens ≈ 10-20 chunks dynamically)
        const relevantChunks = await semanticSearchWithTokenLimit(supabaseClient, query, sourceIds, 15000);
        if (relevantChunks.length > 0) {
          combinedContent = relevantChunks.map((c) => c.content).join('\n\n---\n\n');
          console.log(`📊 [Quiz] Using ${relevantChunks.length} chunks (${relevantChunks.reduce((sum, c) => sum + c.tokenCount, 0)} tokens)`);
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

    // 6. Geração do Quiz com Prompt AJUSTADO (Justificativa Curta e Citada)
    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const sessionId = crypto.randomUUID();
    const allQuestions: any[] = [];

    // PHASE 1: Create context cache if multiple batches (saves ~95% on input tokens)
    let cacheName: string | null = null;
    const useCache = batchSizes.length > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${batchSizes.length} batches to save ~95% on input tokens`);

        const cacheContent = `CONTEÚDO MÉDICO BASE PARA GERAÇÃO DE QUESTÕES:

${combinedContent}

---
Este conteúdo será usado como base para gerar questões de medicina.
Todas as questões devem se basear EXCLUSIVAMENTE neste conteúdo.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600, // 10 minutes - enough for batch processing
            displayName: `quiz-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // PHASE 2: Generate questions in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`🔄 [Batch ${batchNum}/${batchSizes.length}] Generating ${batchCount} questions...`);

        // Prompt WITHOUT content when using cache (content is in cache)
        // Prompt WITH content when NOT using cache (single batch)
        const prompt = `
Você é um professor universitário de MEDICINA criando uma prova.
Gere ${batchCount} questões baseadas no CONTEÚDO ${useCache ? 'já fornecido no contexto' : 'abaixo'}.

${!useCache ? `CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

` : ''}TIPOS DE QUESTÃO (Varie):
1. "multipla_escolha": Conceitos diretos.
2. "verdadeiro_falso": Julgue a afirmação (Opções: [Verdadeiro, Falso]).
3. "citar": "Qual destes é um exemplo de..." (4 opções).
4. "caso_clinico": Cenário curto + conduta.

REGRAS DE FORMATO (Rígidas):
- TODAS as questões devem ter APENAS UMA alternativa correta.
- Opções devem ser sempre arrays de strings: ["A) Texto", "B) Texto"...] ou ["Verdadeiro", "Falso"].

REGRAS PARA A JUSTIFICATIVA (Obrigatório):
Quero uma justificativa CURTA que valide a resposta certa usando o texto fornecido.
1. CITE A FONTE: Comece frases com "Segundo o texto...", "O material indica que...", "Conforme a fonte...".
2. TRADUZA: Se o conteúdo base estiver em inglês ou outro idioma, a justificativa DEVE ser escrita inteiramente em PORTUGUÊS DO BRASIL.
3. CONCISÃO: Máximo de 2 a 3 frases. Vá direto ao ponto do porquê aquela opção é a correta baseada na leitura.

FORMATO JSON:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para...",
      "opcoes": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D"],
      "resposta_correta": "A",
      "justificativa": "Conforme o texto, a Opção A é a primeira linha devido à sua eficácia comprovada na redução da mortalidade. O material destaca que as outras drogas só devem ser usadas se houver contraindicação.",
      "dica": "Pense na droga que reduz a mortalidade a longo prazo.",
      "dificuldade": "médio",
      "topico": "Cardiologia"
    }
  ]
}
        `;

        const response = await callGemini(
          prompt,
          'gemini-2.5-flash',
          SAFE_OUTPUT_LIMIT,
          true,
          cacheName || undefined // Use cache if available
        );

        const parsed = parseJsonFromResponse(response);

        if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
          allQuestions.push(...parsed.perguntas);
          console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.perguntas.length} questions`);
        }
      }

    } finally {
      // PHASE 3: Always cleanup cache (even if error occurs)
      if (cacheName) {
        await safeDeleteCache(cacheName);
      }
    }

    // 7. Sanitização e Inserção
    const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];
    
    const questionsToInsert = allQuestions.map((q: any) => {
      let respostaLimpa = sanitizeString(q.resposta_correta || "");
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

    // Log de Auditoria
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
