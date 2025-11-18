-- Migration: Add Embeddings Support with pgvector
-- Description: Creates source_chunks table for storing text chunks with embeddings
--              and provides semantic search capabilities via vector similarity

-- Enable pgvector extension (requires superuser, usually done via Supabase dashboard)
-- This will fail silently if already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create source_chunks table
-- Stores chunked text from sources with their embeddings for semantic search
CREATE TABLE IF NOT EXISTS source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768), -- Gemini gemini-embedding-001 dimension
  token_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite unique constraint to prevent duplicate chunks
  UNIQUE(source_id, chunk_index)
);

-- Create HNSW index for fast vector similarity search
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for most use cases
-- cosine distance operator (<=>) is used for similarity
CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx
ON source_chunks
USING hnsw (embedding vector_cosine_ops);

-- Create index for source_id lookups (used in filtering)
CREATE INDEX IF NOT EXISTS source_chunks_source_idx
ON source_chunks(source_id);

-- Create index for chunk ordering
CREATE INDEX IF NOT EXISTS source_chunks_order_idx
ON source_chunks(source_id, chunk_index);

-- Add comment to table
COMMENT ON TABLE source_chunks IS 'Stores chunked text from sources with embeddings for semantic search';
COMMENT ON COLUMN source_chunks.embedding IS '768-dimensional embedding vector from Gemini gemini-embedding-001';
COMMENT ON COLUMN source_chunks.chunk_index IS 'Sequential index of chunk within source (0-based)';
COMMENT ON COLUMN source_chunks.token_count IS 'Estimated token count for the chunk content';

-- Drop all existing versions of match_source_chunks function
DO $$
BEGIN
  -- Drop any existing versions of the function
  DROP FUNCTION IF EXISTS match_source_chunks(vector, UUID[], INT);
  DROP FUNCTION IF EXISTS match_source_chunks(vector, UUID[], INT, FLOAT);
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if function doesn't exist
    NULL;
END $$;

-- Create RPC function for semantic search
-- Returns chunks ranked by cosine similarity to query embedding
CREATE FUNCTION match_source_chunks(
  query_embedding vector(768),
  source_ids UUID[],
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  source_id UUID,
  chunk_index INT,
  token_count INT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    source_chunks.id,
    source_chunks.content,
    1 - (source_chunks.embedding <=> query_embedding) AS similarity,
    source_chunks.source_id,
    source_chunks.chunk_index,
    source_chunks.token_count
  FROM source_chunks
  WHERE source_chunks.source_id = ANY(source_ids)
    AND source_chunks.embedding IS NOT NULL
    AND (1 - (source_chunks.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY source_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION match_source_chunks IS 'Performs semantic search using cosine similarity on source chunks';

-- Grant permissions to authenticated users
-- Users can only query chunks from sources they have access to (enforced by RLS on sources table)
GRANT SELECT ON source_chunks TO authenticated;
GRANT INSERT ON source_chunks TO authenticated;
GRANT UPDATE ON source_chunks TO authenticated;
GRANT DELETE ON source_chunks TO authenticated;

-- Enable Row Level Security (RLS)
ALTER TABLE source_chunks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own source chunks" ON source_chunks;
DROP POLICY IF EXISTS "Users can insert chunks for their sources" ON source_chunks;
DROP POLICY IF EXISTS "Users can delete their own source chunks" ON source_chunks;

-- RLS Policy: Users can only access chunks from their own sources
-- (sources -> projects -> user_id)
CREATE POLICY "Users can view their own source chunks"
ON source_chunks
FOR SELECT
TO authenticated
USING (
  source_id IN (
    SELECT s.id
    FROM sources s
    INNER JOIN projects p ON s.project_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- RLS Policy: Users can insert chunks for their own sources
CREATE POLICY "Users can insert chunks for their sources"
ON source_chunks
FOR INSERT
TO authenticated
WITH CHECK (
  source_id IN (
    SELECT s.id
    FROM sources s
    INNER JOIN projects p ON s.project_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- RLS Policy: Users can delete chunks for their own sources
CREATE POLICY "Users can delete their own source chunks"
ON source_chunks
FOR DELETE
TO authenticated
USING (
  source_id IN (
    SELECT s.id
    FROM sources s
    INNER JOIN projects p ON s.project_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- Add trigger to update sources.updated_at when chunks are added
-- Drop trigger first if it exists
DROP TRIGGER IF EXISTS source_chunks_update_source_timestamp ON source_chunks;
DROP FUNCTION IF EXISTS update_source_updated_at();

CREATE FUNCTION update_source_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE sources
  SET updated_at = NOW()
  WHERE id = NEW.source_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_chunks_update_source_timestamp
AFTER INSERT ON source_chunks
FOR EACH ROW
EXECUTE FUNCTION update_source_updated_at();

-- Create index on sources for embedding status (for quick filtering)
-- This will be used to check which sources have embeddings generated
CREATE INDEX IF NOT EXISTS sources_has_embeddings_idx
ON sources((
  EXISTS(
    SELECT 1 FROM source_chunks WHERE source_chunks.source_id = sources.id LIMIT 1
  )
));
