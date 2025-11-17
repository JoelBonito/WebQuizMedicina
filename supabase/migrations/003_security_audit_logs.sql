-- Migration: Security and Audit Logging
-- Creates audit_logs table and enhances security policies
-- Date: 2025-11-16

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

-- Create audit_logs table for security logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  resource_type TEXT,
  resource_id TEXT,
  action TEXT,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- RLS policies for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert audit logs (Edge Functions use service role)
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE audit_logs IS 'Security audit log for tracking all critical operations';
COMMENT ON COLUMN audit_logs.event_type IS 'Type of event (auth.login, data.create, etc)';
COMMENT ON COLUMN audit_logs.severity IS 'Severity level: info, warning, error, critical';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional event-specific data in JSON format';

-- ============================================
-- RATE LIMITING TABLE (Optional - if not using Redis)
-- ============================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- user_id or IP
  endpoint TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(identifier, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start, window_end);

COMMENT ON TABLE rate_limits IS 'Rate limiting data for API endpoints';

-- Function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_end < NOW() - INTERVAL '1 day';
END;
$$;

-- ============================================
-- ENHANCED RLS POLICIES FOR EXISTING TABLES
-- ============================================

-- Add audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  audit_event_type TEXT;
  audit_action TEXT;
BEGIN
  -- Determine event type based on operation
  IF TG_OP = 'INSERT' THEN
    audit_event_type := 'data.create';
    audit_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    audit_event_type := 'data.update';
    audit_action := 'update';
  ELSIF TG_OP = 'DELETE' THEN
    audit_event_type := 'data.delete';
    audit_action := 'delete';
  END IF;

  -- Insert audit log
  INSERT INTO audit_logs (
    event_type,
    severity,
    user_id,
    resource_type,
    resource_id,
    action,
    metadata
  ) VALUES (
    audit_event_type,
    CASE WHEN TG_OP = 'DELETE' THEN 'warning' ELSE 'info' END,
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    audit_action,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'timestamp', NOW()
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Add audit triggers to critical tables
DROP TRIGGER IF EXISTS audit_projects_trigger ON projects;
CREATE TRIGGER audit_projects_trigger
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS audit_sources_trigger ON sources;
CREATE TRIGGER audit_sources_trigger
  AFTER INSERT OR DELETE ON sources
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================
-- SECURITY VIEWS
-- ============================================

-- View for failed login attempts (security monitoring)
CREATE OR REPLACE VIEW security_failed_logins AS
SELECT
  user_id,
  ip_address,
  user_agent,
  COUNT(*) as failed_attempts,
  MAX(created_at) as last_attempt,
  MIN(created_at) as first_attempt
FROM audit_logs
WHERE event_type = 'auth.failed_login'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, ip_address, user_agent
HAVING COUNT(*) >= 3
ORDER BY failed_attempts DESC;

COMMENT ON VIEW security_failed_logins IS 'Monitors failed login attempts for potential security threats';

-- View for AI generation costs (usage tracking)
CREATE OR REPLACE VIEW ai_generation_stats AS
SELECT
  user_id,
  event_type,
  DATE(created_at) as generation_date,
  COUNT(*) as total_generations,
  SUM((metadata->>'estimated_cost')::NUMERIC) as estimated_cost
FROM audit_logs
WHERE event_type LIKE 'ai.%'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, event_type, DATE(created_at)
ORDER BY generation_date DESC, total_generations DESC;

COMMENT ON VIEW ai_generation_stats IS 'Tracks AI generation usage and costs per user';

-- ============================================
-- SECURITY FUNCTIONS
-- ============================================

-- Function to check if IP is blocked
CREATE OR REPLACE FUNCTION is_ip_blocked(check_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  failed_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO failed_count
  FROM audit_logs
  WHERE ip_address = check_ip
    AND event_type IN ('auth.failed_login', 'security.suspicious_activity')
    AND created_at > NOW() - INTERVAL '1 hour';

  RETURN failed_count >= 10; -- Block after 10 failed attempts in 1 hour
END;
$$;

COMMENT ON FUNCTION is_ip_blocked IS 'Checks if an IP address should be blocked due to suspicious activity';

-- ============================================
-- DATA RETENTION POLICY
-- ============================================

-- Function to archive old audit logs (keep 90 days, archive rest)
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete audit logs older than 90 days (adjust as needed)
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND severity IN ('info', 'warning');

  -- Keep critical and error logs for 1 year
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$;

COMMENT ON FUNCTION archive_old_audit_logs IS 'Archives audit logs older than retention period';

-- Schedule cleanup (requires pg_cron extension - optional)
-- SELECT cron.schedule('cleanup-audit-logs', '0 2 * * *', 'SELECT archive_old_audit_logs()');
-- SELECT cron.schedule('cleanup-rate-limits', '0 3 * * *', 'SELECT cleanup_rate_limits()');
