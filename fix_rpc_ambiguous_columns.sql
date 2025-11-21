-- Fix ambiguous column references in RPC functions
-- Run this in Supabase SQL Editor

-- Drop existing functions
DROP FUNCTION IF EXISTS public.get_token_usage_by_user(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_token_usage_by_project(uuid, timestamptz, timestamptz);

-- RPC Function: Get token usage grouped by user (FIXED - qualify all columns)
CREATE OR REPLACE FUNCTION public.get_token_usage_by_user(
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
  total_cost_usd NUMERIC,
  operation_counts JSONB
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH operation_agg AS (
    SELECT
      logs.user_id AS agg_user_id,
      jsonb_object_agg(logs.operation_type, logs.op_count) AS operation_counts
    FROM (
      SELECT
        tul.user_id,
        tul.operation_type,
        COUNT(*) as op_count
      FROM public.token_usage_logs tul
      WHERE tul.created_at BETWEEN get_token_usage_by_user.start_date AND get_token_usage_by_user.end_date
      GROUP BY tul.user_id, tul.operation_type
    ) logs
    GROUP BY logs.user_id
  )
  SELECT
    tul.user_id,
    au.email AS user_email,
    COALESCE(p.display_name, 'Unnamed User') AS display_name,
    SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
    SUM(tul.tokens_input) AS total_input_tokens,
    SUM(tul.tokens_output) AS total_output_tokens,
    SUM(tul.cost_usd) AS total_cost_usd,
    COALESCE(oa.operation_counts, '{}'::jsonb) AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN auth.users au ON tul.user_id = au.id
  LEFT JOIN public.profiles p ON tul.user_id = p.id
  LEFT JOIN operation_agg oa ON tul.user_id = oa.agg_user_id
  WHERE tul.created_at BETWEEN get_token_usage_by_user.start_date AND get_token_usage_by_user.end_date
  GROUP BY tul.user_id, au.email, p.display_name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_user IS 'Returns token usage statistics grouped by user (admin only)';

-- RPC Function: Get token usage grouped by project (FIXED - qualify all columns)
CREATE OR REPLACE FUNCTION public.get_token_usage_by_project(
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
  total_cost_usd NUMERIC,
  operation_counts JSONB
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH operation_agg AS (
    SELECT
      logs.project_id AS agg_project_id,
      jsonb_object_agg(logs.operation_type, logs.op_count) AS operation_counts
    FROM (
      SELECT
        tul.project_id,
        tul.operation_type,
        COUNT(*) as op_count
      FROM public.token_usage_logs tul
      WHERE tul.user_id = get_token_usage_by_project.target_user_id
        AND tul.created_at BETWEEN get_token_usage_by_project.start_date AND get_token_usage_by_project.end_date
      GROUP BY tul.project_id, tul.operation_type
    ) logs
    GROUP BY logs.project_id
  )
  SELECT
    tul.project_id,
    COALESCE(proj.name, 'No Project') AS project_name,
    SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
    SUM(tul.tokens_input) AS total_input_tokens,
    SUM(tul.tokens_output) AS total_output_tokens,
    SUM(tul.cost_usd) AS total_cost_usd,
    COALESCE(oa.operation_counts, '{}'::jsonb) AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN public.projects proj ON tul.project_id = proj.id
  LEFT JOIN operation_agg oa ON tul.project_id = oa.agg_project_id
  WHERE tul.user_id = get_token_usage_by_project.target_user_id
    AND tul.created_at BETWEEN get_token_usage_by_project.start_date AND get_token_usage_by_project.end_date
  GROUP BY tul.project_id, proj.name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_project IS 'Returns token usage statistics grouped by project for a specific user (admin only)';
