/**
 * Embeddings and Semantic Search Utilities
 *
 * Provides chunking, embedding generation, and vector search capabilities
 * using Gemini Embedding API and Supabase pgvector.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Chunking configuration
 * - 800 tokens per chunk keeps content focused and within limits
 * - 100 token overlap preserves context between chunks
 */
const CHUNK_SIZE_TOKENS = 800;
const CHUNK_OVERLAP_TOKENS = 100;

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export interface SemanticSearchResult {
  content: string;
  similarity: number;
  sourceId: string;
  chunkIndex: number;
}

/**
 * Split text into overlapping chunks
 *
 * Uses character-based splitting with overlap to preserve context.
 * Rough estimate: 1 token ≈ 4 characters for Portuguese medical text.
 *
 * @param text - Text to chunk
 * @param chunkSizeTokens - Target chunk size in tokens
 * @returns Array of chunks with metadata
 */
export function chunkText(
  text: string,
  chunkSizeTokens: number = CHUNK_SIZE_TOKENS
): Chunk[] {
  // Convert tokens to characters (rough estimate)
  const chunkSizeChars = chunkSizeTokens * 4;
  const overlapChars = CHUNK_OVERLAP_TOKENS * 4;

  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSizeChars, text.length);
    const content = text.substring(startIndex, endIndex).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        tokenCount: Math.ceil(content.length / 4)
      });
    }

    // Move forward with overlap
    startIndex += chunkSizeChars - overlapChars;

    // Avoid infinite loop at end of text
    if (startIndex >= text.length) break;
  }

  return chunks;
}

/**
 * Generate embedding for a single text using Gemini API
 *
 * Uses text-embedding-004 model which produces 768-dimensional vectors.
 *
 * @param text - Text to embed
 * @returns Embedding vector (768 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
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
 * Generate embeddings for multiple chunks (batched)
 *
 * Processes in batches of 10 to respect rate limits.
 * Each batch is processed in parallel for efficiency.
 *
 * @param chunks - Array of chunks to embed
 * @returns Array of chunks with embeddings
 */
export async function generateEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
  console.log(`📊 [Embeddings] Generating embeddings for ${chunks.length} chunks...`);

  const chunksWithEmbeddings: ChunkWithEmbedding[] = [];

  // Process in batches to avoid rate limits
  const BATCH_SIZE = 10;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(`🔄 [Embeddings] [${batchNum}/${totalBatches}] Processing batch of ${batch.length} chunks...`);

    // Generate embeddings in parallel for this batch
    const embeddings = await Promise.all(
      batch.map(chunk => generateEmbedding(chunk.content))
    );

    // Combine chunks with their embeddings
    batch.forEach((chunk, idx) => {
      chunksWithEmbeddings.push({
        ...chunk,
        embedding: embeddings[idx]
      });
    });

    console.log(`✅ [Embeddings] [${batchNum}/${totalBatches}] Batch complete`);
  }

  console.log(`✅ [Embeddings] All ${chunksWithEmbeddings.length} embeddings generated successfully`);
  return chunksWithEmbeddings;
}

/**
 * Perform semantic search using cosine similarity
 *
 * Searches for the most relevant chunks across specified sources.
 * Uses pgvector's cosine distance operator (<=>).
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param query - Search query text
 * @param sourceIds - Array of source IDs to search within
 * @param topK - Number of results to return
 * @returns Array of matching chunks with similarity scores
 */
export async function semanticSearch(
  supabaseClient: any,
  query: string,
  sourceIds: string[],
  topK: number = 5
): Promise<SemanticSearchResult[]> {

  console.log(`🔍 [Search] Generating query embedding...`);
  const queryEmbedding = await generateEmbedding(query);

  console.log(`🔍 [Search] Searching top ${topK} relevant chunks from ${sourceIds.length} source(s)...`);

  // Call RPC function for vector similarity search
  const { data, error } = await supabaseClient.rpc('match_source_chunks', {
    query_embedding: queryEmbedding,
    source_ids: sourceIds,
    match_count: topK
  });

  if (error) {
    console.error('❌ [Search] Semantic search failed:', error);
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.warn('⚠️ [Search] No matching chunks found');
    return [];
  }

  console.log(`✅ [Search] Found ${data.length} relevant chunks`);

  return data.map((row: any) => ({
    content: row.content,
    similarity: row.similarity,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index
  }));
}

/**
 * Check if a source has embeddings generated
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param sourceId - Source ID to check
 * @returns True if embeddings exist
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
    console.error('❌ [Embeddings] Error checking embeddings:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Check if any of the sources have embeddings
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param sourceIds - Array of source IDs
 * @returns True if at least one source has embeddings
 */
export async function hasAnyEmbeddings(
  supabaseClient: any,
  sourceIds: string[]
): Promise<boolean> {
  if (sourceIds.length === 0) return false;

  const { data, error } = await supabaseClient
    .from('source_chunks')
    .select('id')
    .in('source_id', sourceIds)
    .limit(1);

  if (error) {
    console.error('❌ [Embeddings] Error checking embeddings:', error);
    return false;
  }

  return data && data.length > 0;
}

/**
 * Delete embeddings for a source
 *
 * Called when a source is deleted or needs re-processing.
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param sourceId - Source ID
 */
export async function deleteEmbeddings(
  supabaseClient: any,
  sourceId: string
): Promise<void> {
  console.log(`🗑️ [Embeddings] Deleting embeddings for source ${sourceId}...`);

  const { error } = await supabaseClient
    .from('source_chunks')
    .delete()
    .eq('source_id', sourceId);

  if (error) {
    console.error('❌ [Embeddings] Error deleting embeddings:', error);
    throw error;
  }

  console.log(`✅ [Embeddings] Embeddings deleted successfully`);
}

/**
 * Get chunk count for a source
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param sourceId - Source ID
 * @returns Number of chunks
 */
export async function getChunkCount(
  supabaseClient: any,
  sourceId: string
): Promise<number> {
  const { count, error } = await supabaseClient
    .from('source_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId);

  if (error) {
    console.error('❌ [Embeddings] Error getting chunk count:', error);
    return 0;
  }

  return count || 0;
}
