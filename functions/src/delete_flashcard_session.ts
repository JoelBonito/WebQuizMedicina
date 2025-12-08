import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Cloud Function to securely delete a flashcard session and all its flashcards.
 * Uses Admin SDK to bypass security rules.
 */
export const delete_flashcard_session = onCall({
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
        // 2. Query all flashcards with this session_id
        const flashcardsQuery = await db.collection("flashcards")
            .where("session_id", "==", session_id)
            .get();

        if (flashcardsQuery.empty) {
            throw new HttpsError("not-found", "No flashcards found for this session");
        }

        // 3. Validate ownership - check first document
        const firstDoc = flashcardsQuery.docs[0].data();
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
            throw new HttpsError("permission-denied", "You don't have permission to delete these flashcards");
        }

        // 4. Delete all documents in batch (Admin SDK bypasses security rules)
        const batch = db.batch();
        flashcardsQuery.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log(`✅ Deleted ${flashcardsQuery.size} flashcards from session ${session_id}`);

        return {
            success: true,
            deleted_count: flashcardsQuery.size,
            session_id: session_id
        };

    } catch (error: any) {
        console.error("Error in delete_flashcard_session:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});
