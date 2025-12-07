"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate_recovery_flashcards = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const gemini_1 = require("./shared/gemini");
const output_limits_1 = require("./shared/output_limits");
const sanitization_1 = require("./shared/sanitization");
const validation_1 = require("./shared/validation");
const embeddings_1 = require("./shared/embeddings");
const recovery_strategies_1 = require("./shared/recovery_strategies");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
// Recovery Flashcards Token Limit (10k tokens - more focused than quiz)
const RECOVERY_FLASHCARDS_TOKEN_LIMIT = 10000;
exports.generate_recovery_flashcards = (0, https_1.onCall)({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1",
}, async (request) => {
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
        }
        const { project_id, count } = (0, validation_1.validateRequest)(request.data, validation_1.generateRecoveryFlashcardsSchema);
        const userId = request.auth.uid;
        // 1. Get Project Information
        const projectDoc = await db.collection("projects").doc(project_id).get();
        if (!projectDoc.exists) {
            throw new https_1.HttpsError("not-found", "Project not found");
        }
        const project = projectDoc.data();
        const projectName = (project === null || project === void 0 ? void 0 : project.name) || 'Medicina';
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
        const difficulties = difficultiesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        console.log(`📊 [Recovery Flashcards] Found ${difficulties.length} unresolved difficulties`);
        console.log(`📊 [Recovery Flashcards] Topics: ${(0, recovery_strategies_1.formatDifficultiesForLog)(difficulties)}`);
        // 3. Calculate Recovery Strategy
        const strategy = (0, recovery_strategies_1.calculateRecoveryStrategyForFlashcards)(difficulties, projectName);
        console.log(`🧠 [Recovery Flashcards] Strategy: ${strategy.strategyType.toUpperCase()}`);
        console.log(`🧠 [Recovery Flashcards] Focus: ${strategy.focusPercentage}%`);
        // 4. Get Sources
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where("status", "==", "ready")
            .orderBy("created_at", "desc")
            .get();
        const sources = sourcesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        if (sources.length === 0) {
            throw new https_1.HttpsError("failed-precondition", "No sources found for this project");
        }
        const sourceIds = sources.map(s => s.id);
        // 5. Surgical Semantic Search
        let combinedContent = "";
        // Check if we have embeddings (using our helper which checks Firestore)
        const useSemanticSearch = await (0, embeddings_1.hasAnyEmbeddings)(db, sourceIds);
        // ✅ Seleção automática e inteligente (Moved up)
        const selector = (0, modelSelector_1.getModelSelector)();
        if (useSemanticSearch) {
            try {
                console.log(`🔍 [Recovery Flashcards] Performing surgical semantic search...`);
                const embeddingModel = await selector.selectBestModel('embedding');
                console.log(`🤖 Using embedding model: ${embeddingModel}`);
                const allRelevantChunks = [];
                const tokenBudgetPerQuery = Math.floor(RECOVERY_FLASHCARDS_TOKEN_LIMIT / strategy.searchQueries.length);
                for (const query of strategy.searchQueries) {
                    console.log(`   🔎 Searching: "${query}" (budget: ${tokenBudgetPerQuery} tokens)`);
                    const chunks = await (0, embeddings_1.semanticSearchWithTokenLimit)(db, query, sourceIds, tokenBudgetPerQuery, 0.5, // default threshold
                    embeddingModel);
                    allRelevantChunks.push(...chunks);
                }
                // Remove duplicates
                const uniqueChunks = Array.from(new Map(allRelevantChunks.map(chunk => [chunk.id, chunk])).values());
                console.log(`📊 [Recovery Flashcards] Total chunks found: ${allRelevantChunks.length}`);
                console.log(`📊 [Recovery Flashcards] Unique chunks: ${uniqueChunks.length}`);
                const totalTokens = uniqueChunks.reduce((sum, c) => sum + c.tokenCount, 0);
                console.log(`📊 [Recovery Flashcards] Total tokens: ${totalTokens}`);
                combinedContent = uniqueChunks
                    .map(c => c.content)
                    .join('\n\n---\n\n');
            }
            catch (e) {
                console.warn("⚠️ [Recovery Flashcards] Semantic search failed, fallback to text.", e);
                // Fallback to extracted content
                const MAX_CONTENT_LENGTH = 30000;
                let usedSources = sources.slice(0, 3);
                for (const source of usedSources) {
                    if (source.extracted_content) {
                        combinedContent += `\n\n=== ${(0, sanitization_1.sanitizeString)(source.name)} ===\n${(0, sanitization_1.sanitizeString)(source.extracted_content)}`;
                    }
                }
                if (combinedContent.length > MAX_CONTENT_LENGTH) {
                    combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
                }
            }
        }
        else {
            // No embeddings available
            console.log(`⚠️ [Recovery Flashcards] No embeddings found, using extracted content`);
            const MAX_CONTENT_LENGTH = 30000;
            let usedSources = sources.slice(0, 3);
            for (const source of usedSources) {
                if (source.extracted_content) {
                    combinedContent += `\n\n=== ${(0, sanitization_1.sanitizeString)(source.name)} ===\n${(0, sanitization_1.sanitizeString)(source.extracted_content)}`;
                }
            }
            if (combinedContent.length > MAX_CONTENT_LENGTH) {
                combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
            }
        }
        if (!combinedContent.trim()) {
            throw new https_1.HttpsError("failed-precondition", "No content available for recovery flashcards.");
        }
        // 6. Generate Flashcards with Atomization Prompt
        const batchSizes = (0, output_limits_1.calculateBatchSizes)('FLASHCARD', count || 10);
        const sessionId = crypto.randomUUID();
        const allFlashcards = [];
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
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 32768, true);
            }
            catch (error) {
                // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                if (error.status === 404 || error.message.includes('not found')) {
                    console.warn('⚠️ Primary model failed, trying fallback...');
                    const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                    console.log(`🤖 Using fallback model: ${fallbackModel}`);
                    modelName = fallbackModel; // Update for next batches and logging
                    result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 32768, true);
                }
                else {
                    throw error;
                }
            }
            const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
                allFlashcards.push(...parsed.flashcards);
                totalInputTokens += result.usage.inputTokens;
                totalOutputTokens += result.usage.outputTokens;
                console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.flashcards.length} recovery flashcards`);
            }
        }
        // 7. Sanitization and Persistence
        const flashcardsToInsert = allFlashcards.map((f) => ({
            project_id,
            user_id: userId,
            source_id: null,
            session_id: sessionId,
            frente: (0, sanitization_1.sanitizeString)(f.frente || ''),
            verso: (0, sanitization_1.sanitizeString)(f.verso || ''),
            topico: f.topico ? (0, sanitization_1.sanitizeString)(f.topico) : null,
            dificuldade: ['fácil', 'médio', 'difícil'].includes(f.dificuldade) ? f.dificuldade : 'médio',
            content_type: 'recovery',
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
        await (0, token_usage_1.logTokenUsage)(userId, project_id, "recovery_flashcards", totalInputTokens, totalOutputTokens, modelName, // Log the actual model used
        {
            count: flashcardsToInsert.length,
            strategy: strategy.strategyType,
            batches: batchSizes.length
        });
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
    }
    catch (error) {
        console.error("❌ [Recovery Flashcards] Error:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to generate recovery flashcards");
    }
});
//# sourceMappingURL=generate_recovery_flashcards.js.map