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
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const manageDifficultiesSchema = zod_1.z.object({
    action: zod_1.z.enum(["add", "resolve", "list"]),
    project_id: zod_1.z.string().uuid(),
    topico: zod_1.z.string().optional(),
    difficulty_id: zod_1.z.string().uuid().optional(),
});
exports.manage_difficulties = functions.https.onCall(async (data, context) => {
    var _a;
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const userId = context.auth.uid;
    try {
        // 2. Validation
        const { action, project_id, topico, difficulty_id } = (0, validation_1.validateRequest)(data, manageDifficultiesSchema);
        const difficultiesCollection = db.collection("difficulties");
        if (action === "add") {
            if (!topico) {
                throw new functions.https.HttpsError("invalid-argument", "Topico is required for 'add' action");
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
                throw new functions.https.HttpsError("invalid-argument", "Difficulty ID is required for 'resolve' action");
            }
            const docRef = difficultiesCollection.doc(difficulty_id);
            const doc = await docRef.get();
            if (!doc.exists) {
                throw new functions.https.HttpsError("not-found", "Difficulty not found");
            }
            if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.user_id) !== userId) {
                throw new functions.https.HttpsError("permission-denied", "Not authorized to modify this difficulty");
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
        throw new functions.https.HttpsError("invalid-argument", "Invalid action");
    }
    catch (error) {
        console.error("Error in manage_difficulties:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=manage_difficulties.js.map