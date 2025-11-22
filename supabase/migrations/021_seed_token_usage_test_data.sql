-- Seed data for testing Admin Dashboard
-- Migration: 021_seed_token_usage_test_data.sql
--
-- This creates sample token usage data to test the Admin Dashboard
-- IMPORTANT: This is for development/testing only
-- Delete this data before production deployment

DO $$
DECLARE
  user_record RECORD;
  user_count INTEGER := 0;
  total_inserted INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting Admin Dashboard Seed Data';
  RAISE NOTICE '========================================';

  -- Check if any users exist
  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF user_count = 0 THEN
    RAISE NOTICE '❌ No users found in auth.users';
    RAISE NOTICE 'Please create at least one user before running this seed';
    RETURN;
  END IF;

  RAISE NOTICE '✓ Found % user(s) in database', user_count;

  -- Clean existing test data first
  DELETE FROM public.token_usage_logs WHERE metadata->>'test_data' = 'true';
  RAISE NOTICE '✓ Cleaned existing test data';

  -- Process each user and create token usage data
  FOR user_record IN
    SELECT
      u.id as user_id,
      u.email,
      p.id as project_id,
      ROW_NUMBER() OVER (ORDER BY u.created_at) as user_rank
    FROM auth.users u
    LEFT JOIN public.projects p ON p.user_id = u.id
    WHERE u.email IS NOT NULL
    LIMIT 3  -- Process up to 3 users
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE '-------------------------------------------';
    RAISE NOTICE 'Processing user: %', user_record.email;

    -- Skip if user has no projects
    IF user_record.project_id IS NULL THEN
      RAISE NOTICE '⚠️  No projects found for this user - skipping';
      CONTINUE;
    END IF;

    -- Determine usage level based on user rank
    -- First user = heavy, second = moderate, third = light
    DECLARE
      quiz_count INTEGER;
      flashcard_count INTEGER;
      chat_count INTEGER;
      summary_count INTEGER;
    BEGIN
      CASE user_record.user_rank
        WHEN 1 THEN
          -- Heavy user
          quiz_count := 15;
          flashcard_count := 20;
          chat_count := 25;
          summary_count := 8;
          RAISE NOTICE '📊 Profile: HEAVY user';
        WHEN 2 THEN
          -- Moderate user
          quiz_count := 8;
          flashcard_count := 12;
          chat_count := 15;
          summary_count := 4;
          RAISE NOTICE '📊 Profile: MODERATE user';
        ELSE
          -- Light user
          quiz_count := 3;
          flashcard_count := 5;
          chat_count := 7;
          summary_count := 2;
          RAISE NOTICE '📊 Profile: LIGHT user';
      END CASE;

      -- Quiz generations
      INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
      SELECT
        user_record.user_id,
        user_record.project_id,
        'quiz',
        4500 + (random() * 2500)::int,  -- 4500-7000 input tokens
        1800 + (random() * 1200)::int,  -- 1800-3000 output tokens
        0.0009 + (random() * 0.0006),   -- ~$0.0009-0.0015 per operation
        jsonb_build_object(
          'test_data', 'true',
          'model', 'gemini-2.5-flash',
          'session_id', gen_random_uuid(),
          'questions_generated', (5 + (random() * 10)::int)
        ),
        NOW() - (random() * interval '30 days')
      FROM generate_series(1, quiz_count);

      total_inserted := total_inserted + quiz_count;
      RAISE NOTICE '  ✓ Inserted % quiz operations', quiz_count;

      -- Flashcard generations
      INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
      SELECT
        user_record.user_id,
        user_record.project_id,
        'flashcard',
        3800 + (random() * 1700)::int,
        1600 + (random() * 900)::int,
        0.0007 + (random() * 0.0005),
        jsonb_build_object(
          'test_data', 'true',
          'model', 'gemini-2.5-flash',
          'session_id', gen_random_uuid(),
          'flashcards_generated', (10 + (random() * 15)::int)
        ),
        NOW() - (random() * interval '30 days')
      FROM generate_series(1, flashcard_count);

      total_inserted := total_inserted + flashcard_count;
      RAISE NOTICE '  ✓ Inserted % flashcard operations', flashcard_count;

      -- Chat operations
      INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
      SELECT
        user_record.user_id,
        user_record.project_id,
        'chat',
        2800 + (random() * 2200)::int,
        1300 + (random() * 1200)::int,
        0.0006 + (random() * 0.0006),
        jsonb_build_object(
          'test_data', 'true',
          'model', 'gemini-2.5-flash',
          'session_id', gen_random_uuid(),
          'use_cache', (random() > 0.4),
          'cached_tokens', CASE WHEN random() > 0.4 THEN (1500 + (random() * 1000)::int) ELSE 0 END
        ),
        NOW() - (random() * interval '30 days')
      FROM generate_series(1, chat_count);

      total_inserted := total_inserted + chat_count;
      RAISE NOTICE '  ✓ Inserted % chat operations', chat_count;

      -- Summary generations
      INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
      SELECT
        user_record.user_id,
        user_record.project_id,
        'summary',
        5500 + (random() * 3500)::int,
        2800 + (random() * 1700)::int,
        0.0013 + (random() * 0.0012),
        jsonb_build_object(
          'test_data', 'true',
          'model', CASE WHEN random() > 0.7 THEN 'gemini-2.5-pro' ELSE 'gemini-2.5-flash' END,
          'summary_id', gen_random_uuid(),
          'strategy', (ARRAY['SINGLE', 'BATCHED', 'EXECUTIVE'])[floor(random() * 3 + 1)],
          'summary_type', CASE WHEN random() > 0.6 THEN 'focused' ELSE 'normal' END
        ),
        NOW() - (random() * interval '30 days')
      FROM generate_series(1, summary_count);

      total_inserted := total_inserted + summary_count;
      RAISE NOTICE '  ✓ Inserted % summary operations', summary_count;

      -- Embeddings (occasional heavy operation)
      IF user_record.user_rank <= 2 THEN
        INSERT INTO public.token_usage_logs (user_id, project_id, operation_type, tokens_input, tokens_output, cost_usd, metadata, created_at)
        VALUES (
          user_record.user_id,
          user_record.project_id,
          'embedding',
          45000 + (random() * 35000)::int,  -- 45k-80k tokens for embeddings
          0,  -- Embeddings have no output tokens
          0.0006 + (random() * 0.0008),  -- Embeddings are cheaper per token
          jsonb_build_object(
            'test_data', 'true',
            'model', 'text-embedding-004',
            'source_id', gen_random_uuid(),
            'chunks_created', (50 + (random() * 100)::int)
          ),
          NOW() - (random() * interval '30 days')
        );

        total_inserted := total_inserted + 1;
        RAISE NOTICE '  ✓ Inserted 1 embedding operation';
      END IF;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Seed data completed successfully';
  RAISE NOTICE '📊 Total operations inserted: %', total_inserted;
  RAISE NOTICE '========================================';

  -- Show summary of inserted data
  RAISE NOTICE '';
  RAISE NOTICE 'Summary by user:';
  FOR user_record IN
    SELECT
      u.email,
      COUNT(*) as total_operations,
      SUM(tul.tokens_input + tul.tokens_output) as total_tokens,
      ROUND((SUM(tul.cost_usd) * 5.5)::numeric, 4) as total_cost_brl
    FROM public.token_usage_logs tul
    LEFT JOIN auth.users u ON tul.user_id = u.id
    WHERE tul.metadata->>'test_data' = 'true'
    GROUP BY u.email
    ORDER BY total_tokens DESC
  LOOP
    RAISE NOTICE '  % - % ops, % tokens, R$ %',
      user_record.email,
      user_record.total_operations,
      user_record.total_tokens,
      user_record.total_cost_brl;
  END LOOP;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '';
    RAISE NOTICE '❌ ERROR: %', SQLERRM;
    RAISE NOTICE 'Rolling back seed data...';
    RAISE;
END $$;
