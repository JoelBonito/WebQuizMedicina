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
const gemini_1 = require("./shared/gemini");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const storage = admin.storage();
const processEmbeddingsSchema = zod_1.z.object({
    source_id: zod_1.z.string().optional(),
    project_id: zod_1.z.string(),
    max_items: zod_1.z.number().optional(),
});
exports.process_embeddings_queue = functions.runWith({
    timeoutSeconds: 540,
    memory: '2GB'
}).https.onCall(async (data, context) => {
    var _a, _b, _c, _d;
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
                // Check if it's a supported media type (Image or Audio)
                const isImage = ['jpg', 'jpeg', 'png'].includes(sourceData.type) || ((_b = (_a = sourceData.metadata) === null || _a === void 0 ? void 0 : _a.mimeType) === null || _b === void 0 ? void 0 : _b.startsWith('image/'));
                const isAudio = ['mp3', 'wav', 'm4a'].includes(sourceData.type) || ((_d = (_c = sourceData.metadata) === null || _c === void 0 ? void 0 : _c.mimeType) === null || _d === void 0 ? void 0 : _d.startsWith('audio/'));
                if (sourceData.storage_path && (isImage || isAudio)) {
                    try {
                        console.log(`🖼️ Extracting content from file for source ${sourceId}...`);
                        const bucket = storage.bucket();
                        const file = bucket.file(sourceData.storage_path);
                        const [buffer] = await file.download();
                        const base64Data = buffer.toString('base64');
                        const mimeType = sourceData.type || 'image/jpeg';
                        const prompt = "Transcreva todo o texto visível nesta imagem (ou áudio) com alta fidelidade, **incluindo anotações manuscritas (letra de mão)**. Mantenha a formatação e estrutura original das anotações. Se houver diagramas, descreva-os brevemente.";
                        const result = await (0, gemini_1.callGeminiWithUsage)([
                            prompt,
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType: mimeType
                                }
                            }
                        ], "gemini-1.5-flash" // Modelo multimodal rápido
                        );
                        if (!result.text) {
                            throw new Error("Gemini returned empty text for this file.");
                        }
                        sourceData.extracted_content = result.text;
                        // Salvar o conteúdo extraído imediatamente
                        await item.ref.update({
                            extracted_content: result.text,
                            status: 'processing' // Ensure status is processing while we continue
                        });
                        console.log(`✅ Content extracted for source ${sourceId} (${result.text.length} chars)`);
                    }
                    catch (extractError) {
                        console.error(`❌ Error extracting content for source ${sourceId}:`, extractError);
                        batch.update(item.ref, {
                            status: "error",
                            error_message: "Failed to extract content: " + extractError.message,
                            processed_at: admin.firestore.FieldValue.serverTimestamp()
                        });
                        processedCount++;
                        continue;
                    }
                }
                else {
                    console.warn(`⚠️ Source ${sourceId} has no extracted content and is not a supported media type. Skipping.`);
                    batch.update(item.ref, {
                        status: "error",
                        error_message: "No extracted content found",
                        processed_at: admin.firestore.FieldValue.serverTimestamp()
                    });
                    processedCount++;
                    continue;
                }
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