// XSS Protection: Sanitization utilities using DOMPurify
// Use these functions to sanitize any user-generated content before rendering

import DOMPurify from 'isomorphic-dompurify';

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG: DOMPurify.Config = {
  // Allow safe HTML tags
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'span', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],

  // Allow safe attributes
  ALLOWED_ATTR: [
    'href', 'title', 'class', 'id', 'style', 'target', 'rel',
  ],

  // Additional safety
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  SAFE_FOR_TEMPLATES: true,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

const STRICT_CONFIG: DOMPurify.Config = {
  // Very restrictive - only basic text formatting
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u'],
  ALLOWED_ATTR: [],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

const RICH_CONTENT_CONFIG: DOMPurify.Config = {
  // For AI-generated summaries and rich content
  ...DEFAULT_CONFIG,
  ALLOWED_TAGS: [
    ...DEFAULT_CONFIG.ALLOWED_TAGS!,
    'section', 'article', 'header', 'footer', 'nav', 'aside',
    'figure', 'figcaption', 'mark', 'small', 'sub', 'sup',
  ],
};

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitizes HTML content with default safe configuration
 * Use for user-generated content that may contain HTML
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, DEFAULT_CONFIG);
}

/**
 * Sanitizes HTML with strict configuration (minimal tags)
 * Use for comments, chat messages, etc.
 */
export function sanitizeStrict(dirty: string): string {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, STRICT_CONFIG);
}

/**
 * Sanitizes rich HTML content (AI-generated summaries, articles)
 * Allows more tags for better formatting
 */
export function sanitizeRichContent(dirty: string): string {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, RICH_CONTENT_CONFIG);
}

/**
 * Sanitizes plain text (removes all HTML)
 * Use for text-only fields (titles, names, etc.)
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return '';

  // Remove all HTML tags
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitizes URL to prevent javascript: and data: protocols
 * Use for any user-provided URLs
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';

  // Remove dangerous protocols
  const cleaned = url.trim();

  // Check for dangerous protocols
  const dangerousProtocols = /^(javascript|data|vbscript|file):/i;
  if (dangerousProtocols.test(cleaned)) {
    return '';
  }

  // Allow only http, https, mailto, tel
  const allowedProtocols = /^(https?|mailto|tel):/i;
  if (!allowedProtocols.test(cleaned) && !cleaned.startsWith('/')) {
    return `https://${cleaned}`;
  }

  return cleaned;
}

/**
 * Sanitizes user input for search queries
 * Prevents SQL injection and XSS in search
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';

  return query
    .trim()
    .replace(/[<>'"]/g, '') // Remove dangerous chars
    .replace(/[;]/g, '') // Remove SQL statement terminators
    .substring(0, 100); // Limit length
}

/**
 * Sanitizes file name to prevent path traversal
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName) return '';

  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars
    .replace(/\.{2,}/g, '.') // Prevent ../
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Checks if string contains potential XSS
 */
export function containsXSS(input: string): boolean {
  if (!input) return false;

  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /eval\(/i,
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Checks if string contains potential SQL injection
 */
export function containsSQLInjection(input: string): boolean {
  if (!input) return false;

  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(-{2}|\/\*|\*\/)/,  // SQL comments
    /(\bOR\b.*=.*\bOR\b)/i,
    /(\bAND\b.*=.*\bAND\b)/i,
    /(;|\|\||&&)/,  // Statement terminators and logic operators
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

// ============================================
// REACT HELPERS
// ============================================

/**
 * Safely renders HTML in React components
 * Use with dangerouslySetInnerHTML
 *
 * @example
 * <div dangerouslySetInnerHTML={createSafeMarkup(htmlContent)} />
 */
export function createSafeMarkup(html: string, config: 'default' | 'strict' | 'rich' = 'default') {
  let sanitized: string;

  switch (config) {
    case 'strict':
      sanitized = sanitizeStrict(html);
      break;
    case 'rich':
      sanitized = sanitizeRichContent(html);
      break;
    default:
      sanitized = sanitizeHtml(html);
  }

  return { __html: sanitized };
}

/**
 * Hook for sanitizing form input in real-time
 */
export function useSanitizedInput(value: string, type: 'text' | 'html' | 'search' = 'text'): string {
  switch (type) {
    case 'html':
      return sanitizeHtml(value);
    case 'search':
      return sanitizeSearchQuery(value);
    default:
      return sanitizeText(value);
  }
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Configure DOMPurify hooks (optional)
 */
export function configureDOMPurify() {
  // Add a hook to log sanitization events (useful for debugging)
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Example: Add noopener noreferrer to all external links
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  return () => {
    // Cleanup: Remove hooks
    DOMPurify.removeAllHooks();
  };
}
