"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate_mindmap = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const gemini_1 = require("./shared/gemini");
const output_limits_1 = require("./shared/output_limits");
const sanitization_1 = require("./shared/sanitization");
const validation_1 = require("./shared/validation");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const language_helper_1 = require("./shared/language_helper");
exports.generate_mindmap = (0, https_1.onCall)({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1",
    cors: true,
}, async (request) => {
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
        }
        // Get user's language preference
        const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, request.auth.uid);
        const { source_ids, project_id, tipo } = (0, validation_1.validateRequest)(request.data, validation_1.generateMindmapSchema);
        const userId = request.auth.uid;
        // 1. Fetch Sources
        let sources = [];
        const sourcesRef = db.collection("sources");
        if (source_ids && source_ids.length > 0) {
            console.log(`🗺️ [MindMap] Fetching ${source_ids.length} user-selected sources`);
            // Firestore 'in' query supports max 10 items. Batch if needed.
            // For simplicity, assuming < 10 for now or fetching all and filtering in memory if needed.
            // But 'in' with documentId works.
            // If > 10, we need to batch.
            const chunks = [];
            for (let i = 0; i < source_ids.length; i += 10) {
                chunks.push(source_ids.slice(i, i + 10));
            }
            for (const chunk of chunks) {
                const snapshot = await sourcesRef
                    .where(admin.firestore.FieldPath.documentId(), "in", chunk)
                    .get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'ready') {
                        sources.push(Object.assign({ id: doc.id }, data));
                    }
                });
            }
        }
        else if (project_id) {
            console.log(`🗺️ [MindMap] Fetching ALL sources from project: ${project_id}`);
            const snapshot = await sourcesRef
                .where("project_id", "==", project_id)
                .where("status", "==", "ready")
                .orderBy("created_at", "desc")
                .get();
            snapshot.forEach(doc => {
                sources.push(Object.assign({ id: doc.id }, doc.data()));
            });
        }
        if (sources.length === 0) {
            throw new https_1.HttpsError("not-found", "No sources found");
        }
        const finalSourceIds = sources.map(s => s.id);
        let combinedContent = '';
        for (const source of sources) {
            if (source.extracted_content) {
                const sanitizedContent = (0, sanitization_1.cleanString)(source.extracted_content);
                combinedContent += `\n\n=== ${(0, sanitization_1.cleanString)(source.name)} ===\n${sanitizedContent}`;
            }
        }
        console.log(`🗺️ [MindMap] Combined ${sources.length} sources: ${combinedContent.length} chars`);
        if (!combinedContent.trim()) {
            throw new https_1.HttpsError("failed-precondition", "No content available to generate mind map");
        }
        // 2. Token Calculation
        const inputTokens = (0, output_limits_1.estimateTokens)(combinedContent);
        console.log(`🗺️ [MindMap] Input: ~${inputTokens} tokens, Output limit: 32768 tokens`);
        // 3. The Improved Prompt with Standard Markdown Rules
        const prompt = `You are an expert in medical didactics. Create a COMPLETE and DETAILED MIND MAP based on the provided content.

${(0, language_helper_1.getLanguageInstruction)(language)}

CONTENT:
${combinedContent}

TECHNICAL INSTRUCTIONS (CRITICAL - FOLLOW EXACTLY):

 1. **MANDATORY JSON FORMAT**: 
    - Your response MUST be ONLY a valid JSON object
    - Required fields: "titulo" (string) and "markdown" (string)
    - Nothing before or after the JSON (do NOT use \`\`\`json)
    - If the user language is English, title should be "title", if Portuguese "titulo". Or just use "titulo" as key and translate the value. Let's keep "titulo" as key for compatibility.

2. **MARKDOWN STRUCTURE (Markmap)**:
   - Use standard Markdown syntax for hierarchical lists.
   - The root node must be an H1 title (# Title).
   - Main branches must be H2 titles (## Branch).
   - Sub-branches can be H3 (###) or hyphen lists (-).
   - Use **bold** for emphasis.
   - Use *itálics* for secondary details.

3. **HIERARCHY AND DEPTH**:
   - Create a deep structure (at least 3-4 levels).
   - Use nested lists to detail concepts.
   - Example:
${(0, language_helper_1.getMindmapExample)(language)}

4. **ALLOWED CHARACTERS**:
   - Use full UTF-8 (accents allowed).
   - You can use emojis to illustrate main topics.
   - ${(0, language_helper_1.getLanguageInstruction)(language)}

EXPECTED JSON EXAMPLE:
{
  "titulo": "Mind Map Title",
  "markdown": "# Main Title\\n## Branch 1\\n- Sub-item\\n  - Detail\\n## Branch 2\\n- Sub-item"
}

Generate the JSON now, ensuring the "markdown" field contains a valid string with line breaks (\\n).`;
        // 4. Call Gemini
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for mindmap generation`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 32768, // Increased for large mindmaps
            true // JSON mode
            );
        }
        catch (error) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 32768, true);
            }
            else {
                throw error;
            }
        }
        console.log(`✅ MindMap generated: ${result.usage.outputTokens} tokens`);
        // 5. Parse & Clean
        const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
        if (!parsed.titulo || (!parsed.markdown && !parsed.mermaid)) {
            console.error('Invalid AI Response:', result.text.substring(0, 200));
            throw new https_1.HttpsError("internal", "Invalid response format from AI");
        }
        // Handle legacy mermaid field if model hallucinates it, but prefer markdown
        let contentMarkdown = parsed.markdown;
        let contentMermaid = parsed.mermaid || '';
        // If only mermaid is present, we'll save it as mermaid (legacy support)
        // But ideally we want markdown.
        // 6. Save to Database
        const titlePrefix = tipo === 'recovery' ? 'Recovery: ' : '';
        const finalTitle = titlePrefix + (0, sanitization_1.cleanString)(parsed.titulo);
        const mindmapData = {
            project_id: project_id || sources[0].project_id,
            user_id: userId,
            title: finalTitle,
            content_markdown: contentMarkdown, // New field
            content_mermaid: contentMermaid, // Keep for backward compatibility or fallback
            source_ids: finalSourceIds,
            tipo: tipo,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = await db.collection("mindmaps").add(mindmapData);
        const savedDoc = await docRef.get();
        console.log(`✅ MindMap saved: ${docRef.id}`);
        // 7. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(userId, project_id || sources[0].project_id, "mindmap", result.usage.inputTokens, result.usage.outputTokens, modelName, // Log the actual model used
        { source_count: finalSourceIds.length, tipo });
        return { success: true, mindmap: Object.assign({ id: docRef.id }, savedDoc.data()) };
    }
    catch (error) {
        console.error("❌ Error generating mind map:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to generate mind map");
    }
});
//# sourceMappingURL=generate_mindmap.js.map