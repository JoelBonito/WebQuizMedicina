-- Migration: Auto Embeddings Queue System
-- Description: Automatically triggers embedding generation when PDFs are processed
--              Uses status tracking and database webhooks for async processing

-- 1. Add embeddings_status column to sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sources' AND column_name = 'embeddings_status'
  ) THEN
    ALTER TABLE sources ADD COLUMN embeddings_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- 2. Add updated_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sources' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE sources ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 3. Create index for efficient queue queries
CREATE INDEX IF NOT EXISTS sources_embeddings_status_idx
ON sources(embeddings_status)
WHERE embeddings_status IN ('pending', 'processing');

-- 4. Create index for updated_at
CREATE INDEX IF NOT EXISTS sources_updated_at_idx
ON sources(updated_at DESC);

-- 5. Add comments
COMMENT ON COLUMN sources.embeddings_status IS 'Status of embeddings generation: pending, processing, completed, failed, skipped';
COMMENT ON COLUMN sources.updated_at IS 'Timestamp of last update to the source record';

-- 6. Create trigger function to auto-queue embeddings
CREATE OR REPLACE FUNCTION trigger_auto_queue_embeddings()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if extracted_content was just added or updated
  IF NEW.extracted_content IS NOT NULL
     AND NEW.extracted_content != ''
     AND (OLD IS NULL OR OLD.extracted_content IS NULL OR OLD.extracted_content = '') THEN

    -- Mark as pending for embeddings generation
    NEW.embeddings_status = 'pending';
    NEW.updated_at = NOW();

    RAISE NOTICE 'Source % queued for embeddings generation', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Drop existing trigger if exists
DROP TRIGGER IF EXISTS auto_queue_embeddings ON sources;

-- 8. Create trigger on sources table
CREATE TRIGGER auto_queue_embeddings
BEFORE INSERT OR UPDATE ON sources
FOR EACH ROW
EXECUTE FUNCTION trigger_auto_queue_embeddings();

-- 9. Create function to manually queue source for embeddings
CREATE OR REPLACE FUNCTION queue_source_for_embeddings(source_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE sources
  SET
    embeddings_status = 'pending',
    updated_at = NOW()
  WHERE id = source_uuid
    AND extracted_content IS NOT NULL
    AND extracted_content != '';

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION queue_source_for_embeddings IS 'Manually queue a source for embeddings generation';

-- 10. Create function to get pending embeddings queue
CREATE OR REPLACE FUNCTION get_pending_embeddings_queue(max_items INT DEFAULT 10)
RETURNS TABLE (
  source_id UUID,
  source_name TEXT,
  project_id UUID,
  created_at TIMESTAMPTZ,
  content_length INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.project_id,
    s.created_at,
    LENGTH(s.extracted_content) as content_length
  FROM sources s
  WHERE s.embeddings_status = 'pending'
    AND s.extracted_content IS NOT NULL
    AND s.extracted_content != ''
  ORDER BY s.created_at ASC
  LIMIT max_items;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pending_embeddings_queue IS 'Get list of sources pending embeddings generation';

-- 11. Create function to mark embeddings as processing
CREATE OR REPLACE FUNCTION mark_embeddings_processing(source_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE sources
  SET
    embeddings_status = 'processing',
    updated_at = NOW()
  WHERE id = source_uuid
    AND embeddings_status = 'pending';

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- 12. Create function to mark embeddings as completed
CREATE OR REPLACE FUNCTION mark_embeddings_completed(source_uuid UUID, chunks_created INT DEFAULT 0)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE sources
  SET
    embeddings_status = 'completed',
    updated_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'embeddings_chunks', chunks_created,
      'embeddings_completed_at', NOW()
    )
  WHERE id = source_uuid;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- 13. Create function to mark embeddings as failed
CREATE OR REPLACE FUNCTION mark_embeddings_failed(source_uuid UUID, error_message TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE sources
  SET
    embeddings_status = 'failed',
    updated_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'embeddings_error', error_message,
      'embeddings_failed_at', NOW()
    )
  WHERE id = source_uuid;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  RETURN rows_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- 14. Update existing sources to have proper status
UPDATE sources
SET embeddings_status =
  CASE
    WHEN EXISTS (
      SELECT 1 FROM source_chunks sc WHERE sc.source_id = sources.id LIMIT 1
    ) THEN 'completed'
    WHEN extracted_content IS NOT NULL AND extracted_content != '' THEN 'pending'
    ELSE 'skipped'
  END,
  updated_at = NOW()
WHERE embeddings_status IS NULL OR embeddings_status = 'pending';

-- 15. Grant permissions
GRANT EXECUTE ON FUNCTION queue_source_for_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_embeddings_queue TO authenticated;
GRANT EXECUTE ON FUNCTION mark_embeddings_processing TO authenticated;
GRANT EXECUTE ON FUNCTION mark_embeddings_completed TO authenticated;
GRANT EXECUTE ON FUNCTION mark_embeddings_failed TO authenticated;
