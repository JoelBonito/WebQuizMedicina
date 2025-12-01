import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { generateFlashcardsSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

export const generate_flashcards = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
        // 2. Validation
        const { source_id, project_id, count } = validateRequest(data, generateFlashcardsSchema);

        // 3. Fetch Content (Sources)
        let sources: any[] = [];
        if (source_id) {
            const sourceDoc = await db.collection("sources").doc(source_id).get();
            if (!sourceDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Source not found");
            }
            sources = [{ id: sourceDoc.id, ...sourceDoc.data() }];
        } else if (project_id) {
            const sourcesSnapshot = await db.collection("sources")
                .where("project_id", "==", project_id)
                .where("status", "==", "ready")
                .orderBy("created_at", "desc")
                .get();

            sources = sourcesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
                combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
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

        let parsed: any;
        let result: any;

        // ✅ Seleção automática e inteligente
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for flashcards generation`);

        try {
            try {
                result = await callGeminiWithUsage(prompt, modelName, 8192, true);
            } catch (error: any) {
                // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                if (error.status === 404 || error.message.includes('not found')) {
                    console.warn('⚠️ Primary model failed, trying fallback...');
                    const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                    console.log(`🤖 Using fallback model: ${fallbackModel}`);
                    result = await callGeminiWithUsage(prompt, fallbackModel, 8192, true);
                } else {
                    throw error;
                }
            }

            // Attempt to parse, handling potential markdown wrappers if parseJsonFromResponse doesn't catch them all
            try {
                parsed = parseJsonFromResponse(result.text);
            } catch (jsonError) {
                console.warn("Initial JSON parse failed, trying to clean markdown...", jsonError);
                const cleanedText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
                parsed = JSON.parse(cleanedText);
            }
        } catch (error: any) {
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

        const insertedFlashcards: any[] = [];

        for (const f of parsed.flashcards) {
            const flashcardRef = flashcardsCollection.doc();

            const newFlashcard = {
                project_id: project_id || sources[0].project_id,
                user_id: context.auth.uid,
                source_id: source_id || null,
                session_id: sessionId,
                frente: sanitizeString(f.frente || ""),
                verso: sanitizeString(f.verso || ""),
                topico: f.topico ? sanitizeString(f.topico) : "Geral",
                dificuldade: f.dificuldade || "médio",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            };

            batch.set(flashcardRef, newFlashcard);
            insertedFlashcards.push({ id: flashcardRef.id, ...newFlashcard });
        }

        await batch.commit();

        // 7. Log Token Usage
        if (result && result.usage) {
            await logTokenUsage(
                context.auth.uid,
                project_id || sources[0].project_id,
                "flashcards",
                result.usage.inputTokens,
                result.usage.outputTokens,
                modelName, // Log the actual model used
                { count, source_count: sources.length }
            );
        }


        return {
            success: true,
            count: insertedFlashcards.length,
            session_id: sessionId,
            flashcards: insertedFlashcards,
        };

    } catch (error: any) {
        console.error("Error in generate_flashcards:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
