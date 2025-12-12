import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateQuizSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction, getTrueFalseOptions, getQuizExample } from "./shared/language_helper";
import {
    aggregateTopicsFromSources,
    formatDistributionForPrompt,
    extractTopicsFromContent
} from "./shared/topic_extractor";
import { getTopicHistory, adjustDistributionByHistory } from "./shared/topic_balancer";



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
    const trueFalseOpts = getTrueFalseOptions(language);

    try {
        // 3. Validation
        const { source_ids, project_id, count: requestedCount, difficulty } = validateRequest(request.data, generateQuizSchema);
        const count = requestedCount ?? 10; // Default de 10 questões

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

        // Increased limit to ~2MB (approx 500k-600k tokens) to support full project context
        // Gemini 1.5 Pro supports up to 2M tokens, so this is safe.
        const MAX_CONTENT_LENGTH = 2000000;
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
            console.warn(`⚠️ Content truncated. Total: ${combinedContent.length}, Limit: ${MAX_CONTENT_LENGTH}`);
            combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
        }

        if (!combinedContent.trim()) {
            throw new HttpsError("failed-precondition", "No content available for generation");
        }

        // 🆕 5. Agregar e Calcular Distribuição de Tópicos com Balanceamento Adaptativo
        let allTopics = aggregateTopicsFromSources(usedSources);

        // Fallback: Se nenhum source tem tópicos, extrai sob demanda
        if (allTopics.length === 0) {
            console.warn('⚠️ No topics found in sources. Extracting on-demand...');
            const selector = getModelSelector();
            const topicModel = await selector.selectBestModel('general');
            allTopics = await extractTopicsFromContent(combinedContent, topicModel);
            console.log(`✅ Extracted ${allTopics.length} topics on-demand`);
        }

        // 🆕 Buscar histórico de tópicos dos últimos 3 quizzes
        const topicHistory = await getTopicHistory(db, project_id || sources[0].project_id, 3);

        // Ajustar distribuição considerando o histórico (prioriza tópicos menos explorados)
        const topicNames = allTopics.map(t => t.name);
        const distribution = adjustDistributionByHistory(topicNames, topicHistory, count);
        const distributionPrompt = formatDistributionForPrompt(distribution);
        console.log(`📊 Adaptive topic distribution: ${distribution.map(d => `${d.topic}:${d.quota}`).join(', ')}`);

        // 6. Generate Quiz
        // Simplified batching for now (single batch)
        // In a real scenario, we might want to implement the batching logic from the Supabase function
        const prompt = `
${getLanguageInstruction(language)}

You are a university-level MEDICINE professor creating an exam.
Generate EXACTLY ${count} questions based on the CONTENT below.

BASE CONTENT:
${combinedContent}

${distributionPrompt}

QUESTION TYPES (Vary):
1. "multipla_escolha": Direct concepts.
2. "verdadeiro_falso": Judge the statement (Options: ${trueFalseOpts.display}).
3. "citar": "Which of these is an example of..." (4 options).
4. "caso_clinico": Short scenario + conduct.

FORMAT RULES (Strict):
- ALL questions must have ONLY ONE correct alternative.
- Options must always be arrays of strings: ["A) Text", "B) Text"...] or ${trueFalseOpts.display}.
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
5. 🆕 The "topico" field MUST match one of the topics from the distribution above.

MANDATORY JSON FORMAT:
{
  "perguntas": [
    ${getQuizExample(language)}
  ]
}
    `;

        // ✅ Usar o modelo de produção mais robusto via IntelligentModelSelector
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for quiz generation`);

        // Aumentado para 32768 para acomodar respostas longas
        const result = await callGeminiWithUsage(prompt, modelName, 32768, true);

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
