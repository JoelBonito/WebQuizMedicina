import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateFlashcardsSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";



export const generate_flashcards = onCall({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
        // 2. Get user's language preference
        const language = await getLanguageFromRequest(request.data, db, request.auth.uid);

        // 3. Validation
        const { source_id, project_id, count } = validateRequest(request.data, generateFlashcardsSchema);

        // 3. Fetch Content (Sources)
        let sources: any[] = [];
        if (source_id) {
            const sourceDoc = await db.collection("sources").doc(source_id).get();
            if (!sourceDoc.exists) {
                throw new HttpsError("not-found", "Source not found");
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
            throw new HttpsError("not-found", "No sources found");
        }

        // Validate content availability
        const sourcesWithContent = sources.filter(s => s.extracted_content && s.extracted_content.trim());
        if (sourcesWithContent.length === 0) {
            throw new HttpsError("failed-precondition", "Sources found but no content available.");
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
            throw new HttpsError("failed-precondition", "No content available for generation");
        }

        // 5. Generate Flashcards
        const prompt = `
${getLanguageInstruction(language)}

You are a specialist in creating Medicine Flashcards for Anki.
Create ${count} flashcards based on the CONTENT below.

BASE CONTENT:
${combinedContent.substring(0, 30000)}

CREATION RULES:
1. FOCUS ON KEY CONCEPTS: Definitions, treatments, diagnoses, reference values.
2. DIRECT QUESTIONS: "What is the treatment for...", "What characterizes...", "What is the dose of...".
3. CONCISE ANSWERS: Get straight to the point. Avoid long texts on the back.
4. ATOMICITY: Each flashcard should test ONE single concept.
5. ${getLanguageInstruction(language)}

MANDATORY JSON FORMAT (NO MARKDOWN):
Return ONLY raw JSON, without code blocks (\`\`\`).
{
  "flashcards": [
    {
      "frente": "What is the first-line treatment for Hypertension in blacks?",
      "verso": "Thiazides or Calcium Channel Blockers (CCB).",
      "topico": "Cardiology",
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
                result = await callGeminiWithUsage(prompt, modelName, 32768, true);
            } catch (error: any) {
                // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                if (error.status === 404 || error.message.includes('not found')) {
                    console.warn('⚠️ Primary model failed, trying fallback...');
                    const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                    console.log(`🤖 Using fallback model: ${fallbackModel}`);
                    result = await callGeminiWithUsage(prompt, fallbackModel, 32768, true);
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
            throw new HttpsError("internal", "Failed to generate valid JSON from AI: " + error.message);
        }

        if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
            throw new HttpsError("internal", "Failed to generate valid flashcards format");
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
                user_id: request.auth.uid,
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
                request.auth.uid,
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
        throw new HttpsError("internal", error.message);
    }
});
