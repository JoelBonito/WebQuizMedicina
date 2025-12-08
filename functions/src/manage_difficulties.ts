import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { validateRequest, sanitizeString } from "./shared/validation";



const manageDifficultiesSchema = z.object({
    action: z.enum(["add", "resolve", "list", "check_auto_resolve", "statistics", "normalize_topic"]),
    project_id: z.string().min(1).optional(),
    topico: z.string().optional(),
    topic: z.string().optional(), // Alias para topico
    difficulty_id: z.string().min(1).optional(),
    correct: z.boolean().optional(), // Para check_auto_resolve
});

export const manage_difficulties = onCall({
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = request.auth.uid;

    try {
        // 2. Validation
        const { action, project_id, topico, difficulty_id, topic, correct } = validateRequest(request.data, manageDifficultiesSchema);

        const difficultiesCollection = db.collection("difficulties");

        if (action === "add") {
            if (!topico) {
                throw new HttpsError("invalid-argument", "Topico is required for 'add' action");
            }

            // Check if already exists
            const existingQuery = await difficultiesCollection
                .where("project_id", "==", project_id)
                .where("user_id", "==", userId)
                .where("topico", "==", sanitizeString(topico))
                .where("resolvido", "==", false)
                .get();

            if (!existingQuery.empty) {
                // Increment level if exists
                const doc = existingQuery.docs[0];
                await doc.ref.update({
                    nivel: admin.firestore.FieldValue.increment(1),
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { success: true, message: "Difficulty level increased", id: doc.id };
            } else {
                // Create new
                const newDoc = await difficultiesCollection.add({
                    project_id,
                    user_id: userId,
                    topico: sanitizeString(topico),
                    tipo_origem: "manual", // or passed from request
                    nivel: 1,
                    resolvido: false,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { success: true, message: "Difficulty added", id: newDoc.id };
            }
        } else if (action === "resolve") {
            if (!difficulty_id) {
                throw new HttpsError("invalid-argument", "Difficulty ID is required for 'resolve' action");
            }

            const docRef = difficultiesCollection.doc(difficulty_id);
            const doc = await docRef.get();

            if (!doc.exists) {
                throw new HttpsError("not-found", "Difficulty not found");
            }

            if (doc.data()?.user_id !== userId) {
                throw new HttpsError("permission-denied", "Not authorized to modify this difficulty");
            }

            await docRef.update({
                resolvido: true,
                resolved_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            return { success: true, message: "Difficulty resolved" };
        } else if (action === "list") {
            const snapshot = await difficultiesCollection
                .where("project_id", "==", project_id)
                .where("user_id", "==", userId)
                .where("resolvido", "==", false)
                .orderBy("nivel", "desc")
                .get();

            const difficulties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, difficulties };
        } else if (action === "check_auto_resolve") {
            // Nova ação para verificar e auto-resolver dificuldades após 3 acertos
            // `topic` and `correct` are already validated and sanitized by `validateRequest`
            // const topic = sanitizeString(request.data.topic || ""); // No longer needed, `topic` is from validateRequest
            // const correct = request.data.correct; // No longer needed, `correct` is from validateRequest

            if (!topic) {
                throw new HttpsError("invalid-argument", "Topic is required for 'check_auto_resolve' action");
            }
            if (correct === undefined) {
                throw new HttpsError("invalid-argument", "Correct flag is required for 'check_auto_resolve' action");
            }
            if (!project_id) {
                throw new HttpsError("invalid-argument", "Project ID is required for 'check_auto_resolve' action");
            }

            // Normalizar tópico
            const normalizedTopic = normalizeTopic((topico || topic));

            // Buscar dificuldade não resolvida
            const difficultyQuery = await difficultiesCollection
                .where("user_id", "==", userId)
                .where("project_id", "==", project_id)
                .where("topico", "==", normalizedTopic)
                .where("resolvido", "==", false)
                .limit(1)
                .get();

            if (difficultyQuery.empty) {
                return { auto_resolved: false, consecutive_correct: 0 };
            }

            const difficultyDoc = difficultyQuery.docs[0];
            const difficulty = difficultyDoc.data();

            if (correct) {
                // Incrementar acertos consecutivos
                const consecutiveCorrect = (difficulty.consecutive_correct || 0) + 1;

                if (consecutiveCorrect >= 3) {
                    // ✅ Auto-resolver após 3 acertos!
                    await difficultyDoc.ref.update({
                        resolvido: true,
                        consecutive_correct: consecutiveCorrect,
                        auto_resolved_at: admin.firestore.FieldValue.serverTimestamp(),
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    return {
                        auto_resolved: true,
                        consecutive_correct: consecutiveCorrect,
                        topic: normalizedTopic,
                    };
                } else {
                    // Salvar progresso
                    await difficultyDoc.ref.update({
                        consecutive_correct: consecutiveCorrect,
                        last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    return {
                        auto_resolved: false,
                        consecutive_correct: consecutiveCorrect,
                    };
                }
            } else {
                // Resetar contagem ao errar
                await difficultyDoc.ref.update({
                    consecutive_correct: 0,
                    last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                });

                return {
                    auto_resolved: false,
                    consecutive_correct: 0,
                };
            }
        } else if (action === "statistics") {
            // Nova ação para obter estatísticas
            if (!project_id) {
                throw new HttpsError("invalid-argument", "Project ID is required for 'statistics' action");
            }

            const snapshot = await difficultiesCollection
                .where("project_id", "==", project_id)
                .where("user_id", "==", userId)
                .get();

            const total = snapshot.size;
            const resolved = snapshot.docs.filter(doc => doc.data().resolvido).length;
            const autoResolved = snapshot.docs.filter(doc => doc.data().auto_resolved_at).length;

            const streaks = snapshot.docs
                .filter(doc => !doc.data().resolvido)
                .map(doc => doc.data().consecutive_correct || 0);

            const averageStreak = streaks.length > 0
                ? streaks.reduce((sum, val) => sum + val, 0) / streaks.length
                : 0;

            return {
                total,
                resolved,
                unresolved: total - resolved,
                autoResolved,
                averageStreak: Math.round(averageStreak * 100) / 100,
            };
        } else if (action === "normalize_topic") {
            // Nova ação para normalizar nome de tópico
            const topicNormalize = topico || topic;
            if (!topicNormalize) {
                throw new HttpsError("invalid-argument", "Topic is required for 'normalize_topic' action");
            }

            return {
                normalized: normalizeTopic(topicNormalize),
                original: topicNormalize,
            };
        }

        throw new HttpsError("invalid-argument", "Invalid action");

    } catch (error: any) {
        console.error("Error in manage_difficulties:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Helper function para normalizar tópicos
function normalizeTopic(topic: string): string {
    return topic
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')  // Normalizar espaços múltiplos
        .replace(/[^\w\sáàâãéèêíïóôõöúçñ]/gi, ''); // Remover caracteres especiais
}
