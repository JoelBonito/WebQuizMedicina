"use strict";
/**
 * Embeddings Module for RAG System
 *
 * Handles text chunking, embedding generation via Gemini API,
 * and semantic search using Firestore (in-memory fallback for now).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
exports.generateEmbeddings = generateEmbeddings;
exports.semanticSearchWithTokenLimit = semanticSearchWithTokenLimit;
exports.hasAnyEmbeddings = hasAnyEmbeddings;
exports.deleteEmbeddings = deleteEmbeddings;
const gemini_1 = require("./gemini");
/**
 * Chunking configuration
 * - 800 tokens per chunk keeps content focused and within limits
 * - 100 token overlap preserves context between chunks
 */
const CHUNK_SIZE_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;
const EMBEDDING_BATCH_SIZE = 10; // Process 10 chunks at a time
/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for Portuguese/English
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Split text into overlapping chunks
 */
function chunkText(text, chunkSizeTokens = CHUNK_SIZE_TOKENS, overlapTokens = CHUNK_OVERLAP_TOKENS) {
    const chunkSizeChars = chunkSizeTokens * 4;
    // const overlapChars = overlapTokens * 4; // Unused variable
    const chunks = [];
    let chunkIndex = 0;
    // Split by paragraphs first for better semantic boundaries
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    for (const paragraph of paragraphs) {
        const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
        if (testChunk.length <= chunkSizeChars) {
            currentChunk = testChunk;
        }
        else {
            // Save current chunk if not empty
            if (currentChunk) {
                chunks.push({
                    content: currentChunk,
                    index: chunkIndex++,
                    tokenCount: estimateTokens(currentChunk)
                });
            }
            // Handle very large paragraphs
            if (paragraph.length > chunkSizeChars) {
                // Split by sentences
                const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
                let sentenceChunk = '';
                for (const sentence of sentences) {
                    const testSentenceChunk = sentenceChunk + sentence;
                    if (testSentenceChunk.length <= chunkSizeChars) {
                        sentenceChunk = testSentenceChunk;
                    }
                    else {
                        if (sentenceChunk) {
                            chunks.push({
                                content: sentenceChunk,
                                index: chunkIndex++,
                                tokenCount: estimateTokens(sentenceChunk)
                            });
                        }
                        sentenceChunk = sentence;
                    }
                }
                currentChunk = sentenceChunk;
            }
            else {
                currentChunk = paragraph;
            }
        }
    }
    // Add final chunk
    if (currentChunk) {
        chunks.push({
            content: currentChunk,
            index: chunkIndex++,
            tokenCount: estimateTokens(currentChunk)
        });
    }
    console.log(`📦 [Chunking] Split text into ${chunks.length} chunks`);
    return chunks;
}
/**
 * Generate embeddings for multiple chunks (with batching)
 */
async function generateEmbeddings(chunks, modelName) {
    console.log(`📊 [Embeddings] Generating embeddings for ${chunks.length} chunks...`);
    const chunksWithEmbeddings = [];
    const totalBatches = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
        console.log(`🔄 [Embeddings] [${batchNum}/${totalBatches}] Processing batch of ${batch.length} chunks...`);
        try {
            const embeddings = await Promise.all(batch.map(chunk => (0, gemini_1.getEmbedding)(chunk.content, modelName)));
            batch.forEach((chunk, idx) => {
                chunksWithEmbeddings.push(Object.assign(Object.assign({}, chunk), { embedding: embeddings[idx] }));
            });
            console.log(`✅ [Embeddings] [${batchNum}/${totalBatches}] Batch complete`);
            // Small delay between batches to avoid rate limits
            if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        catch (error) {
            console.error(`❌ [Embeddings] [${batchNum}/${totalBatches}] Batch failed:`, error);
            throw error;
        }
    }
    console.log(`✅ [Embeddings] All ${chunksWithEmbeddings.length} embeddings generated successfully`);
    return chunksWithEmbeddings;
}
/**
 * Calculate Cosine Similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
/**
 * Perform semantic search with dynamic token limit
 * Uses in-memory cosine similarity (fallback for Firestore without Vector Search)
 */
async function semanticSearchWithTokenLimit(db, query, sourceIds, maxTokens = 15000, similarityThreshold = 0.5, modelName) {
    console.log(`🔍 [Search] Starting semantic search with token limit...`);
    console.log(`🔍 [Search] Query: "${query.substring(0, 100)}..."`);
    console.log(`🔍 [Search] Sources: ${sourceIds.length}, Max tokens: ${maxTokens}`);
    // Generate embedding for query
    const queryEmbedding = await (0, gemini_1.getEmbedding)(query, modelName);
    console.log(`✅ [Search] Query embedding generated (${queryEmbedding.length} dims)`);
    // Fetch all chunks for the given sources
    // Note: This might be heavy if sources have many chunks. 
    // Optimization: Limit to X chunks per source or use Firestore Vector Search in future.
    const chunksRef = db.collection('source_chunks');
    let allChunks = [];
    // Firestore 'in' query supports max 10 items. We need to batch if sourceIds > 10.
    // Or just fetch all chunks where source_id is in sourceIds
    const BATCH_SIZE = 10;
    for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
        const batchIds = sourceIds.slice(i, i + BATCH_SIZE);
        const snapshot = await chunksRef.where('source_id', 'in', batchIds).get();
        snapshot.forEach(doc => {
            allChunks.push(Object.assign({ id: doc.id }, doc.data()));
        });
    }
    console.log(`📦 [Search] Fetched ${allChunks.length} chunks from Firestore`);
    if (allChunks.length === 0) {
        console.warn('⚠️ [Search] No chunks found for these sources');
        return [];
    }
    // Calculate similarity for each chunk
    const scoredChunks = allChunks.map(chunk => {
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
            id: chunk.id,
            content: chunk.content,
            similarity,
            sourceId: chunk.source_id,
            chunkIndex: chunk.chunk_index,
            tokenCount: chunk.token_count || estimateTokens(chunk.content)
        };
    });
    // Filter by threshold and sort by similarity (descending)
    const sortedChunks = scoredChunks
        .filter(chunk => chunk.similarity >= similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ [Search] Found ${sortedChunks.length} relevant chunks (threshold: ${similarityThreshold})`);
    // Accumulate chunks until token limit is reached
    const results = [];
    let totalTokens = 0;
    for (const item of sortedChunks) {
        // Check if adding this chunk would exceed the limit
        if (totalTokens + item.tokenCount > maxTokens) {
            console.log(`⏸️ [Search] Token limit reached: ${totalTokens}/${maxTokens} tokens`);
            break;
        }
        results.push(item);
        totalTokens += item.tokenCount;
    }
    if (results.length > 0) {
        const avgSimilarity = results.reduce((sum, item) => sum + item.similarity, 0) / results.length;
        console.log(`📊 [Search] Total tokens: ${totalTokens}/${maxTokens} (${((totalTokens / maxTokens) * 100).toFixed(1)}% used)`);
        console.log(`📊 [Search] Avg similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
        console.log(`📊 [Search] Top similarity: ${(results[0].similarity * 100).toFixed(1)}%`);
    }
    return results;
}
/**
 * Check if any sources have embeddings
 */
async function hasAnyEmbeddings(db, sourceIds) {
    // Check first batch of 10
    const batchIds = sourceIds.slice(0, 10);
    if (batchIds.length === 0)
        return false;
    const snapshot = await db.collection('source_chunks')
        .where('source_id', 'in', batchIds)
        .limit(1)
        .get();
    return !snapshot.empty;
}
/**
 * Delete embeddings for a source
 */
async function deleteEmbeddings(db, sourceId) {
    const batch = db.batch();
    const snapshot = await db.collection('source_chunks').where('source_id', '==', sourceId).get();
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}
//# sourceMappingURL=embeddings.js.map