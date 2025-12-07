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
exports.manage_difficulties = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
const manageDifficultiesSchema = zod_1.z.object({
    action: zod_1.z.enum(["add", "resolve", "list", "check_auto_resolve", "statistics", "normalize_topic"]),
    project_id: zod_1.z.string().uuid().optional(),
    topico: zod_1.z.string().optional(),
    topic: zod_1.z.string().optional(),
    difficulty_id: zod_1.z.string().uuid().optional(),
    correct: zod_1.z.boolean().optional(), // Para check_auto_resolve
});
exports.manage_difficulties = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1"
}, async (request) => {
    var _a;
    const db = admin.firestore();
    // Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = request.auth.uid;
    try {
        // 2. Validation
        const { action, project_id, topico, difficulty_id, topic, correct } = (0, validation_1.validateRequest)(request.data, manageDifficultiesSchema);
        const difficultiesCollection = db.collection("difficulties");
        if (action === "add") {
            if (!topico) {
                throw new https_1.HttpsError("invalid-argument", "Topico is required for 'add' action");
            }
            // Check if already exists
            const existingQuery = await difficultiesCollection
                .where("project_id", "==", project_id)
                .where("user_id", "==", userId)
                .where("topico", "==", (0, validation_1.sanitizeString)(topico))
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
            }
            else {
                // Create new
                const newDoc = await difficultiesCollection.add({
                    project_id,
                    user_id: userId,
                    topico: (0, validation_1.sanitizeString)(topico),
                    tipo_origem: "manual",
                    nivel: 1,
                    resolvido: false,
                    created_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { success: true, message: "Difficulty added", id: newDoc.id };
            }
        }
        else if (action === "resolve") {
            if (!difficulty_id) {
                throw new https_1.HttpsError("invalid-argument", "Difficulty ID is required for 'resolve' action");
            }
            const docRef = difficultiesCollection.doc(difficulty_id);
            const doc = await docRef.get();
            if (!doc.exists) {
                throw new https_1.HttpsError("not-found", "Difficulty not found");
            }
            if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.user_id) !== userId) {
                throw new https_1.HttpsError("permission-denied", "Not authorized to modify this difficulty");
            }
            await docRef.update({
                resolvido: true,
                resolved_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { success: true, message: "Difficulty resolved" };
        }
        else if (action === "list") {
            const snapshot = await difficultiesCollection
                .where("project_id", "==", project_id)
                .where("user_id", "==", userId)
                .where("resolvido", "==", false)
                .orderBy("nivel", "desc")
                .get();
            const difficulties = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            return { success: true, difficulties };
        }
        else if (action === "check_auto_resolve") {
            // Nova ação para verificar e auto-resolver dificuldades após 3 acertos
            // `topic` and `correct` are already validated and sanitized by `validateRequest`
            // const topic = sanitizeString(request.data.topic || ""); // No longer needed, `topic` is from validateRequest
            // const correct = request.data.correct; // No longer needed, `correct` is from validateRequest
            if (!topic) {
                throw new https_1.HttpsError("invalid-argument", "Topic is required for 'check_auto_resolve' action");
            }
            if (correct === undefined) {
                throw new https_1.HttpsError("invalid-argument", "Correct flag is required for 'check_auto_resolve' action");
            }
            if (!project_id) {
                throw new https_1.HttpsError("invalid-argument", "Project ID is required for 'check_auto_resolve' action");
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
                }
                else {
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
            }
            else {
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
        }
        else if (action === "statistics") {
            // Nova ação para obter estatísticas
            if (!project_id) {
                throw new https_1.HttpsError("invalid-argument", "Project ID is required for 'statistics' action");
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
        }
        else if (action === "normalize_topic") {
            // Nova ação para normalizar nome de tópico
            const topicNormalize = topico || topic;
            if (!topicNormalize) {
                throw new https_1.HttpsError("invalid-argument", "Topic is required for 'normalize_topic' action");
            }
            return {
                normalized: normalizeTopic(topicNormalize),
                original: topicNormalize,
            };
        }
        throw new https_1.HttpsError("invalid-argument", "Invalid action");
    }
    catch (error) {
        console.error("Error in manage_difficulties:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
// Helper function para normalizar tópicos
function normalizeTopic(topic) {
    return topic
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // Normalizar espaços múltiplos
        .replace(/[^\w\sáàâãéèêíïóôõöúçñ]/gi, ''); // Remover caracteres especiais
}
//# sourceMappingURL=manage_difficulties.js.map