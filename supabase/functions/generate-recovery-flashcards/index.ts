import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  authenticateRequest,
  checkRateLimit,
  createSuccessResponse,
  RATE_LIMITS,
} from "../_shared/security.ts";
import {
  generateRecoveryFlashcardsSchema,
  sanitizeString,
  validateRequest,
} from "../_shared/validation.ts";
import { AuditEventType, AuditLogger } from "../_shared/audit.ts";
import { callGeminiWithUsage, parseJsonFromResponse } from "../_shared/gemini.ts";
import { calculateBatchSizes, SAFE_OUTPUT_LIMIT } from "../_shared/output-limits.ts";
import { logTokenUsage, type TokenUsage } from "../_shared/token-logger.ts";
import { semanticSearchWithTokenLimit, hasAnyEmbeddings } from "../_shared/embeddings.ts";
import { createContextCache, safeDeleteCache } from "../_shared/gemini-cache.ts";
import {
  calculateRecoveryStrategyForFlashcards,
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

// Recovery Flashcards Token Limit (10k tokens - more focused than quiz)
const RECOVERY_FLASHCARDS_TOKEN_LIMIT = 10000;

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
    const validatedData = await validateRequest(req, generateRecoveryFlashcardsSchema);
    const { project_id, count } = validatedData;

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

    console.log(`🎯 [Recovery Flashcards] Starting for project: ${projectName}`);
    console.log(`🎯 [Recovery Flashcards] User: ${user.id}`);

    // 5. PHASE 4B: Fetch Unresolved Difficulties
    const { data: difficulties, error: diffError } = await supabaseClient
      .from('difficulties')
      .select('id, topico, nivel, tipo_origem')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .eq('resolvido', false)
      .order('nivel', { ascending: false })  // Prioritize most severe
      .limit(5);  // Max 5 topics

    if (diffError) {
      console.error('❌ [Recovery Flashcards] Error fetching difficulties:', diffError);
      throw diffError;
    }

    console.log(`📊 [Recovery Flashcards] Found ${difficulties?.length || 0} unresolved difficulties`);
    console.log(`📊 [Recovery Flashcards] Topics: ${formatDifficultiesForLog(difficulties as Difficulty[])}`);

    // 6. Calculate Recovery Strategy (Flashcard-specific)
    const strategy = calculateRecoveryStrategyForFlashcards(difficulties as Difficulty[], projectName);

    console.log(`🧠 [Recovery Flashcards] Strategy: ${strategy.strategyType.toUpperCase()}`);
    console.log(`🧠 [Recovery Flashcards] Focus: ${strategy.focusPercentage}%`);
    console.log(`🧠 [Recovery Flashcards] Note: Flashcards tolerate 100% focus (atomic nature)`);

    // 7. Get Sources
    const { data: sources, error: sourcesError } = await supabaseClient
      .from("sources")
      .select("id, name, project_id")
      .eq("project_id", project_id)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    if (sourcesError) throw sourcesError;
    if (!sources || sources.length === 0) throw new Error("No sources found for this project");

    const sourceIds = sources.map(s => s.id);

    // 8. PHASE 4B: Surgical Semantic Search
    let combinedContent = "";
    const useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    if (useSemanticSearch) {
      try {
        console.log(`🔍 [Recovery Flashcards] Performing surgical semantic search...`);

        const allRelevantChunks = [];
        const tokenBudgetPerQuery = Math.floor(RECOVERY_FLASHCARDS_TOKEN_LIMIT / strategy.searchQueries.length);

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

        // Remove duplicates
        const uniqueChunks = Array.from(
          new Map(allRelevantChunks.map(chunk => [chunk.id, chunk])).values()
        );

        console.log(`📊 [Recovery Flashcards] Total chunks found: ${allRelevantChunks.length}`);
        console.log(`📊 [Recovery Flashcards] Unique chunks: ${uniqueChunks.length}`);

        const totalTokens = uniqueChunks.reduce((sum, c) => sum + c.tokenCount, 0);
        console.log(`📊 [Recovery Flashcards] Total tokens: ${totalTokens}`);

        combinedContent = uniqueChunks
          .map(c => c.content)
          .join('\n\n---\n\n');

      } catch (e) {
        console.warn("⚠️ [Recovery Flashcards] Semantic search failed, fallback to text.", e);
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
      // No embeddings available
      console.log(`⚠️ [Recovery Flashcards] No embeddings found, using extracted content`);
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

    if (!combinedContent.trim()) {
      const sourceStatuses = sources.map(s => `${s.name} (status: ${s.status})`).join(', ');
      throw new Error(`No content available for recovery flashcards. Sources: ${sourceStatuses}. Please ensure sources have been processed and have status 'ready'.`);
    }

    // 9. Generate Flashcards with Atomization Prompt
    const batchSizes = calculateBatchSizes('FLASHCARD', count);
    // Recovery flashcards are identified by: source_id = null + mode in token_usage metadata
    const sessionId = crypto.randomUUID();
    const allFlashcards: any[] = [];

    // Track token usage across all batches
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    let cacheName: string | null = null;
    const useCache = batchSizes.length > 1;

    try {
      if (useCache) {
        console.log(`💰 [CACHE] Creating cache for ${batchSizes.length} batches`);

        const cacheContent = `CONTEÚDO MÉDICO PARA FLASHCARDS DE RECUPERAÇÃO:

${combinedContent}

---
Este conteúdo foi selecionado especificamente para abordar dificuldades do aluno.
Atomize o conhecimento em fatos individuais e memorizáveis.`;

        const cacheInfo = await createContextCache(
          cacheContent,
          'gemini-2.5-flash',
          {
            ttlSeconds: 600,
            displayName: `recovery-flashcards-${sessionId}`
          }
        );

        cacheName = cacheInfo.name;
        console.log(`✅ [CACHE] Cache created: ${cacheName}`);
      }

      // Generate flashcards in batches
      for (let i = 0; i < batchSizes.length; i++) {
        const batchCount = batchSizes[i];
        const batchNum = i + 1;

        console.log(`🔄 [Batch ${batchNum}/${batchSizes.length}] Generating ${batchCount} recovery flashcards...`);

        // Build prompt with atomization emphasis
        const prompt = `
Você é um professor universitário de MEDICINA criando FLASHCARDS DE RECUPERAÇÃO.

${strategy.systemInstruction}

${!useCache ? `CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

` : ''}Gere ${batchCount} flashcards.

REGRA CRÍTICA - ATOMIZAÇÃO:
Cada flashcard deve conter APENAS 1 fato/conceito isolado.
Se um conceito é complexo, QUEBRE em múltiplos flashcards simples.

EXEMPLOS DE ATOMIZAÇÃO CORRETA:

❌ ERRADO (muito complexo):
Frente: "Explique o tratamento completo da cetoacidose diabética"
Verso: "Hidratação com SF 0,9%, insulina regular IV, correção de K+, correção de acidose..."

✅ CORRETO (atomizado em 4 flashcards):
Card 1:
Frente: "Qual o PRIMEIRO passo no tratamento da cetoacidose diabética?"
Verso: "Hidratação vigorosa com Soro Fisiológico 0,9% (1-2L na primeira hora)."

Card 2:
Frente: "Qual tipo de insulina usar na cetoacidose diabética?"
Verso: "Insulina REGULAR por via IV (dose: 0,1 UI/kg/h em infusão contínua)."

Card 3:
Frente: "Quando repor potássio na cetoacidose diabética?"
Verso: "Se K+ < 5,2 mEq/L, repor antes ou junto com insulina (previne hipocalemia)."

Card 4:
Frente: "Quando considerar bicarbonato na cetoacidose?"
Verso: "Apenas se pH < 6,9 (uso controverso, risco de alcalose de rebote)."

FORMATO JSON:
{
  "flashcards": [
    {
      "frente": "Pergunta direta e objetiva",
      "verso": "Resposta concisa (máximo 3 frases)",
      "topico": "${difficulties && difficulties.length > 0 ? difficulties[0].topico : 'Medicina'}",
      "dificuldade": "médio"
    }
  ]
}

IMPORTANTE:
- Frente: Pergunta sem contexto longo (máximo 1 frase)
- Verso: Resposta memorável e precisa (1-3 frases)
- Evite casos clínicos longos (prefira perguntas diretas)
- Use "Qual é...", "Qual o valor...", "Quando usar..." (perguntas de memorização)

Retorne APENAS o JSON válido.
        `;

        const result = await callGeminiWithUsage(
          prompt,
          'gemini-2.5-flash',
          SAFE_OUTPUT_LIMIT,
          true,
          cacheName || undefined
        );

        // Accumulate token usage
        totalInputTokens += result.usage.inputTokens;
        totalOutputTokens += result.usage.outputTokens;
        totalCachedTokens += result.usage.cachedTokens || 0;

        const parsed = parseJsonFromResponse(result.text);

        if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
          allFlashcards.push(...parsed.flashcards);
          console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.flashcards.length} recovery flashcards`);
        }
      }

    } finally {
      if (cacheName) {
        await safeDeleteCache(cacheName);
      }
    }

    // 10. Sanitization and Persistence
    const flashcardsToInsert = allFlashcards.map((f: any) => ({
      project_id,
      source_id: null,  // Recovery flashcards span multiple sources
      session_id: sessionId,
      frente: sanitizeString(f.frente || ''),
      verso: sanitizeString(f.verso || ''),
      topico: f.topico ? sanitizeString(f.topico) : null,
      dificuldade: ['fácil', 'médio', 'difícil'].includes(f.dificuldade) ? f.dificuldade : 'médio',
      content_type: 'recovery'  // Mark as recovery content for UI differentiation
    }));

    const { data: insertedFlashcards, error: insertError } = await supabaseClient
      .from("flashcards")
      .insert(flashcardsToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`✅ [Recovery Flashcards] Saved ${insertedFlashcards.length} flashcards to database`);

    // 11. Log Token Usage for Admin Analytics
    await logTokenUsage(
      supabaseClient,
      user.id,
      project_id,
      'flashcard',
      {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cachedTokens: totalCachedTokens,
      },
      'gemini-2.5-flash',
      {
        session_id: sessionId,
        mode: 'recovery',
        strategy: strategy.strategyType,
        flashcards_generated: insertedFlashcards.length,
      }
    );

    // 12. Audit Log
    await getAuditLogger().log(
      supabaseClient,
      AuditEventType.AI_FLASHCARD_GENERATION,
      user.id,
      {
        project_id,
        mode: 'recovery',
        strategy: strategy.strategyType,
        focus_percentage: strategy.focusPercentage,
        difficulties_count: difficulties?.length || 0,
        difficulties_topics: difficulties?.map((d: Difficulty) => d.topico) || [],
        flashcards_generated: insertedFlashcards.length,
        session_id: sessionId,
        context_tokens: estimateTokens(combinedContent)
      },
      req
    );

    console.log(`🎉 [Recovery Flashcards] Complete! Generated ${insertedFlashcards.length} flashcards`);
    console.log(`🎉 [Recovery Flashcards] Strategy: ${strategy.strategyType}, Focus: ${strategy.focusPercentage}%`);

    return createSuccessResponse(
      {
        flashcards: insertedFlashcards,
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
    console.error("❌ [Recovery Flashcards] Error:", error);
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
