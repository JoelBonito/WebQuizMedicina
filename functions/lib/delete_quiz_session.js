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
exports.delete_quiz_session = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Cloud Function to securely delete a quiz session and all its questions.
 * Uses Admin SDK to bypass security rules.
 */
exports.delete_quiz_session = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { session_id } = request.data;
    if (!session_id) {
        throw new https_1.HttpsError("invalid-argument", "session_id is required");
    }
    try {
        // 2. Query all questions with this session_id
        const questionsQuery = await db.collection("questions")
            .where("session_id", "==", session_id)
            .get();
        if (questionsQuery.empty) {
            throw new https_1.HttpsError("not-found", "No questions found for this session");
        }
        // 3. Validate ownership - check first document
        const firstDoc = questionsQuery.docs[0].data();
        const userId = request.auth.uid;
        // Check if user owns the document directly (user_id) or owns the project
        let isOwner = firstDoc.user_id === userId;
        if (!isOwner && firstDoc.project_id) {
            const projectDoc = await db.collection("projects").doc(firstDoc.project_id).get();
            if (projectDoc.exists) {
                const projectData = projectDoc.data();
                isOwner = (projectData === null || projectData === void 0 ? void 0 : projectData.user_id) === userId;
            }
        }
        if (!isOwner) {
            throw new https_1.HttpsError("permission-denied", "You don't have permission to delete this quiz");
        }
        // 4. Delete all documents in batch (Admin SDK bypasses security rules)
        const batch = db.batch();
        questionsQuery.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`✅ Deleted ${questionsQuery.size} questions from session ${session_id}`);
        return {
            success: true,
            deleted_count: questionsQuery.size,
            session_id: session_id
        };
    }
    catch (error) {
        console.error("Error in delete_quiz_session:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=delete_quiz_session.js.map