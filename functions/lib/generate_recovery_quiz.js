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
exports.generate_recovery_quiz = void 0;
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
const language_helper_1 = require("./shared/language_helper");
// Recovery Mode Token Limit (slightly less than normal quiz for focused content)
const RECOVERY_TOKEN_LIMIT = 12000;
exports.generate_recovery_quiz = (0, https_1.onCall)({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1",
}, async (request) => {
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
        }
        const { project_id, count, difficulty } = (0, validation_1.validateRequest)(request.data, validation_1.generateRecoveryQuizSchema);
        const userId = request.auth.uid;
        // 2. Get user's language preference
        const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, userId);
        // 1. Get Project Information
        const projectDoc = await db.collection("projects").doc(project_id).get();
        if (!projectDoc.exists) {
            throw new https_1.HttpsError("not-found", "Project not found");
        }
        const project = projectDoc.data();
        const projectName = (project === null || project === void 0 ? void 0 : project.name) || 'Medicina';
        console.log(`🎯 [Recovery Quiz] Starting for project: ${projectName}`);
        console.log(`🎯 [Recovery Quiz] User: ${userId}`);
        // 2. Fetch Unresolved Difficulties
        const difficultiesSnapshot = await db.collection("difficulties")
            .where("user_id", "==", userId)
            .where("project_id", "==", project_id)
            .where("resolvido", "==", false)
            .orderBy("nivel", "desc")
            .limit(5)
            .get();
        const difficulties = difficultiesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        console.log(`📊 [Recovery Quiz] Found ${difficulties.length} unresolved difficulties`);
        console.log(`📊 [Recovery Quiz] Topics: ${(0, recovery_strategies_1.formatDifficultiesForLog)(difficulties)}`);
        // 3. Calculate Recovery Strategy
        const strategy = (0, recovery_strategies_1.calculateRecoveryStrategy)(difficulties, projectName);
        console.log(`🧠 [Recovery Quiz] Strategy: ${strategy.strategyType.toUpperCase()}`);
        console.log(`🧠 [Recovery Quiz] Focus: ${strategy.focusPercentage}%`);
        console.log(`🧠 [Recovery Quiz] Search queries: ${strategy.searchQueries.length}`);
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
        const useSemanticSearch = await (0, embeddings_1.hasAnyEmbeddings)(db, sourceIds);
        // ✅ Seleção automática e inteligente (Moved up)
        const selector = (0, modelSelector_1.getModelSelector)();
        if (useSemanticSearch) {
            try {
                console.log(`🔍 [Recovery Quiz] Performing surgical semantic search...`);
                const embeddingModel = await selector.selectBestModel('embedding');
                console.log(`🤖 Using embedding model: ${embeddingModel}`);
                const allRelevantChunks = [];
                const tokenBudgetPerQuery = Math.floor(RECOVERY_TOKEN_LIMIT / strategy.searchQueries.length);
                for (const query of strategy.searchQueries) {
                    console.log(`   🔎 Searching: "${query}" (budget: ${tokenBudgetPerQuery} tokens)`);
                    const chunks = await (0, embeddings_1.semanticSearchWithTokenLimit)(db, query, sourceIds, tokenBudgetPerQuery, 0.5, // default threshold
                    embeddingModel);
                    allRelevantChunks.push(...chunks);
                }
                // Remove duplicates
                const uniqueChunks = Array.from(new Map(allRelevantChunks.map(chunk => [chunk.id, chunk])).values());
                console.log(`📊 [Recovery Quiz] Total chunks found: ${allRelevantChunks.length}`);
                console.log(`📊 [Recovery Quiz] Unique chunks: ${uniqueChunks.length}`);
                const totalTokens = uniqueChunks.reduce((sum, c) => sum + c.tokenCount, 0);
                console.log(`📊 [Recovery Quiz] Total tokens: ${totalTokens}`);
                combinedContent = uniqueChunks
                    .map(c => c.content)
                    .join('\n\n---\n\n');
            }
            catch (e) {
                console.warn("⚠️ [Recovery Quiz] Semantic search failed, fallback to text.", e);
                // Fallback to extracted content
                const MAX_CONTENT_LENGTH = 30000;
                let usedSources = sources.slice(0, 3);
                for (const source of usedSources) {
                    if (source.extracted_content) {
                        combinedContent += `\n\n=== ${(0, sanitization_1.cleanString)(source.name)} ===\n${(0, sanitization_1.cleanString)(source.extracted_content)}`;
                    }
                }
                if (combinedContent.length > MAX_CONTENT_LENGTH) {
                    combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
                }
            }
        }
        else {
            // No embeddings available
            console.log(`⚠️ [Recovery Quiz] No embeddings found, using extracted content`);
            const MAX_CONTENT_LENGTH = 30000;
            let usedSources = sources.slice(0, 3);
            for (const source of usedSources) {
                if (source.extracted_content) {
                    combinedContent += `\n\n=== ${(0, sanitization_1.cleanString)(source.name)} ===\n${(0, sanitization_1.cleanString)(source.extracted_content)}`;
                }
            }
            if (combinedContent.length > MAX_CONTENT_LENGTH) {
                combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH) + '...';
            }
        }
        if (!combinedContent.trim()) {
            throw new https_1.HttpsError("failed-precondition", "No content available for recovery quiz.");
        }
        // 6. Generate Quiz with Strategy-Specific Prompt
        const batchSizes = (0, output_limits_1.calculateBatchSizes)('QUIZ_MULTIPLE_CHOICE', count || 10);
        const sessionId = crypto.randomUUID();
        const allQuestions = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        // ✅ Seleção automática e inteligente (Already initialized above)
        let modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for recovery quiz generation`);
        // Generate questions in batches
        for (let i = 0; i < batchSizes.length; i++) {
            const batchCount = batchSizes[i];
            const batchNum = i + 1;
            console.log(`🔄 [Batch ${batchNum}/${batchSizes.length}] Generating ${batchCount} recovery questions...`);
            // Build prompt with strategy-specific instructions
            const trueFalseOpts = (0, language_helper_1.getTrueFalseOptions)(language);
            const texts = (0, language_helper_1.getPromptTexts)(language);
            const prompt = `
${texts.professorIntro} ${texts.recoveryTitle}.

${strategy.systemInstruction}

${(0, language_helper_1.getLanguageInstruction)(language)}

BASE CONTENT:
${combinedContent}

Generate ${batchCount} multiple choice questions.

${texts.questionTypes} (Vary):
1. "multipla_escolha": ${texts.multipleChoice}.
2. "verdadeiro_falso": ${texts.trueFalse} (Options: ${trueFalseOpts.display}).
3. "citar": ${texts.citation} (4 options).
4. "caso_clinico": ${texts.clinicalCase}.

${texts.formatRules} (Strict):
- ALL questions must have ONLY ONE correct alternative.
- Options must always be arrays of strings: ["A) Text", "B) Text"...] or ${trueFalseOpts.display}.

${texts.justificationRules} (Extra Important for Recovery):
This is a RECOVERY quiz. The student got this wrong before. The justification must:
1. CITE THE SOURCE: "${texts.accordingToText}", "The material indicates that...", "According to the source..."
2. BE EDUCATIONAL: Explain WHY the alternative is correct (don't just repeat the fact)
3. CORRECT COMMON MISTAKES: If the student may have confused concepts, clarify the difference
4. ${(0, language_helper_1.getLanguageInstruction)(language)}
5. ${texts.conciseness}: 2-3 sentences maximum

JSON FORMAT:
{
  "perguntas": [
    ${(0, language_helper_1.getQuizExample)(language)}
  ]
}

Return ONLY valid JSON.
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
            let parsed;
            try {
                parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            }
            catch (parseError) {
                // Attempt to extract JSON substring if the response contains extra text or malformed characters
                const jsonMatch = result.text.match(/\{[\s\S]*\}\s*$/);
                if (jsonMatch) {
                    try {
                        parsed = JSON.parse(jsonMatch[0]);
                    }
                    catch (innerError) {
                        console.warn('⚠️ Failed to parse extracted JSON, skipping batch.', innerError);
                        parsed = { perguntas: [] };
                    }
                }
                else {
                    console.warn('⚠️ No JSON found in Gemini response, skipping batch.', parseError);
                    parsed = { perguntas: [] };
                }
            }
            if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
                allQuestions.push(...parsed.perguntas);
                totalInputTokens += result.usage.inputTokens;
                totalOutputTokens += result.usage.outputTokens;
                console.log(`✅ [Batch ${batchNum}/${batchSizes.length}] Generated ${parsed.perguntas.length} recovery questions`);
            }
        }
        // 7. Sanitization and Persistence
        const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];
        const questionsToInsert = allQuestions.map((q) => {
            let respostaLimpa = (0, sanitization_1.cleanString)(q.resposta_correta || "");
            const tipo = validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha";
            if (tipo === "verdadeiro_falso") {
                const normalized = respostaLimpa.toLowerCase();
                if (normalized.includes("verdadeiro") || normalized === "v") {
                    respostaLimpa = "Verdadeiro";
                }
                else if (normalized.includes("falso") || normalized === "f") {
                    respostaLimpa = "Falso";
                }
            }
            return {
                project_id,
                user_id: userId,
                session_id: sessionId,
                pergunta: (0, sanitization_1.cleanString)(q.pergunta || q.question || ""),
                opcoes: Array.isArray(q.opcoes) ? q.opcoes.map(sanitization_1.cleanString) : [],
                resposta_correta: respostaLimpa,
                justificativa: (0, sanitization_1.cleanString)(q.justificativa || ""),
                dica: q.dica ? (0, sanitization_1.cleanString)(q.dica) : null,
                tipo,
                dificuldade: q.dificuldade || difficulty || "médio",
                topico: q.topico ? (0, sanitization_1.cleanString)(q.topico) : null,
                content_type: 'recovery',
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            };
        });
        const batch = db.batch();
        const questionsRef = db.collection("questions");
        questionsToInsert.forEach(q => {
            const docRef = questionsRef.doc();
            batch.set(docRef, q);
        });
        await batch.commit();
        console.log(`✅ [Recovery Quiz] Saved ${questionsToInsert.length} questions to database`);
        // 8. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(userId, project_id, "recovery_quiz", totalInputTokens, totalOutputTokens, modelName, // Log the actual model used
        {
            count: questionsToInsert.length,
            strategy: strategy.strategyType,
            batches: batchSizes.length,
            difficulty
        });
        return {
            success: true,
            questions: questionsToInsert,
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
        console.error("❌ [Recovery Quiz] Error:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to generate recovery quiz");
    }
});
//# sourceMappingURL=generate_recovery_quiz.js.map