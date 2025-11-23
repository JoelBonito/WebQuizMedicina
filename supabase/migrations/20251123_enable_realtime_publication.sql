-- Migration: Enable Realtime publication for content tables
-- Description: Add questions, flashcards, summaries, and mindmaps tables to supabase_realtime publication
-- This fixes the issue where INSERT/UPDATE events were not being emitted by the database

-- Add tables to Realtime publication
alter publication supabase_realtime add table questions;
alter publication supabase_realtime add table flashcards;
alter publication supabase_realtime add table summaries;
alter publication supabase_realtime add table mindmaps;

-- Verify that the tables are added to the publication
-- You can check with: SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
