import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  authenticateRequest,
  checkRateLimit,
  createSuccessResponse,
  RATE_LIMITS,
} from "../_shared/security.ts";
import {
  generateRecoveryQuizSchema,
  sanitizeString,
  validateRequest,
} from "../_shared/validation.ts";
import { AuditEventType, AuditLogger } from "../_shared/audit.ts";
import { callGemini, parseJsonFromResponse } from "../_shared/gemini.ts";
import { calculateBatchSizes, SAFE_OUTPUT_LIMIT } from "../_shared/output-limits.ts";
import { semanticSearchWithTokenLimit, hasAnyEmbeddings } from "../_shared/embeddings.ts";
import { createContextCache, safeDeleteCache } from "../_shared/gemini-cache.ts";
import {
  calculateRecoveryStrategy,
  estimateTokens,
  formatDifficultiesForLog,
  type Difficulty
} from "../_shared/recovery-strategies.ts";

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

// Recovery Mode Token Limit (slightly less than normal quiz for focused content)
const RECOVERY_TOKEN_LIMIT = 12000;

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

    // 3. Validação
    const validatedData = await validateRequest(req, generateRecoveryQuizSchema);
    const { project_id, count, difficulty } = validatedData;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    // 4. Get Project Information
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('name')
      .eq('id', project_id)
      .single();

    if (projectError) throw new Error(`Project not found: ${projectError.message}`);

    const projectName = project.name || 'Medicina';

    console.log(`🎯 [Recovery Quiz] Starting for project: ${projectName}`);
    console.log(`🎯 [Recovery Quiz] User: ${user.id}`);

    // 5. PHASE 4: Fetch Unresolved Difficulties
    const { data: difficulties, error: diffError } = await supabaseClient
      .from('difficulties')
      .select('id, topico, nivel, tipo_origem')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })  // Prioritize most severe
      .limit(5);  // Max 5 topics to avoid dilution

    if (diffError) {
      console.error('❌ [Recovery Quiz] Error fetching difficulties:', diffError);
      throw diffError;
    }

    console.log(`📊 [Recovery Quiz] Found ${difficulties?.length || 0} unresolved difficulties`);
    console.log(`📊 [Recovery Quiz] Topics: ${formatDifficultiesForLog(difficulties as Difficulty[])}`);

    // 6. Calculate Recovery Strategy
    const strategy = calculateRecoveryStrategy(difficulties as Difficulty[], projectName);

    console.log(`🧠 [Recovery Quiz] Strategy: ${strategy.strategyType.toUpperCase()}`);
    console.log(`🧠 [Recovery Quiz] Focus: ${strategy.focusPercentage}%`);
    console.log(`🧠 [Recovery Quiz] Search queries: ${strategy.searchQueries.length}`);

    // 7. Get Sources
    const { data: sources, error: sourcesError } = await supabaseClient
      .from("sources")
      .select("id, name")
      .eq("project_id", project_id)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    if (sourcesError) throw sourcesError;
    if (!sources || sources.length === 0) throw new Error("No sources found for this project");

    const sourceIds = sources.map(s => s.id);

    // 8. PHASE 4: Surgical Semantic Search (Multiple Targeted Queries)
    let combinedContent = "";
    const useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    if (useSemanticSearch) {
      try {
        console.log(`🔍 [Recovery Quiz] Performing surgical semantic search...`);

        const allRelevantChunks = [];
        const tokenBudgetPerQuery = Math.floor(RECOVERY_TOKEN_LIMIT / strategy.searchQueries.length);

        for (const query of strategy.searchQueries) {
          console.log(`   🔎 Searching: "${query}" (budget: ${tokenBudgetPerQuery} tokens)`);

          const chunks = await semanticSearchWithTokenLimit(
            supabaseClient,
            query,
            sourceIds,
            tokenBudgetPerQuery
          );

          allRelevantChunks.push(...chunks);
        }

        // Remove duplicates (chunks that appear in multiple searches)
        const uniqueChunks = Array.from(
          new Map(allRelevantChunks.map(chunk => [chunk.id, chunk])).values()
        );

        console.log(`📊 [Recovery Quiz] Total chunks found: ${allRelevantChunks.length}`);
        console.log(`📊 [Recovery Quiz] Unique chunks: ${uniqueChunks.length}`);

        const totalTokens = uniqueChunks.reduce((sum, c) => sum + c.tokenCount, 0);
        console.log(`📊 [Recovery Quiz] Total tokens: ${totalTokens}`);

        combinedContent = uniqueChunks
          .map(c => c.content)
          .join('\n\n---\n\n');

      } catch (e) {
        console.warn("⚠️ [Recovery Quiz] Semantic search failed, fallback to text.", e);
        // Fallback to extracted content
        const MAX_CONTENT_LENGTH = 30000;
        let usedSources = sources.slice(0, 3);
        for (const source of usedSources) {
          const { data: sourceData } = await supabaseClient
            .from('sources')
            .select('extracted_content')
            .eq('id', source.id)
            .single();

          if (sourceData?.extracted_content) {
            combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(sourceData.extracted_content)}`;
          }
        }
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
          combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
        }
      }
    } else {
      // No embeddings available - use extracted content
      console.log(`⚠️ [Recovery Quiz] No embeddings found, using extracted content`);
      const MAX_CONTENT_LENGTH = 30000;
      let usedSources = sources.slice(0, 3);
      for (const source of usedSources) {
        const { data: sourceData } = await supabaseClient
          .from('sources')
          .select('extracted_content')
          .eq('id', source.id)
          .single();

        if (sourceData?.extracted_content) {
          combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(sourceData.extracted_content)}`;
        }
      }
      if (combinedContent.length > MAX_CONTENT_LENGTH) {
        combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
      }
    }

    if (!combinedContent.trim()) throw new Error("No content available for recovery quiz");

    // 9. Generate Quiz with Strategy-Specific Prompt
    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const sessionId = crypto.randomUUID();
    const allQuestions: any[] = [];

    let cacheName: string | null = null;
    const useCache = batchSizes.length > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${batchSizes.length} batches`);

        const cacheContent = `CONTEÚDO MÉDICO PARA QUIZ DE RECUPERAÇÃO:

${combinedContent}

---
Este conteúdo foi selecionado especificamente para abordar dificuldades do aluno.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600,
            displayName: `recovery-quiz-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // Generate questions in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`🔄 [Batch ${batchNum}/${batchSizes.length}] Generating ${batchCount} recovery questions...`);

        // Build prompt with strategy-specific instructions
        const prompt = `
Você é um professor universitário de MEDICINA criando um QUIZ DE RECUPERAÇÃO personalizado.

${strategy.systemInstruction}

${!useCache ? `CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

` : ''}Gere ${batchCount} questões de múltipla escolha.

TIPOS DE QUESTÃO (Varie):
1. "multipla_escolha": Conceitos diretos.
2. "verdadeiro_falso": Julgue a afirmação (Opções: [Verdadeiro, Falso]).
3. "citar": "Qual destes é um exemplo de..." (4 opções).
4. "caso_clinico": Cenário curto + conduta.

REGRAS DE FORMATO (Rígidas):
- TODAS as questões devem ter APENAS UMA alternativa correta.
- Opções devem ser sempre arrays de strings: ["A) Texto", "B) Texto"...] ou ["Verdadeiro", "Falso"].

REGRAS PARA A JUSTIFICATIVA (Extra Importante para Recovery):
Este é um quiz de RECUPERAÇÃO. O aluno errou isso antes. A justificativa deve:
1. CITAR A FONTE: "Segundo o texto...", "O material indica que...", "Conforme a fonte..."
2. SER EDUCATIVA: Explique POR QUE a alternativa está correta (não apenas repita o fato)
3. CORRIGIR ERROS COMUNS: Se o aluno pode ter confundido conceitos, esclareça a diferença
4. PORTUGUÊS: Toda justificativa em PORTUGUÊS DO BRASIL
5. CONCISÃO: 2-3 frases máximo

FORMATO JSON:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para...",
      "opcoes": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D"],
      "resposta_correta": "A",
      "justificativa": "Conforme o texto, a Opção A é a primeira linha devido à sua eficácia comprovada. Um erro comum é confundir com a Opção B, mas esta só é usada quando há contraindicação à Opção A.",
      "dica": "Pense na droga que reduz a mortalidade a longo prazo.",
      "dificuldade": "${difficulty || 'médio'}",
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
          cacheName || undefined
        );

        const parsed = parseJsonFromResponse(response);

        if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
          allQuestions.push(...parsed.perguntas);
          console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.perguntas.length} recovery questions`);
        }
      }

    } finally {
      if (cacheName) {
        await safeDeleteCache(cacheName);
      }
    }

    // 10. Sanitization and Persistence with Recovery Metadata
    const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];

    const questionsToInsert = allQuestions.map((q: any) => {
      let respostaLimpa = sanitizeString(q.resposta_correta || "");
      const tipo = validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha";

      if (tipo === "verdadeiro_falso") {
        const normalized = respostaLimpa.toLowerCase();
        if (normalized.includes("verdadeiro") || normalized === "v") {
          respostaLimpa = "Verdadeiro";
        } else if (normalized.includes("falso") || normalized === "f") {
          respostaLimpa = "Falso";
        }
      }

      return {
        project_id,
        session_id: sessionId,
        pergunta: sanitizeString(q.pergunta || q.question || ""),
        opcoes: Array.isArray(q.opcoes) ? q.opcoes.map(sanitizeString) : [],
        resposta_correta: respostaLimpa,
        justificativa: sanitizeString(q.justificativa || ""),
        dica: q.dica ? sanitizeString(q.dica) : null,
        tipo,
        dificuldade: q.dificuldade || difficulty || "médio",
        topico: q.topico ? sanitizeString(q.topico) : null
      };
    });

    const { data: insertedQuestions, error: insertError } = await supabaseClient
      .from("questions")
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`✅ [Recovery Quiz] Saved ${insertedQuestions.length} questions to database`);

    // 11. Audit Log
    await getAuditLogger().log(
      supabaseClient,
      AuditEventType.AI_QUIZ_GENERATION,
      user.id,
      {
        project_id,
        mode: 'recovery',
        strategy: strategy.strategyType,
        focus_percentage: strategy.focusPercentage,
        difficulties_count: difficulties?.length || 0,
        difficulties_topics: difficulties?.map((d: Difficulty) => d.topico) || [],
        questions_generated: insertedQuestions.length,
        session_id: sessionId,
        context_tokens: estimateTokens(combinedContent)
      },
      req
    );

    console.log(`🎉 [Recovery Quiz] Complete! Generated ${insertedQuestions.length} questions`);
    console.log(`🎉 [Recovery Quiz] Strategy: ${strategy.strategyType}, Focus: ${strategy.focusPercentage}%`);

    return createSuccessResponse(
      {
        questions: insertedQuestions,
        session_id: sessionId,
        recovery_metadata: {
          strategy: strategy.strategyType,
          focus_percentage: strategy.focusPercentage,
          difficulties_addressed: difficulties?.map((d: Difficulty) => d.topico) || [],
          total_difficulties: difficulties?.length || 0
        }
      },
      200,
      req
    );

  } catch (error: any) {
    console.error("❌ [Recovery Quiz] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...getCorsHeadersForPreflight(req), "Content-Type": "application/json" },
      }
    );
  }
});
