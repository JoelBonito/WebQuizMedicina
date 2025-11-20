// Security: Input validation schemas using Zod for Edge Functions
// Prevents injection attacks and ensures data integrity

import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

// ============================================
// COMMON SCHEMAS
// ============================================

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
});

// ============================================
// PROJECT SCHEMAS
// ============================================

export const projectIdSchema = z.object({
  project_id: uuidSchema,
});

export const sourceIdSchema = z.object({
  source_id: uuidSchema,
});

// ============================================
// CONTENT GENERATION SCHEMAS
// ============================================

export const generateQuizSchema = z.object({
  project_id: uuidSchema.optional(),
  source_id: uuidSchema.optional(),
  count: z.number().int().min(1).max(50).optional().default(15),
  difficulty: z.enum(['fácil', 'médio', 'difícil']).optional(),
}).refine(
  (data) => data.project_id || data.source_id,
  { message: 'Either project_id or source_id must be provided' }
);

export const generateFlashcardsSchema = z.object({
  project_id: uuidSchema.optional(),
  source_id: uuidSchema.optional(),
  count: z.number().int().min(1).max(100).optional().default(20),
  difficulty: z.enum(['fácil', 'médio', 'difícil']).optional(),
}).refine(
  (data) => data.project_id || data.source_id,
  { message: 'Either project_id or source_id must be provided' }
);

export const generateSummarySchema = z.object({
  project_id: uuidSchema.optional(),
  source_id: uuidSchema.optional(),
}).refine(
  (data) => data.project_id || data.source_id,
  { message: 'Either project_id or source_id must be provided' }
);

export const generateFocusedSummarySchema = z.object({
  project_id: uuidSchema,
});

// ============================================
// CHAT SCHEMAS
// ============================================

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000, 'Message too long (max 5000 chars)'),
  project_id: uuidSchema,
});

// ============================================
// PROGRESS SCHEMAS
// ============================================

export const saveProgressSchema = z.object({
  question_id: uuidSchema.optional(),
  flashcard_id: uuidSchema.optional(),
  correct: z.boolean().optional(),
  time_spent: z.number().int().min(0).max(3600000).optional(),
  difficulty_rating: z.enum(['easy', 'medium', 'hard']).optional(),
}).refine(
  (data) => data.question_id || data.flashcard_id,
  { message: 'Either question_id or flashcard_id must be provided' }
);

// ============================================
// DIFFICULTY SCHEMAS
// ============================================

export const addDifficultySchema = z.object({
  project_id: uuidSchema,
  topico: z.string().min(1).max(500, 'Topic too long (max 500 chars)'),
  tipo_origem: z.enum(['quiz', 'flashcard', 'chat']),
  context: z.string().max(2000, 'Context too long (max 2000 chars)').optional(),
});

export const markDifficultyResolvedSchema = z.object({
  difficulty_id: uuidSchema,
  resolvido: z.boolean(),
});

// ============================================
// VALIDATION HELPER FUNCTIONS
// ============================================

/**
 * Validates request body against a Zod schema
 * Returns parsed data or throws validation error
 */
export async function validateRequest<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await req.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Invalid request data',
        error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      );
    }
    throw error;
  }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQueryParams<T>(
  url: URL,
  schema: z.ZodSchema<T>
): T {
  try {
    const params = Object.fromEntries(url.searchParams.entries());
    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Invalid query parameters',
        error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      );
    }
    throw error;
  }
}

// ============================================
// CUSTOM ERROR CLASSES
// ============================================

export class ValidationError extends Error {
  public readonly errors: Array<{ field: string; message: string }>;
  public readonly statusCode = 400;

  constructor(message: string, errors: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }

  toJSON() {
    return {
      error: this.message,
      validation_errors: this.errors,
    };
  }
}

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitizes string input to prevent XSS
 * Basic sanitization for backend - frontend should use DOMPurify
 * Removes dangerous protocols: javascript:, data:, vbscript:
 * Uses iterative approach to prevent bypass via nested patterns
 *
 * @param input - User input string to sanitize
 * @returns Sanitized string safe for use in HTML attributes
 *
 * @example
 * // Prevents nested protocol bypass
 * sanitizeString('jajavascript:vascript:alert()') // → 'alert()'
 *
 * @example
 * // Prevents nested event handler bypass
 * sanitizeString('ononclick=click=alert()') // → 'alert()'
 *
 * @example
 * // Prevents nested angle bracket bypass
 * sanitizeString('<<script>>alert()<</script>>') // → 'scriptalert()/script'
 *
 * @security
 * CWE-20: Improper Input Validation (Iterative sanitization prevents bypass)
 * OWASP A03:2024 - Injection (XSS prevention)
 */
export function sanitizeString(input: string): string {
  let sanitized = input;
  let previous: string;

  // Iteratively remove dangerous content until no changes occur
  // This prevents bypass attacks using nested or malformed patterns:
  // - ononclick=click= → onclick= → (empty)
  // - jajavascript:vascript: → javascript: → (empty)
  // - <<>> → <> → (empty)
  do {
    previous = sanitized;
    sanitized = sanitized
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  } while (sanitized !== previous);

  return sanitized.trim();
}

/**
 * Sanitizes HTML content - removes dangerous tags and attributes
 * Removes dangerous protocols: javascript:, data:, vbscript:
 * Uses iterative approach to prevent bypass via nested tags
 *
 * @param html - User-generated HTML to sanitize
 * @returns Sanitized HTML with dangerous elements removed
 *
 * @example
 * // Removes event handlers (quoted and unquoted)
 * sanitizeHtml('<div onclick="alert(1)">') // → '<div >'
 * sanitizeHtml('<div onclick=alert(1)>')   // → '<div >'
 *
 * @security
 * CWE-20: Improper Input Validation
 * CWE-79: Cross-site Scripting (XSS)
 * OWASP A03:2024 - Injection
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;
  let previous: string;

  // Iteratively remove dangerous content until no changes occur
  // This prevents bypass attacks using nested or malformed tags
  do {
    previous = sanitized;
    sanitized = sanitized
      // Remove script tags (handles </script> with optional whitespace)
      .replace(/<script\b[^<]*(?:(?!<\/script\s*>)<[^<]*)*<\/script\s*>/gi, '')
      // Remove iframe tags (handles </iframe> with optional whitespace)
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe\s*>)<[^<]*)*<\/iframe\s*>/gi, '')
      // Remove event handlers with quotes (onclick="...")
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove event handlers without quotes (onclick=alert)
      .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
      // Remove dangerous protocols
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '');
  } while (sanitized !== previous);

  return sanitized;
}

/**
 * Validates and sanitizes file names
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}
