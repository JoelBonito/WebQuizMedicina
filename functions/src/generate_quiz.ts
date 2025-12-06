import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateQuizSchema, validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

export const generate_quiz = onCall({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1"
}, async (request) => {
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
2. ${getLanguageInstruction(language)}
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
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for quiz generation`);

        let result;
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
