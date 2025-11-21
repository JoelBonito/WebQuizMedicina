-- Fix: Ensure return column types exactly match declared RETURNS TABLE
-- Migration: 015_fix_get_token_usage_by_user_type_mismatch.sql
--
-- Reason: Prevent PostgREST error "Returned type character varying(255) does not match expected type text"
-- The auth.users.email column is typed as character varying(255), but the function declares user_email as TEXT.
-- Postgres requires exact type matching for RETURNS TABLE functions.
--
-- Solution: Add explicit type casts to ensure SELECT projection matches RETURNS TABLE declaration.

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
  SELECT
    tul.user_id::uuid,
    au.email::text AS user_email,  -- Explicit cast from varchar(255) to text
    COALESCE(p.display_name, 'Unnamed User')::text AS display_name,  -- Explicit cast to text
    SUM(tul.tokens_input + tul.tokens_output)::bigint AS total_tokens,
    SUM(tul.tokens_input)::bigint AS total_input_tokens,
    SUM(tul.tokens_output)::bigint AS total_output_tokens,
    SUM(tul.cost_usd)::numeric AS total_cost_usd,
    jsonb_object_agg(
      tul.operation_type,
      COUNT(*)
    ) FILTER (WHERE tul.operation_type IS NOT NULL)::jsonb AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN auth.users au ON tul.user_id = au.id
  LEFT JOIN public.profiles p ON tul.user_id = p.id
  WHERE tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.user_id, au.email, p.display_name
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_user IS 'Returns token usage statistics grouped by user (admin only) - Fixed type casting for PostgREST compatibility';
