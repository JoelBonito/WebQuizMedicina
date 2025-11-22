/**
 * Embeddings Module for RAG System
 * 
 * Handles text chunking, embedding generation via Gemini API,
 * and semantic search using pgvector.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Chunking configuration
 * - 800 tokens per chunk keeps content focused and within limits
 * - 100 token overlap preserves context between chunks
 */
const CHUNK_SIZE_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;
const EMBEDDING_BATCH_SIZE = 10; // Process 10 chunks at a time

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  similarity: number;
  sourceId: string;
  chunkIndex: number;
  tokenCount: number;
}

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for Portuguese/English
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into overlapping chunks
 */
export function chunkText(
  text: string,
  chunkSizeTokens: number = CHUNK_SIZE_TOKENS,
  overlapTokens: number = CHUNK_OVERLAP_TOKENS
): Chunk[] {
  
  const chunkSizeChars = chunkSizeTokens * 4;
  const overlapChars = overlapTokens * 4;
  
  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;
  
  // Split by paragraphs first for better semantic boundaries
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
    
    if (testChunk.length <= chunkSizeChars) {
      currentChunk = testChunk;
    } else {
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
          } else {
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
      } else {
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
  console.log(`📊 [Chunking] Avg tokens/chunk: ${Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)}`);
  
  return chunks;
}

/**
 * Generate embedding for a single text using Gemini API
 *
 * Uses gemini-embedding-001 model which produces 768-dimensional vectors.
 *
 * @param text - Text to embed
 * @returns Embedding vector (768 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embedding API error: ${error}`);
  }
  
  const data = await response.json();
  
  if (!data.embedding || !data.embedding.values) {
    throw new Error('Invalid embedding response from Gemini API');
  }
  
  return data.embedding.values;
}

/**
 * Generate embeddings for multiple chunks (with batching)
 */
export async function generateEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
  console.log(`📊 [Embeddings] Generating embeddings for ${chunks.length} chunks...`);
  
  const chunksWithEmbeddings: ChunkWithEmbedding[] = [];
  const totalBatches = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
  
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
    
    console.log(`🔄 [Embeddings] [${batchNum}/${totalBatches}] Processing batch of ${batch.length} chunks...`);
    
    try {
      const embeddings = await Promise.all(
        batch.map(chunk => generateEmbedding(chunk.content))
      );
      
      batch.forEach((chunk, idx) => {
        chunksWithEmbeddings.push({
          ...chunk,
          embedding: embeddings[idx]
        });
      });
      
      console.log(`✅ [Embeddings] [${batchNum}/${totalBatches}] Batch complete`);
      
      // Small delay between batches to avoid rate limits
      if (i + EMBEDDING_BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`❌ [Embeddings] [${batchNum}/${totalBatches}] Batch failed:`, error);
      throw error;
    }
  }
  
  console.log(`✅ [Embeddings] All ${chunksWithEmbeddings.length} embeddings generated successfully`);
  return chunksWithEmbeddings;
}

/**
 * Perform semantic search using stored embeddings
 */
export async function semanticSearch(
  supabaseClient: any,
  query: string,
  sourceIds: string[],
  topK: number = 5,
  similarityThreshold: number = 0.5
): Promise<SemanticSearchResult[]> {
  
  console.log(`🔍 [Search] Starting semantic search...`);
  console.log(`🔍 [Search] Query: "${query.substring(0, 100)}..."`);
  console.log(`🔍 [Search] Sources: ${sourceIds.length}, Top-K: ${topK}`);
  
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  console.log(`✅ [Search] Query embedding generated (${queryEmbedding.length} dims)`);
  
  // Perform vector search using RPC function
  const { data, error } = await supabaseClient.rpc('match_source_chunks', {
    query_embedding: queryEmbedding,
    source_ids: sourceIds,
    match_count: topK,
    similarity_threshold: similarityThreshold
  });
  
  if (error) {
    console.error('❌ [Search] Semantic search failed:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    console.warn('⚠️ [Search] No relevant chunks found');
    return [];
  }
  
  const avgSimilarity = data.reduce((sum: number, item: any) => sum + item.similarity, 0) / data.length;
  
  console.log(`✅ [Search] Found ${data.length} relevant chunks`);
  console.log(`📊 [Search] Avg similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
  console.log(`📊 [Search] Top similarity: ${(data[0].similarity * 100).toFixed(1)}%`);
  
  return data.map((item: any) => ({
    id: item.id,
    content: item.content,
    similarity: item.similarity,
    sourceId: item.source_id,
    chunkIndex: item.chunk_index,
    tokenCount: item.token_count
  }));
}

/**
 * Perform semantic search with dynamic token limit (PHASE 3 OPTIMIZATION)
 *
 * Instead of fetching a fixed number of chunks, this function fetches chunks
 * until reaching the specified token limit, ensuring predictable costs.
 *
 * @param supabaseClient - Supabase client instance
 * @param query - Search query text
 * @param sourceIds - Array of source IDs to search within
 * @param maxTokens - Maximum total tokens to return (default: 15000)
 * @param similarityThreshold - Minimum similarity score (default: 0.5)
 * @returns Array of semantic search results within token limit
 */
export async function semanticSearchWithTokenLimit(
  supabaseClient: any,
  query: string,
  sourceIds: string[],
  maxTokens: number = 15000,
  similarityThreshold: number = 0.5
): Promise<SemanticSearchResult[]> {

  console.log(`🔍 [Search] Starting semantic search with token limit...`);
  console.log(`🔍 [Search] Query: "${query.substring(0, 100)}..."`);
  console.log(`🔍 [Search] Sources: ${sourceIds.length}, Max tokens: ${maxTokens}`);

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  console.log(`✅ [Search] Query embedding generated (${queryEmbedding.length} dims)`);

  // Fetch more chunks than needed (we'll filter by token limit)
  // Use a generous initial fetch to ensure we have enough candidates
  const initialFetchCount = Math.max(50, Math.ceil(maxTokens / 400)); // Assume ~400 tokens/chunk avg

  // Perform vector search using RPC function
  const { data, error } = await supabaseClient.rpc('match_source_chunks', {
    query_embedding: queryEmbedding,
    source_ids: sourceIds,
    match_count: initialFetchCount,
    similarity_threshold: similarityThreshold
  });

  if (error) {
    console.error('❌ [Search] Semantic search failed:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.warn('⚠️ [Search] No relevant chunks found');
    return [];
  }

  // Accumulate chunks until token limit is reached
  const results: SemanticSearchResult[] = [];
  let totalTokens = 0;

  for (const item of data) {
    const chunkTokens = item.token_count || estimateTokens(item.content);

    // Check if adding this chunk would exceed the limit
    if (totalTokens + chunkTokens > maxTokens) {
      console.log(`⏸️ [Search] Token limit reached: ${totalTokens}/${maxTokens} tokens`);
      break;
    }

    results.push({
      id: item.id,
      content: item.content,
      similarity: item.similarity,
      sourceId: item.source_id,
      chunkIndex: item.chunk_index,
      tokenCount: chunkTokens
    });

    totalTokens += chunkTokens;
  }

  const avgSimilarity = results.reduce((sum, item) => sum + item.similarity, 0) / results.length;

  console.log(`✅ [Search] Found ${results.length} chunks within token limit`);
  console.log(`📊 [Search] Total tokens: ${totalTokens}/${maxTokens} (${((totalTokens/maxTokens)*100).toFixed(1)}% used)`);
  console.log(`📊 [Search] Avg similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
  console.log(`📊 [Search] Top similarity: ${(results[0].similarity * 100).toFixed(1)}%`);

  return results;
}

/**
 * Check if a single source has embeddings
 */
export async function hasEmbeddings(
  supabaseClient: any,
  sourceId: string
): Promise<boolean> {

  const { data, error } = await supabaseClient
    .from('source_chunks')
    .select('id')
    .eq('source_id', sourceId)
    .limit(1);

  if (error) {
    console.error('Error checking embeddings:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Check if any sources have embeddings
 */
export async function hasAnyEmbeddings(
  supabaseClient: any,
  sourceIds: string[]
): Promise<boolean> {

  const { data, error } = await supabaseClient
    .from('source_chunks')
    .select('id')
    .in('source_id', sourceIds)
    .limit(1);

  if (error) {
    console.error('Error checking embeddings:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Delete embeddings for a source
 */
export async function deleteEmbeddings(
  supabaseClient: any,
  sourceId: string
): Promise<void> {

  const { error } = await supabaseClient
    .from('source_chunks')
    .delete()
    .eq('source_id', sourceId);

  if (error) {
    console.error('Error deleting embeddings:', error);
    throw new Error(`Failed to delete embeddings: ${error.message}`);
  }
}

/**
 * Format chunks into context string for LLM
 */
export function formatChunksForContext(chunks: SemanticSearchResult[]): string {
  return chunks
    .map((chunk, idx) => {
      const relevancePercent = (chunk.similarity * 100).toFixed(1);
      return `[Trecho ${idx + 1} - Relevância: ${relevancePercent}%]\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}
