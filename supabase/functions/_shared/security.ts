// Security middleware and utilities for Edge Functions
// Implements rate limiting, security headers, CORS, and request validation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// ============================================
// CORS CONFIGURATION
// ============================================

/**
 * List of allowed origins for CORS
 * Automatically includes production and development URLs
 */
const ALLOWED_ORIGINS = [
  'https://web-quiz-medicina.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  // Add custom origin from environment variable if provided
  ...(Deno.env.get('ALLOWED_ORIGIN') ? [Deno.env.get('ALLOWED_ORIGIN')!] : []),
];

/**
 * Gets CORS headers based on request origin
 * Returns appropriate origin or rejects with default headers
 */
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  
  // Check if origin is in allowed list
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]; // Default to production URL

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

// ============================================
// SECURITY HEADERS
// ============================================

/**
 * Get security headers for a request (includes CORS)
 */
export function getSecurityHeaders(req: Request): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    
    // Security Headers (OWASP recommended)
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',

    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; '),

    // HTTPS only (when not in development)
    ...(Deno.env.get('ENVIRONMENT') !== 'development' && {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    }),
  };
}

// Backward compatibility: export as constant (uses first allowed origin)
export const securityHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
  ].join('; '),
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Credentials': 'true',
};

// ============================================
// RATE LIMITING
// ============================================

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting middleware
 * Limits requests per user/IP within a time window
 */
export async function checkRateLimit(
  req: Request,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
  // Get identifier (user ID or IP)
  const identifier = await getRateLimitIdentifier(req);
  const key = `${config.keyPrefix || 'rl'}:${identifier}`;

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Clean up expired entries
  if (entry && entry.resetAt < now) {
    rateLimitStore.delete(key);
  }

  // Get or create entry
  const currentEntry = rateLimitStore.get(key) || {
    count: 0,
    resetAt: now + config.windowMs,
  };

  // Check if limit exceeded
  if (currentEntry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: currentEntry.resetAt,
      retryAfter: currentEntry.resetAt - now,
    };
  }

  // Increment count
  currentEntry.count++;
  rateLimitStore.set(key, currentEntry);

  return {
    allowed: true,
    remaining: config.maxRequests - currentEntry.count,
    resetAt: currentEntry.resetAt,
  };
}

/**
 * Gets identifier for rate limiting (user ID or IP)
 */
async function getRateLimitIdentifier(req: Request): Promise<string> {
  // Try to get user ID from auth
  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) return user.id;
    }
  } catch {
    // Fallback to IP
  }

  // Fallback to IP address
  return req.headers.get('x-forwarded-for') ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

/**
 * Standard rate limit configs for different endpoints
 */
export const RATE_LIMITS = {
  // Strict for AI generation (expensive operations)
  AI_GENERATION: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
    keyPrefix: 'ai',
  },

  // Moderate for chat
  CHAT: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 requests per minute
    keyPrefix: 'chat',
  },

  // Lenient for reads
  READ: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 requests per minute
    keyPrefix: 'read',
  },

  // Very strict for auth endpoints
  AUTH: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 requests per minute
    keyPrefix: 'auth',
  },
};

// ============================================
// AUTHENTICATION & AUTHORIZATION
// ============================================

/**
 * Validates JWT token and returns user
 */
export async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return { authenticated: false, user: null };
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabaseClient.auth.getUser();

  if (error || !user) {
    return { authenticated: false, user: null };
  }

  return { authenticated: true, user, supabaseClient };
}

/**
 * Checks if user owns a resource
 */
export async function authorizeResourceAccess(
  supabaseClient: any,
  userId: string,
  resourceType: 'project' | 'source' | 'question' | 'flashcard' | 'summary',
  resourceId: string
): Promise<boolean> {
  const tableName = resourceType === 'source' ? 'sources' :
                    resourceType === 'question' ? 'questions' :
                    resourceType === 'flashcard' ? 'flashcards' :
                    resourceType === 'summary' ? 'summaries' :
                    'projects';

  const { data, error } = await supabaseClient
    .from(tableName)
    .select('user_id')
    .eq('id', resourceId)
    .single();

  if (error || !data) return false;
  return data.user_id === userId;
}

// ============================================
// ERROR CLASSES
// ============================================

export class AuthenticationError extends Error {
  public readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends Error {
  public readonly statusCode = 429;
  public readonly resetAt: number;

  constructor(resetAt: number) {
    super('Rate limit exceeded. Please try again later.');
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }

  toJSON() {
    return {
      error: this.message,
      retry_after: Math.ceil((this.resetAt - Date.now()) / 1000),
    };
  }
}

// ============================================
// REQUEST SIGNING (HMAC)
// ============================================

/**
 * Generates HMAC signature for request
 * Use this for webhook verification or API-to-API communication
 */
export async function generateRequestSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies HMAC signature
 */
export async function verifyRequestSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await generateRequestSignature(payload, secret);
  return signature === expected;
}

// ============================================
// INPUT SANITIZATION
// ============================================

/**
 * Sanitizes user input to prevent common attacks
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .replace(/[<>]/g, '') // Basic XSS prevention
      .replace(/['\";]/g, '') // SQL injection prevention
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Creates a secure error response
 * NEVER exposes stack traces to clients (security risk)
 * Stack traces are logged server-side only
 */
export function createErrorResponse(
  error: Error,
  statusCode = 500,
  req?: Request
): Response {
  // Log full error details server-side (never send to client)
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // Return minimal error info to client (no stack traces)
  const body = {
    error: error.message,
    timestamp: new Date().toISOString(),
  };

  const headers = req ? getSecurityHeaders(req) : securityHeaders;

  return new Response(
    JSON.stringify(body),
    {
      status: statusCode,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Creates a success response with security headers
 */
export function createSuccessResponse(
  data: unknown,
  statusCode = 200,
  req?: Request
): Response {
  const headers = req ? getSecurityHeaders(req) : securityHeaders;
  
  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    }
  );
}
