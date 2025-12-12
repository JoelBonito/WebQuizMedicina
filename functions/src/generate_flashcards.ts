import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateFlashcardsSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction, getFlashcardExample } from "./shared/language_helper";
import {
    aggregateTopicsFromSources,
    calculateDistribution,
    formatDistributionForPrompt,
    extractTopicsFromContent
} from "./shared/topic_extractor";



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
        const { source_ids, source_id, project_id, count: requestedCount, difficulty } = validateRequest(request.data, generateFlashcardsSchema);
        const count = requestedCount ?? 10; // Default de 10 flashcards

        // 3. Fetch Content (Sources)
        let sources: any[] = [];
        if (source_ids && source_ids.length > 0) {
            const sourcesSnapshot = await db.collection("sources")
                .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
                .get();
            sources = sourcesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else if (source_id) {
            const sourceDoc = await db.collection("sources").doc(source_id).get();
            if (!sourceDoc.exists) {
                throw new HttpsError("not-found", "Source not found");
            }
            sources = [{ id: sourceDoc.id, ...sourceDoc.data() }];
        } else if (project_id) {
            const sourcesSnapshot = await db.collection("sources")
                .where("project_id", "==", project_id)
                .where("status", "==", "ready")
                // Removido orderBy e limit para pegar TODO o projeto
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

        // Removido limite arbitrário de fontes (MAX_SOURCES)
        const usedSources = sourcesWithContent;

        for (const source of usedSources) {
            if (source.extracted_content) {
                combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
            }
        }

        // Increased limit to ~2MB to support full project context
        const MAX_CONTENT_LENGTH = 2000000;
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
            console.warn(`⚠️ Content truncated. Total: ${combinedContent.length}, Limit: ${MAX_CONTENT_LENGTH}`);
            combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
        }

        if (!combinedContent.trim()) {
            throw new HttpsError("failed-precondition", "No content available for generation");
        }

        // 🆕 5. Agregar e Calcular Distribuição de Tópicos
        let allTopics = aggregateTopicsFromSources(usedSources);

        // Fallback: Se nenhum source tem tópicos, extrai sob demanda
        if (allTopics.length === 0) {
            console.warn('⚠️ No topics found in sources. Extracting on-demand...');
            const selector = getModelSelector();
            const topicModel = await selector.selectBestModel('general');
            allTopics = await extractTopicsFromContent(combinedContent, topicModel);
            console.log(`✅ Extracted ${allTopics.length} topics on-demand`);
        }

        // Calcular distribuição (adaptar prompt para flashcards)
        const distribution = calculateDistribution(allTopics, count);
        let distributionPrompt = formatDistributionForPrompt(distribution);
        distributionPrompt = distributionPrompt.replace(/questão/g, 'flashcard').replace(/questões/g, 'flashcards');
        console.log(`📊 Topic distribution: ${distribution.map(d => `${d.topic}:${d.quota}`).join(', ')}`);

        // 6. Generate Flashcards
        const prompt = `
${getLanguageInstruction(language)}

You are a specialist in creating Medicine Flashcards for Anki.
Create EXACTLY ${count} flashcards based on the CONTENT below.

BASE CONTENT:
${combinedContent}

${distributionPrompt}

CREATION RULES:
1. FOCUS ON KEY CONCEPTS: Definitions, treatments, diagnoses, reference values.
2. DIRECT QUESTIONS: "What is the treatment for...", "What characterizes...", "What is the dose of...".
3. CONCISE ANSWERS: Get straight to the point. Avoid long texts on the back.
4. ATOMICITY: Each flashcard should test ONE single concept.
5. ${getLanguageInstruction(language)}
${(difficulty && difficulty !== 'misto') ? `6. DIFFICULTY: ALL flashcards must be at "${difficulty}" level.` : '6. DIFFICULTY: Vary the difficulty level between easy, medium, and hard.'}
7. 🆕 The "topico" field MUST match one of the topics from the distribution above.

MANDATORY JSON FORMAT (NO MARKDOWN):
Return ONLY raw JSON, without code blocks (\`\`\`).
{
  "flashcards": [
    ${getFlashcardExample(language)}
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
                dificuldade: f.dificuldade || difficulty || "médio",
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
