"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeString = exports.validateRequest = exports.generateRecoveryQuizSchema = exports.generateRecoveryFlashcardsSchema = exports.generateFocusedSummarySchema = exports.generateMindmapSchema = exports.chatSchema = exports.generateFlashcardsSchema = exports.generateQuizSchema = void 0;
const zod_1 = require("zod");
const https_1 = require("firebase-functions/v2/https");
// Relaxed ID validation to support both UUIDs (Supabase) and Firestore IDs
const idSchema = zod_1.z.string().min(1);
exports.generateQuizSchema = zod_1.z.object({
    source_ids: zod_1.z.array(idSchema).optional(),
    project_id: idSchema.optional(),
    count: zod_1.z.number().min(1).max(50).default(10),
    difficulty: zod_1.z.string().nullish(),
});
exports.generateFlashcardsSchema = zod_1.z.object({
    source_id: idSchema.optional(),
    project_id: idSchema.optional(),
    count: zod_1.z.number().min(1).max(50).default(10),
    difficulty: zod_1.z.string().nullish(), // Support difficulty selection
});
exports.chatSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(2000),
    project_id: idSchema,
});
exports.generateMindmapSchema = zod_1.z.object({
    source_ids: zod_1.z.array(idSchema).optional(),
    project_id: idSchema.optional(),
    tipo: zod_1.z.enum(['standard', 'recovery']).optional().default('standard'),
}).refine(data => data.source_ids || data.project_id, {
    message: "Either source_ids or project_id must be provided"
});
exports.generateFocusedSummarySchema = zod_1.z.object({
    project_id: idSchema,
});
exports.generateRecoveryFlashcardsSchema = zod_1.z.object({
    project_id: idSchema,
    count: zod_1.z.number().min(1).max(50).default(10),
    difficulties: zod_1.z.array(zod_1.z.any()).nullish(), // Relaxed validation for difficulties objects
});
exports.generateRecoveryQuizSchema = zod_1.z.object({
    project_id: idSchema,
    count: zod_1.z.number().min(1).max(50).default(10),
    difficulty: zod_1.z.enum(["fácil", "médio", "difícil"]).nullish(),
    difficulties: zod_1.z.array(zod_1.z.any()).nullish(), // Relaxed validation for difficulties objects
});
function validateRequest(data, schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new https_1.HttpsError("invalid-argument", "Invalid request data", result.error.flatten());
    }
    return result.data;
}
exports.validateRequest = validateRequest;
function sanitizeString(str) {
    if (!str)
        return "";
    // Basic sanitization to remove null bytes and control characters
    return str.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "").trim();
}
exports.sanitizeString = sanitizeString;
//# sourceMappingURL=validation.js.map