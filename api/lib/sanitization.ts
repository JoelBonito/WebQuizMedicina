// Security utilities for XSS prevention
// Simple HTML sanitization without external dependencies

/**
 * Sanitize plain text strings to prevent XSS
 * Escapes HTML special characters
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize HTML content for summaries
 * Allows only safe medical content tags and removes dangerous attributes
 *
 * Allowed tags: h1-h6, p, ul, ol, li, strong, em, br, table, thead, tbody, tr, th, td
 * Removes: script, style, iframe, object, embed, and event handlers
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string') return '';

  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and their content
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove dangerous tags
  html = html.replace(/<(iframe|object|embed|link|meta|base)[^>]*>/gi, '');

  // Remove event handlers (onclick, onerror, etc.)
  html = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: protocol
  html = html.replace(/javascript:/gi, '');

  // Remove data: URIs (potential XSS vector)
  html = html.replace(/data:text\/html/gi, '');

  // Whitelist approach: Only allow safe tags
  const allowedTags = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'u', 'b', 'i',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'blockquote', 'code', 'pre',
    'span', 'div', 'section', 'article'
  ];

  // Only allow safe attributes
  const allowedAttributes = ['class', 'id'];

  // Remove any tags not in whitelist
  const tagPattern = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  html = html.replace(tagPattern, (match, tagName) => {
    const lowerTag = tagName.toLowerCase();

    // If tag is not allowed, remove it completely
    if (!allowedTags.includes(lowerTag)) {
      return '';
    }

    // Clean attributes in allowed tags
    let cleanTag = match;

    // Remove all attributes except whitelisted ones
    cleanTag = cleanTag.replace(/\s+([a-z-]+)\s*=\s*["']([^"']*)["']/gi, (attrMatch, attrName, attrValue) => {
      if (allowedAttributes.includes(attrName.toLowerCase())) {
        // Sanitize attribute value
        const cleanValue = attrValue
          .replace(/javascript:/gi, '')
          .replace(/data:/gi, '')
          .replace(/on\w+/gi, '');
        return ` ${attrName}="${cleanValue}"`;
      }
      return '';
    });

    return cleanTag;
  });

  return html.trim();
}

/**
 * Validate and sanitize array of strings (e.g., topicos)
 */
export function sanitizeStringArray(arr: any[]): string[] {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(item => typeof item === 'string')
    .map(item => sanitizeString(item))
    .filter(item => item.length > 0);
}

/**
 * Sanitize object keys and string values recursively
 * Useful for sanitizing entire JSON objects before saving to DB
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeString(key);
    sanitized[sanitizedKey] = sanitizeObject(value);
  }

  return sanitized;
}
