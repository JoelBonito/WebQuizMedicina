import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { validateRequest } from "./shared/validation";
import { chunkText, generateEmbeddings } from "./shared/embeddings";

import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { extractByMimeType } from "./shared/fileExtractors";
import { transcribeAudioWithGemini, extractTextFromImageWithGemini } from "./shared/geminiFileManager";



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

            // Garantir que metadata existe
            if (!source?.metadata) {
                source!.metadata = {};
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
                const data = doc.data();
                if (!data.metadata) data.metadata = {};
                sourcesToProcess.push({ ref: doc.ref, data: data });
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
                // Check file type for routing
                const mimeType = sourceData.metadata?.mimeType || '';
                const isImage = ['jpg', 'jpeg', 'png'].includes(sourceData.type) || mimeType.startsWith('image/');
                const isAudio = ['mp3', 'wav', 'm4a'].includes(sourceData.type) || mimeType.startsWith('audio/');
                const isOffice = ['doc', 'docx', 'ppt', 'pptx'].includes(sourceData.type) ||
                    mimeType.includes('wordprocessingml') ||
                    mimeType.includes('presentationml') ||
                    mimeType === 'application/msword' ||
                    mimeType === 'application/vnd.ms-powerpoint';

                if (sourceData.storage_path) {
                    try {
                        console.log(`📂 Downloading file for source ${sourceId}...`);
                        const bucket = storage.bucket();
                        const file = bucket.file(sourceData.storage_path);
                        const [buffer] = await file.download();

                        // PISTA EXPRESSA: Arquivos Office e PDF Texto (Custo Zero)
                        if (isOffice || mimeType === 'application/pdf') {
                            // Extrair extensão segura
                            const extension = sourceData.name?.split('.').pop()?.toLowerCase(); // do nome original
                            // ou do storage path se nome não estiver disponível
                            const safeExtension = extension || sourceData.storage_path?.split('.').pop()?.toLowerCase();

                            console.log(`📄 [Pista Expressa] Extraindo com código (mime: ${mimeType}, ext: ${safeExtension})...`);

                            // Tenta extração via código (Code-First)
                            // Aceita retornar null se tipo não suportado, mas isOffice já filtra
                            let extractedText = await extractByMimeType(buffer, mimeType, safeExtension);

                            // Lógica de Fallback para PDF Escaneado
                            const isPdf = mimeType === 'application/pdf' || safeExtension === 'pdf';
                            const isScannedPdf = isPdf && (!extractedText || extractedText.length < 50);

                            if (isScannedPdf) {
                                console.warn(`⚠️ [Fallback] PDF parece ser escaneado (<50 chars). Ativando Gemini Vision...`);

                                // Tenta via Gemini Vision (OCR)
                                try {
                                    extractedText = await extractTextFromImageWithGemini(buffer, 'application/pdf');
                                } catch (ocrError: any) {
                                    console.error('❌ [Fallback] Erro no OCR Gemini:', ocrError.message);
                                    // Se falhar o OCR, mantém o texto original (mesmo que curto) ou lança erro?
                                    // Melhor manter o erro original se texto for realmente vazio/inutil
                                    if (!extractedText) throw ocrError;
                                }
                            }

                            if (extractedText && extractedText.length > 0) {
                                sourceData.extracted_content = extractedText;
                                await item.ref.update({
                                    extracted_content: extractedText,
                                    status: 'processing'
                                });
                                console.log(`✅ [Extração Concluída] Total: ${extractedText.length} chars`);
                            } else {
                                throw new Error('Extração retornou texto vazio (mesmo após fallback)');
                            }
                        }
                        // PISTA INTELIGENTE: Imagens (Gemini Vision)
                        else if (isImage) {
                            console.log(`🧠 [Pista Inteligente] Processando imagem com Gemini Vision...`);

                            const extractedText = await extractTextFromImageWithGemini(buffer, mimeType);

                            if (!extractedText || extractedText.length === 0) {
                                throw new Error("Gemini returned empty text for this image.");
                            }

                            sourceData.extracted_content = extractedText;
                            await item.ref.update({
                                extracted_content: extractedText,
                                status: 'processing'
                            });

                            console.log(`✅ [OCR] Extraído ${extractedText.length} chars`);
                        }
                        // PISTA INTELIGENTE: Áudio (Gemini Files API para arquivos grandes)
                        else if (isAudio) {
                            console.log(`🎤 [Pista Inteligente] Processando áudio com Gemini Files API...`);

                            // Use Gemini File API para áudios (suporta arquivos grandes)
                            const transcription = await transcribeAudioWithGemini(
                                buffer,
                                mimeType,
                                sourceData.name || 'audio_upload'
                            );

                            if (!transcription || transcription.length === 0) {
                                throw new Error("Gemini returned empty transcription for this audio.");
                            }

                            sourceData.extracted_content = transcription;
                            await item.ref.update({
                                extracted_content: transcription,
                                status: 'processing'
                            });

                            console.log(`✅ [Transcrição] Extraído ${transcription.length} chars`);
                        }
                        // Tipo não suportado por nenhuma pista
                        else {
                            console.warn(`⚠️ Source ${sourceId} has unsupported file type. Skipping.`);
                            batch.update(item.ref, {
                                status: "error",
                                error_message: "Unsupported file type for extraction",
                                processed_at: admin.firestore.FieldValue.serverTimestamp()
                            });
                            processedCount++;
                            continue;
                        }
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
                    console.warn(`⚠️ Source ${sourceId} has no storage_path and no extracted content. Skipping.`);
                    batch.update(item.ref, {
                        status: "error",
                        error_message: "No storage path or extracted content found",
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
