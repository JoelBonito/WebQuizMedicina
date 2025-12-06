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
exports.generate_quiz = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("./shared/validation");
const gemini_1 = require("./shared/gemini");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const language_helper_1 = require("./shared/language_helper");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.generate_quiz = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1"
}, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // 2. Get user's language preference
    const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, request.auth.uid);
    try {
        // 3. Validation
        const { source_ids, project_id, count, difficulty } = (0, validation_1.validateRequest)(request.data, validation_1.generateQuizSchema);
        // 3. Fetch Content (Sources)
        let sources = [];
        if (source_ids && source_ids.length > 0) {
            const sourcesSnapshot = await db.collection("sources")
                .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
                .get();
            sources = sourcesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        }
        else if (project_id) {
            const sourcesSnapshot = await db.collection("sources")
                .where("project_id", "==", project_id)
                .where("status", "==", "ready")
                .orderBy("created_at", "desc")
                .get();
            sources = sourcesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        }
        if (sources.length === 0) {
            throw new https_1.HttpsError("not-found", "No sources found");
        }
        // Validate content availability
        const sourcesWithContent = sources.filter(s => s.extracted_content && s.extracted_content.trim());
        if (sourcesWithContent.length === 0) {
            throw new https_1.HttpsError("failed-precondition", "Sources found but no content available.");
        }
        // 4. Prepare Content for AI
        let combinedContent = "";
        const MAX_SOURCES = 5;
        const usedSources = sourcesWithContent.slice(0, MAX_SOURCES);
        for (const source of usedSources) {
            if (source.extracted_content) {
                combinedContent += `\n\n=== ${(0, validation_1.sanitizeString)(source.name)} ===\n${(0, validation_1.sanitizeString)(source.extracted_content)}`;
            }
        }
        const MAX_CONTENT_LENGTH = 300000;
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
            combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
        }
        if (!combinedContent.trim()) {
            throw new https_1.HttpsError("failed-precondition", "No content available for generation");
        }
        // 5. Generate Quiz
        // Simplified batching for now (single batch)
        // In a real scenario, we might want to implement the batching logic from the Supabase function
        const prompt = `
Você é um professor universitário de MEDICINA criando uma prova.
Gere ${count} questões baseadas no CONTEÚDO abaixo.

CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

REGRA CRÍTICA DE DIVERSIFICAÇÃO:
- DISTRIBUA as questões entre DIFERENTES TÓPICOS identificados no conteúdo
- EVITE concentrar mais de 30% das questões em um único tópico

TIPOS DE QUESTÃO (Varie):
1. "multipla_escolha": Conceitos diretos.
2. "verdadeiro_falso": Julgue a afirmação (Opções: [Verdadeiro, Falso]).
3. "citar": "Qual destes é um exemplo de..." (4 opções).
4. "caso_clinico": Cenário curto + conduta.

REGRAS DE FORMATO (Rígidas):
- TODAS as questões devem ter APENAS UMA alternativa correta.
- Opções devem ser sempre arrays de strings: ["A) Texto", "B) Texto"...] ou ["Verdadeiro", "Falso"].

REGRAS PARA A JUSTIFICATIVA (Obrigatório):
Quero uma justificativa CURTA que valide a resposta certa usando o texto fornecido.
1. CITE A FONTE: Comece frases com "Segundo o texto...", "O material indica que...".
2. ${(0, language_helper_1.getLanguageInstruction)(language)}
3. CONCISÃO: Máximo de 2 a 3 frases.

${(difficulty && difficulty !== 'misto') ? `DIFICULDADE: TODAS as questões devem ser de nível "${difficulty}".` : 'DIFICULDADE: Varie o nível de dificuldade das questões entre fácil, médio e difícil.'}

FORMATO JSON (OBRIGATÓRIO - SEM MARKDOWN):
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para...",
      "opcoes": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D"],
      "resposta_correta": "A",
      "justificativa": "Conforme o texto...",
      "dica": "Pense na droga que...",
      "dificuldade": "médio",
      "topico": "Cardiologia"
    }
  ]
}
    `;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for quiz generation`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 8192, true);
        }
        catch (error) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 8192, true);
            }
            else {
                throw error;
            }
        }
        const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
        if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
            throw new https_1.HttpsError("internal", "Failed to generate valid questions format");
        }
        // 6. Save Questions to Firestore
        const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];
        const batch = db.batch();
        const questionsCollection = db.collection("questions");
        const sessionId = admin.firestore().collection("_").doc().id; // Generate a random ID
        const insertedQuestions = [];
        for (const q of parsed.perguntas) {
            const tipo = validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha";
            const questionRef = questionsCollection.doc();
            const newQuestion = {
                project_id: project_id || sources[0].project_id,
                user_id: request.auth.uid,
                source_id: (source_ids && source_ids.length === 1) ? source_ids[0] : null,
                session_id: sessionId,
                tipo: tipo,
                pergunta: (0, validation_1.sanitizeString)(q.pergunta || ""),
                opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((opt) => (0, validation_1.sanitizeString)(opt)) : [],
                resposta_correta: (0, validation_1.sanitizeString)(q.resposta_correta || ""),
                justificativa: (0, validation_1.sanitizeString)(q.justificativa || ""),
                dica: q.dica ? (0, validation_1.sanitizeString)(q.dica) : null,
                topico: q.topico ? (0, validation_1.sanitizeString)(q.topico) : "Geral",
                dificuldade: q.dificuldade || "médio",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            };
            batch.set(questionRef, newQuestion);
            insertedQuestions.push(Object.assign({ id: questionRef.id }, newQuestion));
        }
        await batch.commit();
        // 7. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(request.auth.uid, project_id || sources[0].project_id, "quiz", result.usage.inputTokens, result.usage.outputTokens, modelName, // Log the actual model used
        { count, difficulty, source_count: sources.length });
        return {
            success: true,
            count: insertedQuestions.length,
            session_id: sessionId,
            questions: insertedQuestions,
        };
    }
    catch (error) {
        console.error("Error in generate_quiz:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=generate_quiz.js.map