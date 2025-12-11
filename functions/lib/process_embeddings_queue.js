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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
const embeddings_1 = require("./shared/embeddings");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const fileExtractors_1 = require("./shared/fileExtractors");
const geminiFileManager_1 = require("./shared/geminiFileManager");
const topic_extractor_1 = require("./shared/topic_extractor");
const processEmbeddingsSchema = zod_1.z.object({
    source_id: zod_1.z.string().optional(),
    project_id: zod_1.z.string(),
    max_items: zod_1.z.number().optional(),
});
exports.process_embeddings_queue = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: '2GiB',
    region: 'us-central1'
}, async (request) => {
    var _a, _b, _c, _d, _e;
    const db = admin.firestore();
    const storage = admin.storage();
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const data = request.data;
    try {
        // 2. Validation
        const { source_id, project_id, max_items } = (0, validation_1.validateRequest)(data, processEmbeddingsSchema);
        // 3. Determine Sources to Process
        let sourcesToProcess = [];
        if (source_id) {
            const sourceRef = db.collection("sources").doc(source_id);
            const sourceDoc = await sourceRef.get();
            if (!sourceDoc.exists) {
                throw new https_1.HttpsError("not-found", "Source not found");
            }
            const source = sourceDoc.data();
            if ((source === null || source === void 0 ? void 0 : source.project_id) !== project_id) {
                throw new https_1.HttpsError("permission-denied", "Source does not belong to project");
            }
            // Garantir que metadata existe
            if (!(source === null || source === void 0 ? void 0 : source.metadata)) {
                source.metadata = {};
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
                const data = doc.data();
                if (!data.metadata)
                    data.metadata = {};
                sourcesToProcess.push({ ref: doc.ref, data: data });
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
                // Check file type for routing
                const mimeType = ((_a = sourceData.metadata) === null || _a === void 0 ? void 0 : _a.mimeType) || '';
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
                            const extension = (_c = (_b = sourceData.name) === null || _b === void 0 ? void 0 : _b.split('.').pop()) === null || _c === void 0 ? void 0 : _c.toLowerCase(); // do nome original
                            // ou do storage path se nome não estiver disponível
                            const safeExtension = extension || ((_e = (_d = sourceData.storage_path) === null || _d === void 0 ? void 0 : _d.split('.').pop()) === null || _e === void 0 ? void 0 : _e.toLowerCase());
                            console.log(`📄 [Pista Expressa] Extraindo com código (mime: ${mimeType}, ext: ${safeExtension})...`);
                            // Tenta extração via código (Code-First)
                            // Aceita retornar null se tipo não suportado, mas isOffice já filtra
                            let extractedText = await (0, fileExtractors_1.extractByMimeType)(buffer, mimeType, safeExtension);
                            // Lógica de Fallback para PDF Escaneado
                            const isPdf = mimeType === 'application/pdf' || safeExtension === 'pdf';
                            const isScannedPdf = isPdf && (!extractedText || extractedText.length < 50);
                            if (isScannedPdf) {
                                console.warn(`⚠️ [Fallback] PDF parece ser escaneado (<50 chars). Ativando Gemini Vision...`);
                                // Tenta via Gemini Vision (OCR)
                                try {
                                    extractedText = await (0, geminiFileManager_1.extractTextFromImageWithGemini)(buffer, 'application/pdf');
                                }
                                catch (ocrError) {
                                    console.error('❌ [Fallback] Erro no OCR Gemini:', ocrError.message);
                                    // Se falhar o OCR, mantém o texto original (mesmo que curto) ou lança erro?
                                    // Melhor manter o erro original se texto for realmente vazio/inutil
                                    if (!extractedText)
                                        throw ocrError;
                                }
                            }
                            if (extractedText && extractedText.length > 0) {
                                sourceData.extracted_content = extractedText;
                                await item.ref.update({
                                    extracted_content: extractedText,
                                    status: 'processing'
                                });
                                console.log(`✅ [Extração Concluída] Total: ${extractedText.length} chars`);
                            }
                            else {
                                throw new Error('Extração retornou texto vazio (mesmo após fallback)');
                            }
                        }
                        // PISTA INTELIGENTE: Imagens (Gemini Vision)
                        else if (isImage) {
                            console.log(`🧠 [Pista Inteligente] Processando imagem com Gemini Vision...`);
                            const extractedText = await (0, geminiFileManager_1.extractTextFromImageWithGemini)(buffer, mimeType);
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
                            const transcription = await (0, geminiFileManager_1.transcribeAudioWithGemini)(buffer, mimeType, sourceData.name || 'audio_upload');
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
                // 🆕 FASE 1: Extração de Tópicos (antes do chunking)
                let extractedTopics = [];
                try {
                    console.log(`📋 Extracting topics from source ${sourceId}...`);
                    // Usar modelo Flash para extração de tópicos (mais barato)
                    const topicModel = await selector.selectBestModel('general');
                    extractedTopics = await (0, topic_extractor_1.extractTopicsFromContent)(sourceData.extracted_content, topicModel);
                    console.log(`✅ Found ${extractedTopics.length} topics: ${extractedTopics.map(t => t.name).join(', ')}`);
                }
                catch (topicError) {
                    console.warn(`⚠️ Topic extraction failed for source ${sourceId}:`, topicError.message);
                    // Não bloqueia o processamento - continua sem tópicos
                    extractedTopics = [];
                }
                // 2. Chunk Text
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
                // Firestore batch limit is 500 operations, but transaction size limit is 10MB.
                // Each chunk has ~768 float values (embedding) + text content.
                // With 50 chunks, we need smaller batches to stay under 10MB limit.
                const CHUNK_BATCH_SIZE = 10; // Reduzido de 400 para 10 para evitar "Transaction too big"
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
                // 4. Update Source Status (incluindo tópicos)
                batch.update(item.ref, {
                    status: "ready",
                    processed_at: admin.firestore.FieldValue.serverTimestamp(),
                    embeddings_status: "completed",
                    chunks_count: chunks.length,
                    // 🆕 Campos de Tópicos
                    topics: extractedTopics,
                    topics_status: extractedTopics.length > 0 ? "completed" : "empty",
                    topics_extracted_at: admin.firestore.FieldValue.serverTimestamp()
                });
                // 5. Log Token Usage
                const totalTokens = chunksWithEmbeddings.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
                await (0, token_usage_1.logTokenUsage)(request.auth.uid, project_id, "embedding", totalTokens, 0, // Output tokens are negligible for embeddings
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
        throw new https_1.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=process_embeddings_queue.js.map