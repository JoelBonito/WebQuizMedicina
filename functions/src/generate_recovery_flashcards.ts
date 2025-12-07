import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { calculateBatchSizes } from "./shared/output_limits";
import { sanitizeString } from "./shared/sanitization";
import { validateRequest, generateRecoveryFlashcardsSchema } from "./shared/validation";
import { semanticSearchWithTokenLimit, hasAnyEmbeddings } from "./shared/embeddings";
import { calculateRecoveryStrategyForFlashcards, formatDifficultiesForLog, Difficulty } from "./shared/recovery_strategies";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";



// Recovery Flashcards Token Limit (10k tokens - more focused than quiz)
const RECOVERY_FLASHCARDS_TOKEN_LIMIT = 10000;

export const generate_recovery_flashcards = onCall({
    timeoutSeconds: 300, // Increased timeout for semantic search and batch generation
    memory: "1GiB",
    region: "us-central1",
}, async (request) => {
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        const { project_id, count } = validateRequest(request.data, generateRecoveryFlashcardsSchema);
        const userId = request.auth.uid;

        // 1. Get Project Information
        const projectDoc = await db.collection("projects").doc(project_id).get();
        if (!projectDoc.exists) {
            throw new HttpsError("not-found", "Project not found");
        }
        const project = projectDoc.data();
        const projectName = project?.name || 'Medicina';

        console.log(`🎯 [Recovery Flashcards] Starting for project: ${projectName}`);
        console.log(`🎯 [Recovery Flashcards] User: ${userId}`);

        // 2. Fetch Unresolved Difficulties
        const difficultiesSnapshot = await db.collection("difficulties")
            .where("user_id", "==", userId)
            .where("project_id", "==", project_id)
            .where("resolvido", "==", false)
            .orderBy("nivel", "desc")
            .limit(5)
            .get();

        const difficulties = difficultiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Difficulty));

        console.log(`📊 [Recovery Flashcards] Found ${difficulties.length} unresolved difficulties`);
        console.log(`📊 [Recovery Flashcards] Topics: ${formatDifficultiesForLog(difficulties)}`);

        // 3. Calculate Recovery Strategy
        const strategy = calculateRecoveryStrategyForFlashcards(difficulties, projectName);

        console.log(`🧠 [Recovery Flashcards] Strategy: ${strategy.strategyType.toUpperCase()}`);
        console.log(`🧠 [Recovery Flashcards] Focus: ${strategy.focusPercentage}%`);

        // 4. Get Sources
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where("status", "==", "ready")
            .orderBy("created_at", "desc")
            .get();

        const sources = sourcesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        if (sources.length === 0) {
            throw new HttpsError("failed-precondition", "No sources found for this project");
        }

        const sourceIds = sources.map(s => s.id);

        // 5. Surgical Semantic Search
        let combinedContent = "";
        // Check if we have embeddings (using our helper which checks Firestore)
        const useSemanticSearch = await hasAnyEmbeddings(db, sourceIds);

        // ✅ Seleção automática e inteligente (Moved up)
        const selector = getModelSelector();

        if (useSemanticSearch) {
            try {
                console.log(`🔍 [Recovery Flashcards] Performing surgical semantic search...`);

                const embeddingModel = await selector.selectBestModel('embedding');
                console.log(`🤖 Using embedding model: ${embeddingModel}`);

                const allRelevantChunks: any[] = [];
                const tokenBudgetPerQuery = Math.floor(RECOVERY_FLASHCARDS_TOKEN_LIMIT / strategy.searchQueries.length);

                for (const query of strategy.searchQueries) {
                    console.log(`   🔎 Searching: "${query}" (budget: ${tokenBudgetPerQuery} tokens)`);

                    const chunks = await semanticSearchWithTokenLimit(
                        db,
                        query,
                        sourceIds,
                        tokenBudgetPerQuery,
                        0.5, // default threshold
                        embeddingModel
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
                    if (source.extracted_content) {
                        combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
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
                if (source.extracted_content) {
                    combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
                }
            }
            if (combinedContent.length > MAX_CONTENT_LENGTH) {
                combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
            }
        }

        if (!combinedContent.trim()) {
            throw new HttpsError("failed-precondition", "No content available for recovery flashcards.");
        }

        // 6. Generate Flashcards with Atomization Prompt
        const batchSizes = calculateBatchSizes('FLASHCARD', count || 10);
        const sessionId = crypto.randomUUID();
        const allFlashcards: any[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // ✅ Seleção automática e inteligente (Already initialized above)
        let modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for recovery flashcards generation`);

        // Generate flashcards in batches
        for (let i = 0; i < batchSizes.length; i++) {
            const batchCount = batchSizes[i];
            const batchNum = i + 1;

            console.log(`🔄 [Batch ${batchNum}/${batchSizes.length}] Generating ${batchCount} recovery flashcards...`);

            // Build prompt with atomization emphasis
            const prompt = `
Você é um professor universitário de MEDICINA criando FLASHCARDS DE RECUPERAÇÃO.

${strategy.systemInstruction}

CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

Gere ${batchCount} flashcards.

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

            let result;
            try {
                result = await callGeminiWithUsage(
                    prompt,
                    modelName,
                    32768,
                    true
                );
            } catch (error: any) {
                // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                if (error.status === 404 || error.message.includes('not found')) {
                    console.warn('⚠️ Primary model failed, trying fallback...');
                    const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                    console.log(`🤖 Using fallback model: ${fallbackModel}`);
                    modelName = fallbackModel; // Update for next batches and logging
                    result = await callGeminiWithUsage(
                        prompt,
                        fallbackModel,
                        32768,
                        true
                    );
                } else {
                    throw error;
                }
            }

            const parsed = parseJsonFromResponse(result.text);

            if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
                allFlashcards.push(...parsed.flashcards);
                totalInputTokens += result.usage.inputTokens;
                totalOutputTokens += result.usage.outputTokens;
                console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.flashcards.length} recovery flashcards`);
            }
        }

        // 7. Sanitization and Persistence
        const flashcardsToInsert = allFlashcards.map((f: any) => ({
            project_id,
            user_id: userId, // Added user_id
            source_id: null,  // Recovery flashcards span multiple sources
            session_id: sessionId,
            frente: sanitizeString(f.frente || ''),
            verso: sanitizeString(f.verso || ''),
            topico: f.topico ? sanitizeString(f.topico) : null,
            dificuldade: ['fácil', 'médio', 'difícil'].includes(f.dificuldade) ? f.dificuldade : 'médio',
            content_type: 'recovery', // Mark as recovery content for UI differentiation
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        }));

        const batch = db.batch();
        const flashcardsRef = db.collection("flashcards");

        flashcardsToInsert.forEach(card => {
            const docRef = flashcardsRef.doc();
            batch.set(docRef, card);
        });

        await batch.commit();

        console.log(`✅ [Recovery Flashcards] Saved ${flashcardsToInsert.length} flashcards to database`);

        console.log(`✅ [Recovery Flashcards] Saved ${flashcardsToInsert.length} flashcards to database`);

        // 8. Log Token Usage
        await logTokenUsage(
            userId,
            project_id,
            "recovery_flashcards",
            totalInputTokens,
            totalOutputTokens,
            modelName, // Log the actual model used
            {
                count: flashcardsToInsert.length,
                strategy: strategy.strategyType,
                batches: batchSizes.length
            }
        );

        return {
            success: true,
            flashcards: flashcardsToInsert,
            session_id: sessionId,
            recovery_metadata: {
                strategy: strategy.strategyType,
                focus_percentage: strategy.focusPercentage,
                difficulties_addressed: difficulties.map(d => d.topico),
                total_difficulties: difficulties.length
            }
        };

    } catch (error: any) {
        console.error("❌ [Recovery Flashcards] Error:", error);
        throw new HttpsError("internal", error.message || "Failed to generate recovery flashcards");
    }
});
