import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

// Relaxed ID validation to support both UUIDs (Supabase) and Firestore IDs
const idSchema = z.string().min(1);

export const generateQuizSchema = z.object({
    source_ids: z.array(idSchema).optional(),
    project_id: idSchema.optional(),
    count: z.number().min(1).max(50).default(10),
    difficulty: z.string().nullish(),
});

export const generateFlashcardsSchema = z.object({
    source_id: idSchema.optional(),
    project_id: idSchema.optional(),
    count: z.number().min(1).max(50).default(10),
    difficulty: z.string().nullish(), // Support difficulty selection
});

export const chatSchema = z.object({
    message: z.string().min(1).max(2000),
    project_id: idSchema,
});

export const generateMindmapSchema = z.object({
    source_ids: z.array(idSchema).optional(),
    project_id: idSchema.optional(),
    tipo: z.enum(['standard', 'recovery']).optional().default('standard'),
}).refine(data => data.source_ids || data.project_id, {
    message: "Either source_ids or project_id must be provided"
});

export const generateFocusedSummarySchema = z.object({
    project_id: idSchema,
});

export const generateRecoveryFlashcardsSchema = z.object({
    project_id: idSchema,
    count: z.number().min(1).max(50).default(10),
    difficulties: z.array(z.any()).nullish(), // Relaxed validation for difficulties objects
});

export const generateRecoveryQuizSchema = z.object({
    project_id: idSchema,
    count: z.number().min(1).max(50).default(10),
    difficulty: z.enum(["fácil", "médio", "difícil"]).nullish(),
    difficulties: z.array(z.any()).nullish(), // Relaxed validation for difficulties objects
});

export function validateRequest<T>(data: any, schema: z.ZodSchema<T>): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new HttpsError(
            "invalid-argument",
            "Invalid request data",
            result.error.flatten()
        );
    }
    return result.data;
}

export function sanitizeString(str: string): string {
    if (!str) return "";
    // Basic sanitization to remove null bytes and control characters
    return str.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "").trim();
}
