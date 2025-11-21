-- Fix: Convert cost from USD to BRL and add type casting for get_token_usage_by_project
-- Migration: 016_fix_get_token_usage_by_project_type_mismatch.sql
--
-- Reason:
-- 1. Frontend expects total_cost_brl but function returns total_cost_usd
-- 2. Prevent PostgREST type mismatch errors with explicit casts
-- 3. Convert USD to BRL using exchange rate (1 USD ≈ 5.5 BRL)
--
-- Note: Must DROP function first because we're changing the return type signature

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
  total_cost_brl NUMERIC,  -- Changed from total_cost_usd to total_cost_brl
  operation_counts JSONB
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access this function';
  END IF;

  RETURN QUERY
  SELECT
    tul.project_id::uuid,
    COALESCE(proj.name, 'No Project')::text AS project_name,  -- Explicit cast to text
    SUM(tul.tokens_input + tul.tokens_output)::bigint AS total_tokens,
    SUM(tul.tokens_input)::bigint AS total_input_tokens,
    SUM(tul.tokens_output)::bigint AS total_output_tokens,
    (SUM(tul.cost_usd) * 5.5)::numeric AS total_cost_brl,  -- Convert USD to BRL (1 USD ≈ 5.5 BRL)
    jsonb_object_agg(
      tul.operation_type,
      COUNT(*)
    ) FILTER (WHERE tul.operation_type IS NOT NULL)::jsonb AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN public.projects proj ON tul.project_id = proj.id
  WHERE tul.user_id = target_user_id
    AND tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.project_id, proj.name
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_project IS 'Returns token usage statistics grouped by project for a specific user (admin only) - Returns costs in BRL with type casting';
