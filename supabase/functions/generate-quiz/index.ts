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
    const { source_id, project_id, count, difficulty } = validatedData;

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
        .eq("status", "ready")
        .order("created_at", { ascending: false }); // Most recent first

      if (error) throw error;
      sources = data || [];
    }

    if (sources.length === 0) {
      throw new Error("No sources found");
    }

    // PHASE 2: Check if embeddings exist for semantic search
    const sourceIds = sources.map(s => s.id);
    let useSemanticSearch = await hasAnyEmbeddings(supabaseClient, sourceIds);

    let combinedContent = "";
    let avgSimilarity: number | null = null; // Track average similarity for warning

    if (useSemanticSearch) {
      // ✅ PHASE 2: Use semantic search with embeddings
      console.log('🎯 [PHASE 2] Using semantic search with embeddings');

      // Define query optimized for quiz generation
      const query = `Gerar questões de múltipla escolha sobre conceitos médicos, casos clínicos, diagnósticos diferenciais, tratamentos, mecanismos de ação, anatomia, fisiologia e farmacologia. Incluir situações clínicas práticas e raciocínio diagnóstico.`;

      // Get top 8 most relevant chunks (reduced from 15 to avoid MAX_TOKENS on input)
      // Each chunk can be ~600-800 tokens, so 8 chunks = ~5000-6000 tokens
      // This leaves room for instructions (~500 tokens) and output (~6400 tokens)
      const relevantChunks = await semanticSearch(
        supabaseClient,
        query,
        sourceIds,
        8 // top K - reduced to prevent prompt overflow
      );

      if (relevantChunks.length === 0) {
        console.warn('⚠️ [PHASE 2] No relevant chunks found, falling back to concatenation');
        useSemanticSearch = false;
      } else {
        // Build context from relevant chunks
        combinedContent = relevantChunks
          .map((chunk, idx) => {
            const similarity = (chunk.similarity * 100).toFixed(1);
            return `[Trecho ${idx + 1} - Relevância: ${similarity}%]\n${chunk.content}`;
          })
          .join('\n\n---\n\n');

        avgSimilarity = relevantChunks.reduce((sum, c) => sum + c.similarity, 0) / relevantChunks.length;
        const avgSimilarityPercent = (avgSimilarity * 100).toFixed(1);
        console.log(`✅ [PHASE 2] Using ${relevantChunks.length} relevant chunks (avg similarity: ${avgSimilarityPercent}%)`);
        console.log(`📊 [PHASE 2] Total content: ${combinedContent.length} characters`);

        // Safety check: truncate if content still too large (should not happen with 8 chunks)
        const MAX_CONTENT_LENGTH = 50000; // ~12500 tokens - increased to accommodate more context with new 12k output limit
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
          console.warn(`⚠️ [PHASE 2] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} characters`);
          combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
        }
      }
    }

    if (!useSemanticSearch) {
      // ⚠️ PHASE 0: Fallback to truncated concatenation (legacy method)
      console.warn('⚠️ [PHASE 0] No embeddings found. Using fallback method (truncated concatenation)');

      const MAX_SOURCES = 3;
      const MAX_CONTENT_LENGTH = 60000; // ~15k tokens - increased to accommodate more context with new 12k output limit

      let usedSources = sources;
      if (sources.length > MAX_SOURCES) {
        console.warn(`⚠️ [PHASE 0] Limiting from ${sources.length} to ${MAX_SOURCES} most recent sources`);
        usedSources = sources.slice(0, MAX_SOURCES);
      }

      // Combine content from all sources
      for (const source of usedSources) {
        if (source.extracted_content) {
          const sanitizedContent = sanitizeString(source.extracted_content);
          combinedContent += `\n\n=== ${
            sanitizeString(source.name)
          } ===\n${sanitizedContent}`;
        }
      }

      // Truncate if content exceeds limit
      if (combinedContent.length > MAX_CONTENT_LENGTH) {
        console.warn(`⚠️ [PHASE 0] Truncating content from ${combinedContent.length} to ${MAX_CONTENT_LENGTH} characters`);
        combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Conteúdo truncado para evitar limite de tokens]';
      }
    }

    if (!combinedContent.trim()) {
      throw new Error("No content available to generate quiz");
    }

    // PHASE 1: Validate output request and calculate batches
    const validation = validateOutputRequest('QUIZ_MULTIPLE_CHOICE', count);

    console.log(`📊 [PHASE 1] Quiz generation request: ${count} questions, estimated ${validation.estimatedTokens} tokens`);

    if (validation.needsBatching) {
      console.warn(`⚠️ [PHASE 1] ${validation.warning}`);
    }

    const batchSizes = calculateBatchSizes('QUIZ_MULTIPLE_CHOICE', count);
    const totalBatches = batchSizes.length;

    console.log(`🔄 [PHASE 1] Processing in ${totalBatches} batch(es): ${batchSizes.join(', ')} questions each`);

    // Generate a unique session_id for this quiz generation
    const sessionId = crypto.randomUUID();
    console.log(`📝 [PHASE 1] Session ID: ${sessionId}`);

    // Generate quiz questions in batches
    const allQuestions: any[] = [];

    for (let i = 0; i < batchSizes.length; i++) {
      const batchCount = batchSizes[i];
      const batchNum = i + 1;

      console.log(`${formatBatchProgress(batchNum, totalBatches)} Generating ${batchCount} questions...`);

      const prompt =
        `Você é um professor especialista em medicina. Analise o conteúdo abaixo e gere ${batchCount} perguntas variadas de alta qualidade para estudantes de medicina.

IMPORTANTE: Todas as perguntas, opções, dicas e justificativas devem ser em Português do Brasil.

CONTEÚDO:
${combinedContent}

TIPOS DE QUESTÕES (distribua entre todos os tipos):
1. **multipla_escolha**: Questão tradicional com 4 alternativas (A, B, C, D)
2. **verdadeiro_falso**: Afirmação para avaliar se é verdadeira ou falsa (2 opções: "Verdadeiro", "Falso")
3. **citar**: Pergunta que pede para citar/identificar algo, com 4 opções de resposta
4. **completar**: Frase incompleta para completar com a opção correta (4 alternativas)
5. **caso_clinico**: Caso clínico detalhado com pergunta sobre diagnóstico, tratamento ou conduta (4 alternativas)

INSTRUÇÕES GERAIS:
1. DISTRIBUA as ${batchCount} perguntas entre TODOS os 5 tipos acima (pelo menos 1 de cada tipo)
2. Crie perguntas que testem compreensão profunda, não apenas memorização
3. Apenas UMA alternativa deve estar correta
4. Forneça uma justificativa clara e educativa para a resposta correta
5. Classifique a dificuldade como: "fácil", "médio" ou "difícil"${difficulty ? ` - IMPORTANTE: TODAS as perguntas devem ser de nível "${difficulty}"` : ''}
6. Identifique o tópico principal da pergunta
7. SEMPRE forneça uma dica útil que ajude o aluno a pensar, sem revelar diretamente a resposta
${totalBatches > 1 ? `8. Este é o lote ${batchNum} de ${totalBatches}. Varie os tópicos em relação aos lotes anteriores.` : ''}

FORMATO ESPECÍFICO POR TIPO:
- **multipla_escolha**: 4 opções (A, B, C, D)
- **verdadeiro_falso**: 2 opções exatas: ["Verdadeiro", "Falso"], resposta_correta deve ser "Verdadeiro" ou "Falso"
- **citar**: 4 opções (A, B, C, D) com nomes, termos ou conceitos
- **completar**: 4 opções (A, B, C, D) que completam a frase
- **caso_clinico**: Pergunta longa (cenário clínico) + 4 opções (A, B, C, D)

FORMATO DE SAÍDA (JSON estrito):
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual é o mecanismo de ação da aspirina?",
      "opcoes": ["A) Inibição da COX-1 e COX-2", "B) Bloqueio de canais de cálcio", "C) Inibição da bomba de prótons", "D) Agonista de receptores beta"],
      "resposta_correta": "A",
      "justificativa": "A aspirina inibe irreversivelmente as enzimas COX-1 e COX-2, bloqueando a síntese de prostaglandinas.",
      "dica": "Pense no mecanismo anti-inflamatório relacionado às prostaglandinas.",
      "topico": "Farmacologia",
      "dificuldade": "${difficulty || 'médio'}"
    },
    {
      "tipo": "verdadeiro_falso",
      "pergunta": "A diabetes tipo 1 é caracterizada pela resistência insulínica.",
      "opcoes": ["Verdadeiro", "Falso"],
      "resposta_correta": "Falso",
      "justificativa": "A diabetes tipo 1 é caracterizada pela destruição autoimune das células beta pancreáticas, resultando em deficiência de insulina, não resistência.",
      "dica": "Lembre-se da diferença entre tipo 1 (deficiência) e tipo 2 (resistência).",
      "topico": "Endocrinologia",
      "dificuldade": "${difficulty || 'médio'}"
    },
    {
      "tipo": "caso_clinico",
      "pergunta": "Paciente masculino, 65 anos, hipertenso, apresenta dor torácica opressiva de início súbito, irradiando para o braço esquerdo e mandíbula, acompanhada de sudorese fria. ECG mostra supradesnivelamento do segmento ST em derivações V2-V4. Qual é o diagnóstico mais provável?",
      "opcoes": ["A) Infarto agudo do miocárdio com supra de ST", "B) Angina estável", "C) Pericardite aguda", "D) Dissecção de aorta"],
      "resposta_correta": "A",
      "justificativa": "O quadro clínico de dor torácica típica associada ao supradesnivelamento do segmento ST é diagnóstico de IAM com supra.",
      "dica": "O supradesnivelamento de ST é um achado clássico em uma condição cardíaca aguda e grave.",
      "topico": "Cardiologia",
      "dificuldade": "${difficulty || 'médio'}"
    }
  ]
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

      const response = await callGemini(prompt, 'gemini-2.5-flash', SAFE_OUTPUT_LIMIT);
      const parsed = parseJsonFromResponse(response);

      if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
        throw new Error(`Invalid response format from AI in batch ${batchNum}`);
      }

      allQuestions.push(...parsed.perguntas);
      console.log(`✅ ${formatBatchProgress(batchNum, totalBatches)} Generated ${parsed.perguntas.length} questions`);
    }

    console.log(`✅ [PHASE 1] Total questions generated: ${allQuestions.length}`);

    // Save all questions to database
    const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "completar", "caso_clinico"];
    const questionsToInsert = allQuestions.map((q: any) => ({
      project_id: project_id || sources[0].project_id,
      source_id: source_id || null,
      session_id: sessionId,
      tipo: validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha",
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
        avg_similarity: avgSimilarity,
      },
    );

    // Check for low relevance and add warning
    const LOW_RELEVANCE_THRESHOLD = 0.70; // 70% similarity threshold
    let warning = null;

    if (avgSimilarity !== null && avgSimilarity < LOW_RELEVANCE_THRESHOLD) {
      const similarityPercent = (avgSimilarity * 100).toFixed(1);
      warning = {
        type: 'low_relevance',
        message: 'A relevância do conteúdo encontrado é baixa. As questões geradas podem não ser totalmente precisas.',
        recommendation: 'Considere refinar o material de estudo ou adicionar mais conteúdo relacionado ao tema.',
        avgSimilarity: parseFloat(similarityPercent),
      };
      console.warn(`⚠️ [WARNING] Low relevance detected: ${similarityPercent}%`);
    }

    return createSuccessResponse(
      {
        success: true,
        count: insertedQuestions.length,
        session_id: sessionId,
        questions: insertedQuestions,
        ...(warning && { warning }),
      },
      200,
      req,
    );
  } catch (error) {
    return createErrorResponse(error as Error, 400, req);
  }
});
