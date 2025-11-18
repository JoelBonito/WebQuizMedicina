// Audit logging system for security-critical operations
// Tracks user actions, authentication events, and data access

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================
// AUDIT EVENT TYPES
// ============================================

export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_FAILED_LOGIN = 'auth.failed_login',
  AUTH_PASSWORD_RESET = 'auth.password_reset',
  AUTH_TOKEN_REFRESH = 'auth.token_refresh',

  // Data access events
  DATA_READ = 'data.read',
  DATA_CREATE = 'data.create',
  DATA_UPDATE = 'data.update',
  DATA_DELETE = 'data.delete',

  // AI generation events (expensive operations)
  AI_QUIZ_GENERATED = 'ai.quiz_generated',
  AI_FLASHCARDS_GENERATED = 'ai.flashcards_generated',
  AI_SUMMARY_GENERATED = 'ai.summary_generated',
  AI_FOCUSED_SUMMARY_GENERATED = 'ai.focused_summary_generated',
  AI_CHAT_MESSAGE = 'ai.chat_message',
  AI_EMBEDDINGS_GENERATED = 'ai.embeddings_generated',

  // Security events
  SECURITY_RATE_LIMIT_EXCEEDED = 'security.rate_limit_exceeded',
  SECURITY_INVALID_INPUT = 'security.invalid_input',
  SECURITY_UNAUTHORIZED_ACCESS = 'security.unauthorized_access',
  SECURITY_SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',

  // Project events
  PROJECT_CREATED = 'project.created',
  PROJECT_DELETED = 'project.deleted',
  SOURCE_UPLOADED = 'source.uploaded',
  SOURCE_DELETED = 'source.deleted',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// ============================================
// AUDIT LOG INTERFACE
// ============================================

export interface AuditLog {
  event_type: AuditEventType;
  severity: AuditSeverity;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  error_message?: string;
  created_at?: string;
}

// ============================================
// AUDIT LOGGER CLASS
// ============================================

export class AuditLogger {
  private supabaseClient: any;
  private enableConsoleLog: boolean;

  constructor(supabaseUrl: string, supabaseKey: string, enableConsoleLog = true) {
    this.supabaseClient = createClient(supabaseUrl, supabaseKey);
    this.enableConsoleLog = enableConsoleLog;
  }

  /**
   * Logs an audit event
   */
  async log(event: AuditLog): Promise<void> {
    const enrichedEvent = {
      ...event,
      created_at: new Date().toISOString(),
    };

    // Console logging (useful for development and debugging)
    if (this.enableConsoleLog) {
      const logLevel = this.getConsoleLogLevel(event.severity);
      console[logLevel](
        `[AUDIT] ${event.event_type}`,
        JSON.stringify(enrichedEvent, null, 2)
      );
    }

    // Store in database (create audit_logs table if needed)
    try {
      await this.supabaseClient
        .from('audit_logs')
        .insert(enrichedEvent);
    } catch (error) {
      // Fallback to console if database insert fails
      console.error('[AUDIT] Failed to save audit log to database:', error);
      console.error('[AUDIT] Event:', enrichedEvent);
    }
  }

  /**
   * Logs authentication event
   */
  async logAuth(
    eventType: AuditEventType,
    userId: string | undefined,
    req: Request,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      event_type: eventType,
      severity: this.getAuthEventSeverity(eventType),
      user_id: userId,
      ip_address: this.getIpFromRequest(req),
      user_agent: req.headers.get('user-agent') || undefined,
      metadata,
    });
  }

  /**
   * Logs AI generation event (track costs and usage)
   */
  async logAIGeneration(
    eventType: AuditEventType,
    userId: string,
    projectId: string,
    req: Request,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      event_type: eventType,
      severity: AuditSeverity.INFO,
      user_id: userId,
      ip_address: this.getIpFromRequest(req),
      resource_type: 'project',
      resource_id: projectId,
      metadata: {
        ...metadata,
        estimated_cost: this.estimateAICost(eventType),
      },
    });
  }

  /**
   * Logs security event (rate limiting, unauthorized access, etc)
   */
  async logSecurity(
    eventType: AuditEventType,
    req: Request,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      event_type: eventType,
      severity: AuditSeverity.WARNING,
      user_id: userId,
      ip_address: this.getIpFromRequest(req),
      user_agent: req.headers.get('user-agent') || undefined,
      metadata,
    });
  }

  /**
   * Logs data access event
   */
  async logDataAccess(
    action: 'read' | 'create' | 'update' | 'delete',
    userId: string,
    resourceType: string,
    resourceId: string,
    req: Request,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const eventTypeMap = {
      read: AuditEventType.DATA_READ,
      create: AuditEventType.DATA_CREATE,
      update: AuditEventType.DATA_UPDATE,
      delete: AuditEventType.DATA_DELETE,
    };

    await this.log({
      event_type: eventTypeMap[action],
      severity: action === 'delete' ? AuditSeverity.WARNING : AuditSeverity.INFO,
      user_id: userId,
      ip_address: this.getIpFromRequest(req),
      resource_type: resourceType,
      resource_id: resourceId,
      action,
      metadata,
    });
  }

  /**
   * Logs error event
   */
  async logError(
    error: Error,
    userId: string | undefined,
    req: Request,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      event_type: AuditEventType.SECURITY_SUSPICIOUS_ACTIVITY,
      severity: AuditSeverity.ERROR,
      user_id: userId,
      ip_address: this.getIpFromRequest(req),
      error_message: error.message,
      metadata: {
        ...metadata,
        error_stack: error.stack,
      },
    });
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  private getIpFromRequest(req: Request): string {
    return req.headers.get('x-forwarded-for') ||
           req.headers.get('x-real-ip') ||
           'unknown';
  }

  private getAuthEventSeverity(eventType: AuditEventType): AuditSeverity {
    if (eventType === AuditEventType.AUTH_FAILED_LOGIN) {
      return AuditSeverity.WARNING;
    }
    return AuditSeverity.INFO;
  }

  private getConsoleLogLevel(severity: AuditSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case AuditSeverity.ERROR:
      case AuditSeverity.CRITICAL:
        return 'error';
      case AuditSeverity.WARNING:
        return 'warn';
      default:
        return 'log';
    }
  }

  private estimateAICost(eventType: AuditEventType): string {
    // Rough estimates in USD (update based on actual API pricing)
    const costs = {
      [AuditEventType.AI_QUIZ_GENERATED]: '$0.02',
      [AuditEventType.AI_FLASHCARDS_GENERATED]: '$0.03',
      [AuditEventType.AI_SUMMARY_GENERATED]: '$0.015',
      [AuditEventType.AI_FOCUSED_SUMMARY_GENERATED]: '$0.04', // Pro model
      [AuditEventType.AI_CHAT_MESSAGE]: '$0.005',
    };

    return costs[eventType] || 'unknown';
  }
}

// ============================================
// GLOBAL AUDIT LOGGER INSTANCE
// ============================================

let globalAuditLogger: AuditLogger | null = null;

/**
 * Gets or creates the global audit logger instance
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
                       Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    globalAuditLogger = new AuditLogger(
      supabaseUrl,
      supabaseKey,
      Deno.env.get('ENVIRONMENT') !== 'production'
    );
  }

  return globalAuditLogger;
}

// ============================================
// SQL MIGRATION FOR AUDIT_LOGS TABLE
// ============================================

export const AUDIT_LOGS_TABLE_SQL = `
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

-- RLS policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all audit logs (implement admin role check)
-- CREATE POLICY "Admins can read all audit logs"
--   ON audit_logs FOR SELECT
--   USING (auth.jwt() ->> 'role' = 'admin');

COMMENT ON TABLE audit_logs IS 'Security audit log for tracking all critical operations';
`;
