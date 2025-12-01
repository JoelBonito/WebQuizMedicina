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
exports.process_embeddings_queue = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
const embeddings_1 = require("./shared/embeddings");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const processEmbeddingsSchema = zod_1.z.object({
    source_id: zod_1.z.string().optional(),
    project_id: zod_1.z.string(),
    max_items: zod_1.z.number().optional(),
});
exports.process_embeddings_queue = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        // 2. Validation
        const { source_id, project_id, max_items } = (0, validation_1.validateRequest)(data, processEmbeddingsSchema);
        // 3. Determine Sources to Process
        let sourcesToProcess = [];
        if (source_id) {
            const sourceRef = db.collection("sources").doc(source_id);
            const sourceDoc = await sourceRef.get();
            if (!sourceDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Source not found");
            }
            const source = sourceDoc.data();
            if ((source === null || source === void 0 ? void 0 : source.project_id) !== project_id) {
                throw new functions.https.HttpsError("permission-denied", "Source does not belong to project");
            }
            sourcesToProcess.push({ ref: sourceRef, data: source });
        }
        else {
            // Fetch pending sources for project
            const limit = max_items || 10;
            const snapshot = await db.collection("sources")
                .where("project_id", "==", project_id)
                .where("embeddings_status", "==", "pending") // Look for pending embeddings, not just pending status
                .limit(limit)
                .get();
            snapshot.forEach(doc => {
                sourcesToProcess.push({ ref: doc.ref, data: doc.data() });
            });
        }
        // 4. Process Sources
        const batch = db.batch();
        let processedCount = 0;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        let modelName = await selector.selectBestModel('embedding');
        console.log(`🤖 Using model: ${modelName} for embeddings generation`);
        for (const item of sourcesToProcess) {
            const sourceData = item.data;
            const sourceId = item.ref.id;
            if (!sourceData.extracted_content) {
                console.warn(`⚠️ Source ${sourceId} has no extracted content. Skipping.`);
                batch.update(item.ref, {
                    status: "error",
                    error_message: "No extracted content found",
                    processed_at: admin.firestore.FieldValue.serverTimestamp()
                });
                processedCount++;
                continue;
            }
            try {
                console.log(`Processing source ${sourceId}...`);
                // 1. Chunk Text
                const chunks = (0, embeddings_1.chunkText)(sourceData.extracted_content);
                // 2. Generate Embeddings
                let chunksWithEmbeddings;
                try {
                    chunksWithEmbeddings = await (0, embeddings_1.generateEmbeddings)(chunks, modelName);
                }
                catch (error) {
                    // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                    if (error.status === 404 || error.message.includes('not found')) {
                        console.warn('⚠️ Primary model failed, trying fallback...');
                        const fallbackModel = 'text-embedding-004'; // Safe fallback
                        console.log(`🤖 Using fallback model: ${fallbackModel}`);
                        modelName = fallbackModel; // Update for next sources and logging
                        chunksWithEmbeddings = await (0, embeddings_1.generateEmbeddings)(chunks, fallbackModel);
                    }
                    else {
                        throw error;
                    }
                }
                // 3. Save Chunks to Firestore
                // We can't use the same batch for all chunks if there are many.
                // Firestore batch limit is 500.
                // We'll use a separate batch for chunks or just add them individually/in small batches.
                const CHUNK_BATCH_SIZE = 400;
                for (let i = 0; i < chunksWithEmbeddings.length; i += CHUNK_BATCH_SIZE) {
                    const chunkBatch = db.batch();
                    const batchChunks = chunksWithEmbeddings.slice(i, i + CHUNK_BATCH_SIZE);
                    batchChunks.forEach(chunk => {
                        const chunkRef = db.collection('source_chunks').doc();
                        chunkBatch.set(chunkRef, {
                            source_id: sourceId,
                            project_id: project_id,
                            content: chunk.content,
                            chunk_index: chunk.index,
                            token_count: chunk.tokenCount,
                            embedding: chunk.embedding,
                            created_at: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await chunkBatch.commit();
                    console.log(`Saved ${batchChunks.length} chunks for source ${sourceId}`);
                }
                // 4. Update Source Status
                batch.update(item.ref, {
                    status: "ready",
                    processed_at: admin.firestore.FieldValue.serverTimestamp(),
                    embeddings_status: "completed",
                    chunks_count: chunks.length
                });
                // 5. Log Token Usage
                const totalTokens = chunksWithEmbeddings.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
                await (0, token_usage_1.logTokenUsage)(context.auth.uid, project_id, "embedding", totalTokens, 0, // Output tokens are negligible for embeddings
                modelName, // Log the actual model used
                { source_id: sourceId, chunks: chunks.length });
                processedCount++;
            }
            catch (error) {
                console.error(`❌ Error processing source ${sourceId}:`, error);
                batch.update(item.ref, {
                    status: "error",
                    error_message: error.message || "Failed to generate embeddings",
                    processed_at: admin.firestore.FieldValue.serverTimestamp()
                });
                processedCount++;
            }
        }
        if (processedCount > 0) {
            await batch.commit();
        }
        return { success: true, message: "Sources processed successfully", processed: processedCount };
    }
    catch (error) {
        console.error("Error in process_embeddings_queue:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=process_embeddings_queue.js.map