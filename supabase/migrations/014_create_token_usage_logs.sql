-- Create token usage tracking system for admin monitoring
-- Migration: 014_create_token_usage_logs.sql

-- Create token_usage_logs table
CREATE TABLE IF NOT EXISTS public.token_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('embedding', 'chat', 'quiz', 'flashcard', 'summary')),
  tokens_input INTEGER NOT NULL DEFAULT 0 CHECK (tokens_input >= 0),
  tokens_output INTEGER NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_id ON public.token_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_project_id ON public.token_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_created_at ON public.token_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_operation_type ON public.token_usage_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_created ON public.token_usage_logs(user_id, created_at DESC);

-- Add comments
COMMENT ON TABLE public.token_usage_logs IS 'Tracks AI token usage for cost monitoring and analytics';
COMMENT ON COLUMN public.token_usage_logs.operation_type IS 'Type of AI operation: embedding, chat, quiz, flashcard, or summary';
COMMENT ON COLUMN public.token_usage_logs.tokens_input IS 'Number of input tokens consumed';
COMMENT ON COLUMN public.token_usage_logs.tokens_output IS 'Number of output tokens generated';
COMMENT ON COLUMN public.token_usage_logs.cost_usd IS 'Estimated cost in USD';
COMMENT ON COLUMN public.token_usage_logs.metadata IS 'Additional metadata (model name, source_id, etc)';

-- Enable Row Level Security
ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can view all token usage logs
CREATE POLICY "Admins can view all token logs"
  ON public.token_usage_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- RLS Policy: Users can view their own token logs
CREATE POLICY "Users can view their own token logs"
  ON public.token_usage_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policy: System can insert token logs (via service role)
CREATE POLICY "Service role can insert token logs"
  ON public.token_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RPC Function: Get token usage grouped by user
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
    tul.user_id,
    au.email AS user_email,
    COALESCE(p.display_name, 'Unnamed User') AS display_name,
    SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
    SUM(tul.tokens_input) AS total_input_tokens,
    SUM(tul.tokens_output) AS total_output_tokens,
    SUM(tul.cost_usd) AS total_cost_usd,
    jsonb_object_agg(
      tul.operation_type,
      COUNT(*)
    ) FILTER (WHERE tul.operation_type IS NOT NULL) AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN auth.users au ON tul.user_id = au.id
  LEFT JOIN public.profiles p ON tul.user_id = p.id
  WHERE tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.user_id, au.email, p.display_name
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_user IS 'Returns token usage statistics grouped by user (admin only)';

-- RPC Function: Get token usage grouped by project for a specific user
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
  SELECT
    tul.project_id,
    COALESCE(proj.name, 'No Project') AS project_name,
    SUM(tul.tokens_input + tul.tokens_output) AS total_tokens,
    SUM(tul.tokens_input) AS total_input_tokens,
    SUM(tul.tokens_output) AS total_output_tokens,
    SUM(tul.cost_usd) AS total_cost_usd,
    jsonb_object_agg(
      tul.operation_type,
      COUNT(*)
    ) FILTER (WHERE tul.operation_type IS NOT NULL) AS operation_counts
  FROM public.token_usage_logs tul
  LEFT JOIN public.projects proj ON tul.project_id = proj.id
  WHERE tul.user_id = target_user_id
    AND tul.created_at BETWEEN start_date AND end_date
  GROUP BY tul.project_id, proj.name
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_by_project IS 'Returns token usage statistics grouped by project for a specific user (admin only)';

-- RPC Function: Get daily token usage for time series chart
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

-- RPC Function: Get summary statistics for dashboard cards
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
    s.total_tokens,
    s.total_cost_usd,
    s.active_users,
    s.total_operations,
    s.avg_tokens_per_operation,
    t.operation_type AS most_used_operation
  FROM stats s
  CROSS JOIN top_operation t;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_token_usage_summary IS 'Returns summary statistics for admin dashboard cards (admin only)';
