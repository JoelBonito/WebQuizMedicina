import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { chatSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";



export const chat = onCall({
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = request.auth.uid;

    try {
        // 2. Get user's language preference
        const language = await getLanguageFromRequest(request.data, db, userId);

        // 3. Validation
        const { message, project_id } = validateRequest(request.data, chatSchema);

        // 3. Save User Message
        await db.collection("chat_messages").add({
            project_id,
            user_id: userId,
            role: "user",
            content: sanitizeString(message),
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
        const sourcesCited: any[] = [];

        sourcesSnapshot.forEach(doc => {
            const source = doc.data();
            if (source.extracted_content) {
                contextText += `\n\n=== FONTE: ${source.name} ===\n${source.extracted_content.substring(0, 10000)}`;
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
${getLanguageInstruction(language)}
Use o CONTEÚDO ABAIXO para responder à pergunta do aluno.
Se a resposta não estiver no conteúdo, diga que não encontrou a informação nas fontes fornecidas, mas tente ajudar com seu conhecimento geral (deixando claro a distinção).

CONTEÚDO:
${contextText}
    `;

        const prompt = `${systemPrompt}\n\nPERGUNTA DO ALUNO: ${message}`;

        // ✅ Seleção automática e inteligente
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for chat`);

        let result;
        try {
            result = await callGeminiWithUsage(prompt, modelName, 2048, false);
        } catch (error: any) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await callGeminiWithUsage(prompt, fallbackModel, 2048, false);
            } else {
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
            sources_cited: sourcesCited.map(s => s.file_name), // Store names for simple display
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 7. Log Token Usage
        await logTokenUsage(
            userId,
            project_id,
            "chat",
            result.usage.inputTokens,
            result.usage.outputTokens,
            modelName, // Log the actual model used
            { source_count: sourcesCited.length }
        );

        return {
            response: responseText,
            cited_sources: sourcesCited,
            suggested_topics: [], // Implement topic suggestion logic if needed
            has_difficulties_context: false
        };

    } catch (error: any) {
        console.error("Error in chat function:", error);
        throw new HttpsError("internal", error.message || "Failed to process chat message");
    }
});
