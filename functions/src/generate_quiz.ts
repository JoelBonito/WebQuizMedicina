import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateQuizSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";



export const generate_quiz = onCall({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    // 2. Get user's language preference
    const language = await getLanguageFromRequest(request.data, db, request.auth.uid);

    try {
        // 3. Validation
        const { source_ids, project_id, count, difficulty } = validateRequest(request.data, generateQuizSchema);

        // 3. Fetch Content (Sources)
        let sources: any[] = [];
        if (source_ids && source_ids.length > 0) {
            const sourcesSnapshot = await db.collection("sources")
                .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
                .get();

            sources = sourcesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

        // 5. Generate Quiz
        // Simplified batching for now (single batch)
        // In a real scenario, we might want to implement the batching logic from the Supabase function
        const prompt = `
${getLanguageInstruction(language)}

You are a university-level MEDICINE professor creating an exam.
Generate ${count} questions based on the CONTENT below.

BASE CONTENT:
${combinedContent.substring(0, 30000)}

CRITICAL DIVERSITY RULE:
- DISTRIBUTE questions across DIFFERENT TOPICS identified in the content
- AVOID concentrating more than 30% of questions on a single topic

QUESTION TYPES (Vary):
1. "multipla_escolha": Direct concepts.
2. "verdadeiro_falso": Judge the statement (Options: ["True", "False"] or localized equivalents).
3. "citar": "Which of these is an example of..." (4 options).
4. "caso_clinico": Short scenario + conduct.

FORMAT RULES (Strict):
- ALL questions must have ONLY ONE correct alternative.
- Options must always be arrays of strings: ["A) Text", "B) Text"...] or ["True", "False"].
- ${getLanguageInstruction(language)}

JUSTIFICATION RULES (Mandatory):
I want a SHORT justification that validates the correct answer using the provided text.
1. CITE THE SOURCE: Start sentences with equivalents of "According to the text...", "The material indicates that...".
2. ${getLanguageInstruction(language)}
3. CONCISENESS: Maximum of 2 to 3 sentences.

${(difficulty && difficulty !== 'misto') ? `DIFFICULTY: ALL questions must be at "${difficulty}" level.` : 'DIFFICULTY: Vary the difficulty level of questions between easy, medium, and hard.'}

🚨 IMPORTANT JSON RULES (DO NOT IGNORE):
1. OUTPUT MUST BE PURE VALID JSON. NO MARKDOWN (no \`\`\`json tags).
2. DO NOT ADD ANY CONVERSATIONAL TEXT (e.g. "Here is the json...").
3. ⚠️ DO NOT TRANSLATE THE JSON KEYS. USE EXACTLY THESE KEYS: "perguntas", "tipo", "pergunta", "opcoes", "resposta_correta", "justificativa", "dica", "dificuldade", "topico".
4. The values (content) MUST be in the requested language per **${getLanguageInstruction(language)}**, but the KEYS match the schema below.

MANDATORY JSON FORMAT:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "What is the first-line treatment for...",
      "opcoes": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      "resposta_correta": "A",
      "justificativa": "According to the text...",
      "dica": "Think about the drug that...",
      "dificuldade": "médio",
      "topico": "Cardiology"
    }
  ]
}
    `;

        // ✅ Seleção automática e inteligente
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for quiz generation`);

        let result;
        try {
            // ✅ Aumentado para 32768 para acomodar "thinking tokens" do Gemini 2.5
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

        const parsed = parseJsonFromResponse(result.text);

        if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
            throw new HttpsError("internal", "Failed to generate valid questions format");
        }

        // 6. Save Questions to Firestore
        const validTypes = ["multipla_escolha", "verdadeiro_falso", "citar", "caso_clinico", "completar"];
        const batch = db.batch();
        const questionsCollection = db.collection("questions");
        const sessionId = admin.firestore().collection("_").doc().id; // Generate a random ID

        const insertedQuestions: any[] = [];

        for (const q of parsed.perguntas) {
            const tipo = validTypes.includes(q.tipo) ? q.tipo : "multipla_escolha";
            const questionRef = questionsCollection.doc();

            const newQuestion = {
                project_id: project_id || sources[0].project_id,
                user_id: request.auth.uid,
                source_id: (source_ids && source_ids.length === 1) ? source_ids[0] : null,
                session_id: sessionId,
                tipo: tipo,
                pergunta: sanitizeString(q.pergunta || ""),
                opcoes: Array.isArray(q.opcoes) ? q.opcoes.map((opt: string) => sanitizeString(opt)) : [],
                resposta_correta: sanitizeString(q.resposta_correta || ""),
                justificativa: sanitizeString(q.justificativa || ""),
                dica: q.dica ? sanitizeString(q.dica) : null,
                topico: q.topico ? sanitizeString(q.topico) : "Geral",
                dificuldade: q.dificuldade || "médio",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            };

            batch.set(questionRef, newQuestion);
            insertedQuestions.push({ id: questionRef.id, ...newQuestion });
        }

        await batch.commit();

        // 7. Log Token Usage
        await logTokenUsage(
            request.auth.uid,
            project_id || sources[0].project_id,
            "quiz",
            result.usage.inputTokens,
            result.usage.outputTokens,
            modelName, // Log the actual model used
            { count, difficulty, source_count: sources.length }
        );

        return {
            success: true,
            count: insertedQuestions.length,
            session_id: sessionId,
            questions: insertedQuestions,
        };

    } catch (error: any) {
        console.error("Error in generate_quiz:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});
