import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { validateRequest } from "./shared/validation";
import { chunkText, generateEmbeddings } from "./shared/embeddings";

import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { callGeminiWithUsage } from "./shared/gemini";



const processEmbeddingsSchema = z.object({
    source_id: z.string().optional(), // Firestore IDs não são UUIDs estritos
    project_id: z.string(), // Firestore IDs
    max_items: z.number().optional(),
});

export const process_embeddings_queue = onCall({
    timeoutSeconds: 540,
    memory: '2GiB',
    region: 'us-central1'
}, async (request) => {
    const db = admin.firestore();
    const storage = admin.storage();
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const data = request.data;

    try {
        // 2. Validation
        const { source_id, project_id, max_items } = validateRequest(data, processEmbeddingsSchema);

        // 3. Determine Sources to Process
        let sourcesToProcess: any[] = [];

        if (source_id) {
            const sourceRef = db.collection("sources").doc(source_id);
            const sourceDoc = await sourceRef.get();

            if (!sourceDoc.exists) {
                throw new HttpsError("not-found", "Source not found");
            }

            const source = sourceDoc.data();
            if (source?.project_id !== project_id) {
                throw new HttpsError("permission-denied", "Source does not belong to project");
            }
            sourcesToProcess.push({ ref: sourceRef, data: source });
        } else {
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
        const selector = getModelSelector();
        let modelName = await selector.selectBestModel('embedding');
        console.log(`🤖 Using model: ${modelName} for embeddings generation`);

        for (const item of sourcesToProcess) {
            const sourceData = item.data;
            const sourceId = item.ref.id;

            if (!sourceData.extracted_content) {
                // Check if it's a supported media type (Image or Audio)
                const isImage = ['jpg', 'jpeg', 'png'].includes(sourceData.type) || sourceData.metadata?.mimeType?.startsWith('image/');
                const isAudio = ['mp3', 'wav', 'm4a'].includes(sourceData.type) || sourceData.metadata?.mimeType?.startsWith('audio/');

                if (sourceData.storage_path && (isImage || isAudio)) {
                    try {
                        console.log(`🖼️ Extracting content from file for source ${sourceId}...`);
                        const bucket = storage.bucket();
                        const file = bucket.file(sourceData.storage_path);
                        const [buffer] = await file.download();
                        const base64Data = buffer.toString('base64');
                        const mimeType = sourceData.type || 'image/jpeg';

                        const prompt = "Transcreva todo o texto visível nesta imagem (ou áudio) com alta fidelidade, **incluindo anotações manuscritas (letra de mão)**. Mantenha a formatação e estrutura original das anotações. Se houver diagramas, descreva-os brevemente.";

                        const result = await callGeminiWithUsage(
                            [
                                prompt,
                                {
                                    inlineData: {
                                        data: base64Data,
                                        mimeType: mimeType
                                    }
                                }
                            ],
                            "gemini-1.5-flash" // Modelo multimodal rápido
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

                    } catch (extractError: any) {
                        console.error(`❌ Error extracting content for source ${sourceId}:`, extractError);
                        batch.update(item.ref, {
                            status: "error",
                            error_message: "Failed to extract content: " + extractError.message,
                            processed_at: admin.firestore.FieldValue.serverTimestamp()
                        });
                        processedCount++;
                        continue;
                    }
                } else {
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
                const chunks = chunkText(sourceData.extracted_content);

                // 2. Generate Embeddings
                let chunksWithEmbeddings;
                try {
                    chunksWithEmbeddings = await generateEmbeddings(chunks, modelName);
                } catch (error: any) {
                    // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
                    if (error.status === 404 || error.message.includes('not found')) {
                        console.warn('⚠️ Primary model failed, trying fallback...');
                        const fallbackModel = 'text-embedding-004'; // Safe fallback
                        console.log(`🤖 Using fallback model: ${fallbackModel}`);
                        modelName = fallbackModel; // Update for next sources and logging
                        chunksWithEmbeddings = await generateEmbeddings(chunks, fallbackModel);
                    } else {
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
                            project_id: project_id, // Add project_id for easier cleanup/filtering
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
                await logTokenUsage(
                    request.auth.uid,
                    project_id,
                    "embedding",
                    totalTokens,
                    0, // Output tokens are negligible for embeddings
                    modelName, // Log the actual model used
                    { source_id: sourceId, chunks: chunks.length }
                );

                processedCount++;

            } catch (error: any) {
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

    } catch (error: any) {
        console.error("Error in process_embeddings_queue:", error);
        throw new HttpsError("internal", error.message);
    }
});
