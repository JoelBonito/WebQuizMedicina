-- Seed data for testing Admin Dashboard
-- Migration: 021_seed_token_usage_test_data.sql
--
-- This creates sample token usage data to test the Admin Dashboard
-- IMPORTANT: This is for development/testing only
-- Delete this data before production deployment

-- First, check if we need to insert test users
-- We'll assume these users exist or create placeholder data

-- Insert sample token usage logs for multiple users
-- Note: Replace UUIDs with actual user_id and project_id from your database

-- Sample data structure:
-- User 1 (renata@medicina.com) - Heavy user
-- User 2 (jbento1@gmail.com) - Moderate user
-- User 3 (test@example.com) - Light user

DO $$
DECLARE
  -- You'll need to replace these with actual UUIDs from your database
  user_renata UUID;
  user_joel UUID;
  user_test UUID;
  project_medicina UUID;
  project_cirurgia UUID;
BEGIN
  -- Get actual user IDs (adjust emails to match your database)
  SELECT id INTO user_renata FROM auth.users WHERE email = 'renata@medicina.com' LIMIT 1;
  SELECT id INTO user_joel FROM auth.users WHERE email = 'jbento1@gmail.com' LIMIT 1;
  SELECT id INTO user_test FROM auth.users WHERE email = 'test@example.com' LIMIT 1;

  -- If users don't exist, skip seeding (they need to be created first)
  IF user_renata IS NULL OR user_joel IS NULL THEN
    RAISE NOTICE 'Users not found. Skipping seed data.';
    RAISE NOTICE 'Please ensure users exist: renata@medicina.com, jbento1@gmail.com';
    RETURN;
  END IF;

  -- Get project IDs (use first available projects for each user)
  SELECT id INTO project_medicina FROM public.projects WHERE user_id = user_renata LIMIT 1;
  SELECT id INTO project_cirurgia FROM public.projects WHERE user_id = user_joel LIMIT 1;

  -- Clean existing test data (optional - comment out if you want to keep existing data)
  -- DELETE FROM public.token_usage_logs WHERE metadata->>'test_data' = 'true';

  -- ============================================================================
  -- User 1: renata@medicina.com - Heavy user (highest token consumption)
  -- ============================================================================

  -- Quiz generations (10 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_renata,
    project_medicina,
    'quiz',
    5000 + (random() * 2000)::int,  -- 5000-7000 input tokens
    2000 + (random() * 1000)::int,  -- 2000-3000 output tokens
    0.001 + (random() * 0.0005),     -- ~$0.001-0.0015 per operation
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'questions_generated', 10
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 10);

  -- Flashcard generations (15 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_renata,
    project_medicina,
    'flashcard',
    4000 + (random() * 1500)::int,
    1800 + (random() * 800)::int,
    0.0008 + (random() * 0.0004),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'flashcards_generated', 20
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 15);

  -- Chat operations (20 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_renata,
    project_medicina,
    'chat',
    3000 + (random() * 2000)::int,
    1500 + (random() * 1000)::int,
    0.0007 + (random() * 0.0005),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'use_cache', (random() > 0.5)
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 20);

  -- Summary generations (5 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_renata,
    project_medicina,
    'summary',
    6000 + (random() * 3000)::int,
    3000 + (random() * 1500)::int,
    0.0015 + (random() * 0.001),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'summary_id', gen_random_uuid(),
      'strategy', (ARRAY['SINGLE', 'BATCHED', 'EXECUTIVE'])[floor(random() * 3 + 1)]
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 5);

  -- ============================================================================
  -- User 2: jbento1@gmail.com - Moderate user
  -- ============================================================================

  -- Quiz generations (5 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_joel,
    project_cirurgia,
    'quiz',
    4500 + (random() * 1500)::int,
    1800 + (random() * 800)::int,
    0.0009 + (random() * 0.0004),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'questions_generated', 8
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 5);

  -- Flashcard generations (8 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_joel,
    project_cirurgia,
    'flashcard',
    3500 + (random() * 1200)::int,
    1600 + (random() * 700)::int,
    0.0007 + (random() * 0.0003),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'flashcards_generated', 15
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 8);

  -- Chat operations (10 operations)
  INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
  SELECT
    user_joel,
    project_cirurgia,
    'chat',
    2800 + (random() * 1500)::int,
    1400 + (random() * 800)::int,
    0.0006 + (random() * 0.0004),
    jsonb_build_object(
      'test_data', 'true',
      'model', 'gemini-2.5-flash',
      'session_id', gen_random_uuid(),
      'use_cache', (random() > 0.5)
    ),
    NOW() - (random() * interval '30 days')
  FROM generate_series(1, 10);

  RAISE NOTICE '✅ Seed data inserted successfully';
  RAISE NOTICE '📊 renata@medicina.com: ~50 operations (highest usage)';
  RAISE NOTICE '📊 jbento1@gmail.com: ~23 operations (moderate usage)';

END $$;

-- Verify the data was inserted
SELECT
  u.email,
  COUNT(*) as total_operations,
  SUM(tul.tokens_input + tul.tokens_output) as total_tokens,
  SUM(tul.cost_usd) as total_cost_usd,
  SUM(tul.cost_usd) * 5.5 as total_cost_brl
FROM public.token_usage_logs tul
LEFT JOIN auth.users u ON tul.user_id = u.id
WHERE tul.metadata->>'test_data' = 'true'
GROUP BY u.email
ORDER BY total_tokens DESC;
