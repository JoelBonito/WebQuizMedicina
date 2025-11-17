// CORS configuration with security enhancements
// SECURITY: Restrict origins in production to your domain only

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  Deno.env.get('ALLOWED_ORIGIN') || '*', // Set in production to your domain
];

/**
 * Gets CORS headers with origin validation
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  // Check if origin is allowed
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[ALLOWED_ORIGINS.length - 1]; // Fallback to configured origin or *

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

// Deprecated: Use getCorsHeaders() instead for better security
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
