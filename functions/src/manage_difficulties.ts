import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { z } from "zod";
import { validateRequest, sanitizeString } from "./shared/validation";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const manageDifficultiesSchema = z.object({
    action: z.enum(["add", "resolve", "list"]),
    project_id: z.string().uuid(),
    topico: z.string().optional(),
    difficulty_id: z.string().uuid().optional(),
});

export const manage_difficulties = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = context.auth.uid;

    try {
        // 2. Validation
        const { action, project_id, topico, difficulty_id } = validateRequest(data, manageDifficultiesSchema);

        const difficultiesCollection = db.collection("difficulties");

        if (action === "add") {
            if (!topico) {
                throw new functions.https.HttpsError("invalid-argument", "Topico is required for 'add' action");
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
                throw new functions.https.HttpsError("invalid-argument", "Difficulty ID is required for 'resolve' action");
            }

            const docRef = difficultiesCollection.doc(difficulty_id);
            const doc = await docRef.get();

            if (!doc.exists) {
                throw new functions.https.HttpsError("not-found", "Difficulty not found");
            }

            if (doc.data()?.user_id !== userId) {
                throw new functions.https.HttpsError("permission-denied", "Not authorized to modify this difficulty");
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
        }

        throw new functions.https.HttpsError("invalid-argument", "Invalid action");

    } catch (error: any) {
        console.error("Error in manage_difficulties:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
