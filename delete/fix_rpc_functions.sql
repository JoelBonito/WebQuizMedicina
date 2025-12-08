-- Fix RPC functions - remove nested aggregate functions
-- Run this in Supabase SQL Editor

-- Drop existing functions
DROP FUNCTION IF EXISTS public.get_token_usage_by_user(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_token_usage_by_project(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_daily_usage(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_token_usage_summary(timestamptz, timestamptz);

-- RPC Function: Get token usage grouped by user (FIXED)
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
      tul.user_id,
      jsonb_object_agg(tul.operation_type, op_count) AS operation_counts
    FROM (
      SELECT
        user_id,
        operation_type,
        COUNT(*) as op_count
      FROM public.token_usage_logs
      WHERE created_at BETWEEN start_date AND end_date
      GROUP BY user_id, operation_type
    ) tul
    GROUP BY tul.user_id
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
  LEFT JOIN operation_agg oa ON tul.user_id = oa.user_id
  WHERE tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.user_id, au.email, p.display_name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_user IS 'Returns token usage statistics grouped by user (admin only)';

-- RPC Function: Get token usage grouped by project (FIXED)
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
      tul.project_id,
      jsonb_object_agg(tul.operation_type, op_count) AS operation_counts
    FROM (
      SELECT
        project_id,
        operation_type,
        COUNT(*) as op_count
      FROM public.token_usage_logs
      WHERE user_id = target_user_id
        AND created_at BETWEEN start_date AND end_date
      GROUP BY project_id, operation_type
    ) tul
    GROUP BY tul.project_id
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
  LEFT JOIN operation_agg oa ON tul.project_id = oa.project_id
  WHERE tul.user_id = target_user_id
    AND tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.project_id, proj.name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_project IS 'Returns token usage statistics grouped by project for a specific user (admin only)';

-- RPC Function: Get daily usage (already OK, no nested aggregates)
CREATE OR REPLACE FUNCTION public.get_daily_usage(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW(),
  target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  date DATE,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost_usd NUMERIC,
  unique_users BIGINT
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    DATE(tul.created_at) AS date,
    SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
    SUM(tul.tokens_input) AS total_input_tokens,
    SUM(tul.tokens_output) AS total_output_tokens,
    SUM(tul.cost_usd) AS total_cost_usd,
    COUNT(DISTINCT tul.user_id) AS unique_users
  FROM public.token_usage_logs tul
  WHERE tul.created_at BETWEEN start_date AND end_date
    AND (target_user_id IS NULL OR tul.user_id = target_user_id)
  GROUP BY DATE(tul.created_at)
  ORDER BY date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_daily_usage IS 'Returns daily token usage statistics for time series charts (admin only)';

-- RPC Function: Get summary (already OK, no nested aggregates)
CREATE OR REPLACE FUNCTION public.get_token_usage_summary(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  active_users BIGINT,
  total_operations BIGINT,
  avg_tokens_per_operation NUMERIC,
  most_used_operation TEXT
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH stats AS (
    SELECT
      SUM(tokens_input + tokens_output) AS total_tokens,
      SUM(cost_usd) AS total_cost_usd,
      COUNT(DISTINCT user_id) AS active_users,
      COUNT(*) AS total_operations,
      AVG(tokens_input + tokens_output) AS avg_tokens_per_operation
    FROM public.token_usage_logs
    WHERE created_at BETWEEN start_date AND end_date
  ),
  top_operation AS (
    SELECT operation_type
    FROM public.token_usage_logs
    WHERE created_at BETWEEN start_date AND end_date
    GROUP BY operation_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT
    COALESCE(s.total_tokens, 0) AS total_tokens,
    COALESCE(s.total_cost_usd, 0) AS total_cost_usd,
    COALESCE(s.active_users, 0) AS active_users,
    COALESCE(s.total_operations, 0) AS total_operations,
    COALESCE(s.avg_tokens_per_operation, 0) AS avg_tokens_per_operation,
    COALESCE(t.operation_type, 'none') AS most_used_operation
  FROM stats s
  LEFT JOIN top_operation t ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_summary IS 'Returns summary statistics for admin dashboard cards (admin only)';
