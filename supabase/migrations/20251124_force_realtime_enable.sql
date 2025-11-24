-- Migration: Force Realtime publication for content tables (Explicit DROP + ADD)
-- Description: Explicitly removes and re-adds tables to supabase_realtime publication
--              to bypass any UI/dashboard limitations and force replication at SQL level
-- Context: CHANNEL_ERROR logs confirm that Realtime is blocked at database level
--          This migration uses explicit DROP IF EXISTS + ADD to force enable

BEGIN;
  -- Remove tables if they already exist in publication (to avoid duplicates/errors)
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS questions;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS flashcards;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS summaries;

  -- Explicitly add tables to Realtime publication
  ALTER PUBLICATION supabase_realtime ADD TABLE questions;
  ALTER PUBLICATION supabase_realtime ADD TABLE flashcards;
  ALTER PUBLICATION supabase_realtime ADD TABLE summaries;

  -- Optional: mindmaps table (if it exists and needs Realtime)
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS mindmaps;
  ALTER PUBLICATION supabase_realtime ADD TABLE mindmaps;
COMMIT;

-- Verification query (run manually to check):
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
