-- Fix: Convert all remaining RPC functions from USD to BRL
-- Migration: 017_fix_remaining_rpc_functions_brl.sql
--
-- Updates:
-- 1. get_daily_usage: Convert total_cost_usd → total_cost_brl
-- 2. get_token_usage_summary: Convert total_cost_usd → total_cost_brl
--
-- Ensures consistency across all admin dashboard functions

-- ========================================
-- Fix get_daily_usage
-- ========================================
DROP FUNCTION IF EXISTS public.get_daily_usage(timestamptz, timestamptz, uuid);

CREATE FUNCTION public.get_daily_usage(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW(),
  target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  date DATE,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost_brl NUMERIC,  -- Changed from total_cost_usd
  unique_users BIGINT
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    DATE(tul.created_at)::date,
    SUM(tul.tokens_input + tul.tokens_output)::bigint AS total_tokens,
    SUM(tul.tokens_input)::bigint AS total_input_tokens,
    SUM(tul.tokens_output)::bigint AS total_output_tokens,
    (SUM(tul.cost_usd) * 5.5)::numeric AS total_cost_brl,  -- Convert USD to BRL
    COUNT(DISTINCT tul.user_id)::bigint AS unique_users
  FROM public.token_usage_logs tul
  WHERE tul.created_at BETWEEN start_date AND end_date
    AND (target_user_id IS NULL OR tul.user_id = target_user_id)
  GROUP BY DATE(tul.created_at)
  ORDER BY date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_daily_usage IS 'Returns daily token usage statistics for time series charts (admin only) - Costs in BRL';

-- ========================================
-- Fix get_token_usage_summary
-- ========================================
DROP FUNCTION IF EXISTS public.get_token_usage_summary(timestamptz, timestamptz);

CREATE FUNCTION public.get_token_usage_summary(
  start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_tokens BIGINT,
  total_cost_brl NUMERIC,  -- Changed from total_cost_usd
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
      SUM(tokens_input + tokens_output)::bigint AS total_tokens,
      (SUM(cost_usd) * 5.5)::numeric AS total_cost_brl,  -- Convert USD to BRL
      COUNT(DISTINCT user_id)::bigint AS active_users,
      COUNT(*)::bigint AS total_operations,
      AVG(tokens_input + tokens_output)::numeric AS avg_tokens_per_operation
    FROM public.token_usage_logs
    WHERE created_at BETWEEN start_date AND end_date
  ),
  top_operation AS (
    SELECT operation_type::text
    FROM public.token_usage_logs
    WHERE created_at BETWEEN start_date AND end_date
    GROUP BY operation_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  )
  SELECT
    s.total_tokens,
    s.total_cost_brl,
    s.active_users,
    s.total_operations,
    s.avg_tokens_per_operation,
    t.operation_type AS most_used_operation
  FROM stats s
  CROSS JOIN top_operation t;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_summary IS 'Returns summary statistics for admin dashboard cards (admin only) - Costs in BRL';
