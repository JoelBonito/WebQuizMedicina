import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Cloud Function to securely delete a quiz session and all its questions.
 * Uses Admin SDK to bypass security rules.
 */
export const delete_quiz_session = onCall({
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();

    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { session_id } = request.data;

    if (!session_id) {
        throw new HttpsError("invalid-argument", "session_id is required");
    }

    try {
        // 2. Query all questions with this session_id
        const questionsQuery = await db.collection("questions")
            .where("session_id", "==", session_id)
            .get();

        if (questionsQuery.empty) {
            throw new HttpsError("not-found", "No questions found for this session");
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
                isOwner = projectData?.user_id === userId;
            }
        }

        if (!isOwner) {
            throw new HttpsError("permission-denied", "You don't have permission to delete this quiz");
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

    } catch (error: any) {
        console.error("Error in delete_quiz_session:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});
