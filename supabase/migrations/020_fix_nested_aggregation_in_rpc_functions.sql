-- Fix: Remove nested aggregation errors in RPC functions
-- Migration: 020_fix_nested_aggregation_in_rpc_functions.sql
--
-- Problem:
-- Functions were using jsonb_object_agg(operation_type, COUNT(*)) which causes
-- "aggregate function calls cannot be nested" error in PostgreSQL
--
-- Solution:
-- Use a CTE (Common Table Expression) to pre-calculate counts, then aggregate

-- 1. Fix get_token_usage_by_user
DROP FUNCTION IF EXISTS public.get_token_usage_by_user(timestamptz, timestamptz);

CREATE FUNCTION public.get_token_usage_by_user(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  display_name TEXT,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost_brl NUMERIC,
  operation_counts JSONB
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH token_stats AS (
    SELECT
      tul.user_id,
      au.email,
      COALESCE(p.display_name, 'Unnamed User') AS display_name,
      SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
      SUM(tul.tokens_input) AS total_input_tokens,
      SUM(tul.tokens_output) AS total_output_tokens,
      SUM(tul.cost_usd) * 5.5 AS total_cost_brl
    FROM public.token_usage_logs tul
    LEFT JOIN auth.users au ON tul.user_id = au.id
    LEFT JOIN public.profiles p ON tul.user_id = p.id
    WHERE tul.created_at BETWEEN start_date AND end_date
    GROUP BY tul.user_id, au.email, p.display_name
  ),
  operation_stats AS (
    SELECT
      tul.user_id,
      tul.operation_type,
      COUNT(*) as op_count
    FROM public.token_usage_logs tul
    WHERE tul.created_at BETWEEN start_date AND end_date
    GROUP BY tul.user_id, tul.operation_type
  ),
  operation_aggregated AS (
    SELECT
      user_id,
      jsonb_object_agg(operation_type, op_count) as operation_counts
    FROM operation_stats
    GROUP BY user_id
  )
  SELECT
    ts.user_id::uuid,
    ts.email::text,
    ts.display_name::text,
    ts.total_tokens::bigint,
    ts.total_input_tokens::bigint,
    ts.total_output_tokens::bigint,
    ts.total_cost_brl::numeric,
    COALESCE(oa.operation_counts, '{}'::jsonb) as operation_counts
  FROM token_stats ts
  LEFT JOIN operation_aggregated oa ON ts.user_id = oa.user_id
  ORDER BY ts.total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_user IS 'Returns token usage statistics grouped by user (admin only) - Fixed nested aggregation';

-- 2. Fix get_token_usage_by_project
DROP FUNCTION IF EXISTS public.get_token_usage_by_project(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_token_usage_by_project(
  target_user_id UUID,
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost_brl NUMERIC,
  operation_counts JSONB
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH token_stats AS (
    SELECT
      tul.project_id,
      COALESCE(proj.name, 'No Project') AS project_name,
      SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
      SUM(tul.tokens_input) AS total_input_tokens,
      SUM(tul.tokens_output) AS total_output_tokens,
      SUM(tul.cost_usd) * 5.5 AS total_cost_brl
    FROM public.token_usage_logs tul
    LEFT JOIN public.projects proj ON tul.project_id = proj.id
    WHERE tul.user_id = target_user_id
      AND tul.created_at BETWEEN start_date AND end_date
    GROUP BY tul.project_id, proj.name
  ),
  operation_stats AS (
    SELECT
      tul.project_id,
      tul.operation_type,
      COUNT(*) as op_count
    FROM public.token_usage_logs tul
    WHERE tul.user_id = target_user_id
      AND tul.created_at BETWEEN start_date AND end_date
    GROUP BY tul.project_id, tul.operation_type
  ),
  operation_aggregated AS (
    SELECT
      project_id,
      jsonb_object_agg(operation_type, op_count) as operation_counts
    FROM operation_stats
    GROUP BY project_id
  )
  SELECT
    ts.project_id::uuid,
    ts.project_name::text,
    ts.total_tokens::bigint,
    ts.total_input_tokens::bigint,
    ts.total_output_tokens::bigint,
    ts.total_cost_brl::numeric,
    COALESCE(oa.operation_counts, '{}'::jsonb) as operation_counts
  FROM token_stats ts
  LEFT JOIN operation_aggregated oa ON ts.project_id = oa.project_id
  ORDER BY ts.total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_project IS 'Returns token usage statistics grouped by project for a specific user (admin only) - Fixed nested aggregation';
