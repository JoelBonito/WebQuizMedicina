-- Migration: Enable Realtime for content tables (Idempotent version)
-- Description: Safely adds tables to supabase_realtime publication
--              Uses PL/pgSQL to check if table is already in publication
--              This migration can be run multiple times without errors

DO $$
BEGIN
  -- Add questions table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE questions;
    RAISE NOTICE 'Added questions to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'questions already in supabase_realtime publication';
  END IF;

  -- Add flashcards table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'flashcards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE flashcards;
    RAISE NOTICE 'Added flashcards to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'flashcards already in supabase_realtime publication';
  END IF;

  -- Add summaries table if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'summaries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE summaries;
    RAISE NOTICE 'Added summaries to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'summaries already in supabase_realtime publication';
  END IF;

  -- Add mindmaps table if not already in publication (if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'mindmaps'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND tablename = 'mindmaps'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE mindmaps;
      RAISE NOTICE 'Added mindmaps to supabase_realtime publication';
    ELSE
      RAISE NOTICE 'mindmaps already in supabase_realtime publication';
    END IF;
  ELSE
    RAISE NOTICE 'mindmaps table does not exist, skipping';
  END IF;
END $$;

-- Verify publication (this will show in logs)
SELECT tablename, schemaname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
