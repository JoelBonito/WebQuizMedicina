-- Create project_caches table for storing Gemini context cache mappings
-- This enables cache reuse across different operations (quiz, flashcard, summary)
-- within the same project, reducing costs by up to 95%

CREATE TABLE IF NOT EXISTS project_caches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cache_type TEXT NOT NULL, -- 'sources', 'embeddings', etc.
  cache_name TEXT NOT NULL, -- Gemini cache ID (e.g., 'cachedContents/xyz')
  content_hash TEXT, -- Hash of cached content for invalidation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- When cache expires (TTL)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Ensure one active cache per project+type
  CONSTRAINT unique_project_cache UNIQUE (project_id, cache_type)
);

-- Index for fast lookup by project
CREATE INDEX idx_project_caches_project_id ON project_caches(project_id);

-- Index for cleanup of expired caches
CREATE INDEX idx_project_caches_expires_at ON project_caches(expires_at);

-- RLS Policies
ALTER TABLE project_caches ENABLE ROW LEVEL SECURITY;

-- Users can only see caches for their own projects
CREATE POLICY "Users can view their project caches"
  ON project_caches
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all caches (for edge functions)
CREATE POLICY "Service role can manage all caches"
  ON project_caches
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to clean up expired caches
CREATE OR REPLACE FUNCTION cleanup_expired_project_caches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM project_caches
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE project_caches IS 'Stores Gemini API context cache mappings for cost optimization';
COMMENT ON COLUMN project_caches.cache_type IS 'Type of cached content: sources, embeddings, etc.';
COMMENT ON COLUMN project_caches.cache_name IS 'Gemini cachedContents ID for API calls';
COMMENT ON COLUMN project_caches.content_hash IS 'SHA-256 hash of cached content for invalidation';
COMMENT ON COLUMN project_caches.expires_at IS 'Cache expiration timestamp (Gemini TTL)';
