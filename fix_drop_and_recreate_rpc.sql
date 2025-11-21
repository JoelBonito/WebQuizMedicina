-- Fix: Drop old functions and recreate with BRL support
-- Run this in Supabase SQL Editor

-- Drop all old functions with their exact signatures
DROP FUNCTION IF EXISTS public.get_token_usage_by_user(timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.get_token_usage_by_project(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.get_daily_usage(timestamptz, timestamptz, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_token_usage_summary(timestamptz, timestamptz) CASCADE;

-- RPC Function: Get token usage grouped by user (with BRL)
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
  total_cost_brl NUMERIC,
  operation_counts JSONB
) AS $$
DECLARE
  usd_to_brl NUMERIC := 5.50; -- Taxa de câmbio USD -> BRL
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH user_logs AS (
    SELECT
      t.user_id,
      t.tokens_input,
      t.tokens_output,
      t.cost_usd,
      t.operation_type
    FROM public.token_usage_logs t
    WHERE t.created_at BETWEEN get_token_usage_by_user.start_date AND get_token_usage_by_user.end_date
  ),
  operation_agg AS (
    SELECT
      ul.user_id AS agg_user_id,
      jsonb_object_agg(ul.operation_type, ul.op_count) AS operation_counts
    FROM (
      SELECT
        user_id,
        operation_type,
        COUNT(*) as op_count
      FROM user_logs
      GROUP BY user_id, operation_type
    ) ul
    GROUP BY ul.user_id
  )
  SELECT
    ul.user_id,
    au.email AS user_email,
    COALESCE(p.display_name, 'Unnamed User') AS display_name,
    SUM(ul.tokens_input + ul.tokens_output) AS total_tokens,
    SUM(ul.tokens_input) AS total_input_tokens,
    SUM(ul.tokens_output) AS total_output_tokens,
    SUM(ul.cost_usd) AS total_cost_usd,
    SUM(ul.cost_usd * usd_to_brl) AS total_cost_brl,
    COALESCE(oa.operation_counts, '{}'::jsonb) AS operation_counts
  FROM user_logs ul
  LEFT JOIN auth.users au ON ul.user_id = au.id
  LEFT JOIN public.profiles p ON ul.user_id = p.id
  LEFT JOIN operation_agg oa ON ul.user_id = oa.agg_user_id
  GROUP BY ul.user_id, au.email, p.display_name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC Function: Get token usage grouped by project (with BRL)
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
  total_cost_brl NUMERIC,
  operation_counts JSONB
) AS $$
DECLARE
  usd_to_brl NUMERIC := 5.50; -- Taxa de câmbio USD -> BRL
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  WITH project_logs AS (
    SELECT
      t.project_id,
      t.tokens_input,
      t.tokens_output,
      t.cost_usd,
      t.operation_type
    FROM public.token_usage_logs t
    WHERE t.user_id = get_token_usage_by_project.target_user_id
      AND t.created_at BETWEEN get_token_usage_by_project.start_date AND get_token_usage_by_project.end_date
  ),
  operation_agg AS (
    SELECT
      pl.project_id AS agg_project_id,
      jsonb_object_agg(pl.operation_type, pl.op_count) AS operation_counts
    FROM (
      SELECT
        project_id,
        operation_type,
        COUNT(*) as op_count
      FROM project_logs
      GROUP BY project_id, operation_type
    ) pl
    GROUP BY pl.project_id
  )
  SELECT
    pl.project_id,
    COALESCE(proj.name, 'No Project') AS project_name,
    SUM(pl.tokens_input + pl.tokens_output) AS total_tokens,
    SUM(pl.tokens_input) AS total_input_tokens,
    SUM(pl.tokens_output) AS total_output_tokens,
    SUM(pl.cost_usd) AS total_cost_usd,
    SUM(pl.cost_usd * usd_to_brl) AS total_cost_brl,
    COALESCE(oa.operation_counts, '{}'::jsonb) AS operation_counts
  FROM project_logs pl
  LEFT JOIN public.projects proj ON pl.project_id = proj.id
  LEFT JOIN operation_agg oa ON pl.project_id = oa.agg_project_id
  GROUP BY pl.project_id, proj.name, oa.operation_counts
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC Function: Get daily usage (with BRL)
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
  total_cost_brl NUMERIC,
  unique_users BIGINT
) AS $$
DECLARE
  usd_to_brl NUMERIC := 5.50; -- Taxa de câmbio USD -> BRL
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
    SUM(tul.cost_usd * usd_to_brl) AS total_cost_brl,
    COUNT(DISTINCT tul.user_id) AS unique_users
  FROM public.token_usage_logs tul
  WHERE tul.created_at BETWEEN get_daily_usage.start_date AND get_daily_usage.end_date
    AND (get_daily_usage.target_user_id IS NULL OR tul.user_id = get_daily_usage.target_user_id)
  GROUP BY DATE(tul.created_at)
  ORDER BY date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC Function: Get summary (with BRL)
CREATE OR REPLACE FUNCTION public.get_token_usage_summary(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  total_cost_brl NUMERIC,
  active_users BIGINT,
  total_operations BIGINT,
  avg_tokens_per_operation NUMERIC,
  most_used_operation TEXT
) AS $$
DECLARE
  usd_to_brl NUMERIC := 5.50; -- Taxa de câmbio USD -> BRL
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
    WHERE created_at BETWEEN get_token_usage_summary.start_date AND get_token_usage_summary.end_date
  ),
  top_operation AS (
    SELECT operation_type
    FROM public.token_usage_logs
    WHERE created_at BETWEEN get_token_usage_summary.start_date AND get_token_usage_summary.end_date
    GROUP BY operation_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT
    COALESCE(s.total_tokens, 0) AS total_tokens,
    COALESCE(s.total_cost_usd, 0) AS total_cost_usd,
    COALESCE(s.total_cost_usd * usd_to_brl, 0) AS total_cost_brl,
    COALESCE(s.active_users, 0) AS active_users,
    COALESCE(s.total_operations, 0) AS total_operations,
    COALESCE(s.avg_tokens_per_operation, 0) AS avg_tokens_per_operation,
    COALESCE(t.operation_type, 'none') AS most_used_operation
  FROM stats s
  LEFT JOIN top_operation t ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
