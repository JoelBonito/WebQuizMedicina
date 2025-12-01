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
exports.generate_flashcards = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("./shared/validation");
const gemini_1 = require("./shared/gemini");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.generate_flashcards = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        // 2. Validation
        const { source_id, project_id, count } = (0, validation_1.validateRequest)(data, validation_1.generateFlashcardsSchema);
        // 3. Fetch Content (Sources)
        let sources = [];
        if (source_id) {
            const sourceDoc = await db.collection("sources").doc(source_id).get();
            if (!sourceDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Source not found");
            }
            sources = [Object.assign({ id: sourceDoc.id }, sourceDoc.data())];
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
            throw new functions.https.HttpsError("not-found", "No sources found");
        }
        // Validate content availability
        const sourcesWithContent = sources.filter(s => s.extracted_content && s.extracted_content.trim());
        if (sourcesWithContent.length === 0) {
            throw new functions.https.HttpsError("failed-precondition", "Sources found but no content available.");
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
            throw new functions.https.HttpsError("failed-precondition", "No content available for generation");
        }
        // 5. Generate Flashcards
        const prompt = `
Você é um especialista em criar Flashcards de Medicina para Anki.
Crie ${count} flashcards baseados no CONTEÚDO abaixo.

CONTEÚDO BASE:
${combinedContent.substring(0, 30000)}

REGRAS DE CRIAÇÃO:
1. FOCO EM CONCEITOS CHAVE: Definições, tratamentos, diagnósticos, valores de referência.
2. PERGUNTAS DIRETAS: "Qual o tratamento de...", "O que caracteriza...", "Qual a dose de...".
3. RESPOSTAS CONCISAS: Vá direto ao ponto. Evite textos longos no verso.
4. ATOMICIDADE: Cada flashcard deve testar UM único conceito.

FORMATO JSON OBRIGATÓRIO (SEM MARKDOWN):
Retorne APENAS o JSON cru, sem blocos de código (\`\`\`).
{
  "flashcards": [
    {
      "frente": "Qual o tratamento de primeira linha para Hipertensão em negros?",
      "verso": "Tiazídicos ou Bloqueadores de Canal de Cálcio (BCC).",
      "topico": "Cardiologia",
      "dificuldade": "médio"
    }
  ]
}
    `;
        let parsed;
        let result;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for flashcards generation`);
        try {
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
            // Attempt to parse, handling potential markdown wrappers if parseJsonFromResponse doesn't catch them all
            try {
                parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            }
            catch (jsonError) {
                console.warn("Initial JSON parse failed, trying to clean markdown...", jsonError);
                const cleanedText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
                parsed = JSON.parse(cleanedText);
            }
        }
        catch (error) {
            console.error("AI Generation or Parsing Error:", error);
            throw new functions.https.HttpsError("internal", "Failed to generate valid JSON from AI: " + error.message);
        }
        if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
            throw new functions.https.HttpsError("internal", "Failed to generate valid flashcards format");
        }
        // 6. Save Flashcards to Firestore
        const batch = db.batch();
        const flashcardsCollection = db.collection("flashcards");
        const sessionId = admin.firestore().collection("_").doc().id;
        const insertedFlashcards = [];
        for (const f of parsed.flashcards) {
            const flashcardRef = flashcardsCollection.doc();
            const newFlashcard = {
                project_id: project_id || sources[0].project_id,
                user_id: context.auth.uid,
                source_id: source_id || null,
                session_id: sessionId,
                frente: (0, validation_1.sanitizeString)(f.frente || ""),
                verso: (0, validation_1.sanitizeString)(f.verso || ""),
                topico: f.topico ? (0, validation_1.sanitizeString)(f.topico) : "Geral",
                dificuldade: f.dificuldade || "médio",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            };
            batch.set(flashcardRef, newFlashcard);
            insertedFlashcards.push(Object.assign({ id: flashcardRef.id }, newFlashcard));
        }
        await batch.commit();
        // 7. Log Token Usage
        if (result && result.usage) {
            await (0, token_usage_1.logTokenUsage)(context.auth.uid, project_id || sources[0].project_id, "flashcards", result.usage.inputTokens, result.usage.outputTokens, modelName, // Log the actual model used
            { count, source_count: sources.length });
        }
        return {
            success: true,
            count: insertedFlashcards.length,
            session_id: sessionId,
            flashcards: insertedFlashcards,
        };
    }
    catch (error) {
        console.error("Error in generate_flashcards:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=generate_flashcards.js.map