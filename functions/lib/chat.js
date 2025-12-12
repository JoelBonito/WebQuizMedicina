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
exports.chat = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("./shared/validation");
const gemini_1 = require("./shared/gemini");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const language_helper_1 = require("./shared/language_helper");
exports.chat = (0, https_1.onCall)({
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = request.auth.uid;
    try {
        // 2. Get user's language preference
        const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, userId);
        // 3. Validation
        const { message, project_id } = (0, validation_1.validateRequest)(request.data, validation_1.chatSchema);
        // 3. Save User Message
        await db.collection("chat_messages").add({
            project_id,
            user_id: userId,
            role: "user",
            content: (0, validation_1.sanitizeString)(message),
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 4. Fetch Context (Sources)
        // Limit to recent sources or specific logic if needed
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where("status", "==", "ready")
            .orderBy("created_at", "desc")
            .limit(3)
            .get();
        let contextText = "";
        const sourcesCited = [];
        sourcesSnapshot.forEach(doc => {
            const source = doc.data();
            if (source.extracted_content) {
                contextText += `\n\n=== FONTE: ${source.name} ===\n${source.extracted_content.substring(0, 50000)}`;
                sourcesCited.push({
                    id: doc.id,
                    file_name: source.name,
                    file_type: source.type
                });
            }
        });
        // 5. Call AI
        const systemPrompt = `
Você é um assistente tutor de medicina.
${(0, language_helper_1.getLanguageInstruction)(language)}
Use o CONTEÚDO ABAIXO para responder à pergunta do aluno.
Se a resposta não estiver no conteúdo, diga que não encontrou a informação nas fontes fornecidas, mas tente ajudar com seu conhecimento geral (deixando claro a distinção).

CONTEÚDO:
${contextText}
    `;
        const prompt = `${systemPrompt}\n\nPERGUNTA DO ALUNO: ${message}`;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for chat`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 2048, false);
        }
        catch (error) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 2048, false);
            }
            else {
                throw error;
            }
        }
        const responseText = result.text;
        // 6. Save Assistant Response
        await db.collection("chat_messages").add({
            project_id,
            user_id: userId,
            role: "assistant",
            content: responseText,
            sources_cited: sourcesCited.map(s => s.file_name),
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 7. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(userId, project_id, "chat", result.usage.inputTokens, result.usage.outputTokens, modelName, // Log the actual model used
        { source_count: sourcesCited.length });
        return {
            response: responseText,
            cited_sources: sourcesCited,
            suggested_topics: [],
            has_difficulties_context: false
        };
    }
    catch (error) {
        console.error("Error in chat function:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to process chat message");
    }
});
//# sourceMappingURL=chat.js.map