import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { estimateTokens } from "./shared/output_limits";
import { sanitizeString as sanitizeStringUtil } from "./shared/sanitization";
import { validateRequest, generateMindmapSchema } from "./shared/validation";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";





export const generate_mindmap = onCall({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1",
    cors: true,
}, async (request) => {
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "User must be authenticated");
        }

        // Get user's language preference
        const language = await getLanguageFromRequest(request.data, db, request.auth.uid);

        const { source_ids, project_id, tipo } = validateRequest(request.data, generateMindmapSchema);
        const userId = request.auth.uid;

        // 1. Fetch Sources
        let sources: any[] = [];
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
                        sources.push({ id: doc.id, ...data });
                    }
                });
            }

        } else if (project_id) {
            console.log(`🗺️ [MindMap] Fetching ALL sources from project: ${project_id}`);
            const snapshot = await sourcesRef
                .where("project_id", "==", project_id)
                .where("status", "==", "ready")
                .orderBy("created_at", "desc")
                .get();

            snapshot.forEach(doc => {
                sources.push({ id: doc.id, ...doc.data() });
            });
        }

        if (sources.length === 0) {
            throw new HttpsError("not-found", "No sources found");
        }

        const finalSourceIds = sources.map(s => s.id);
        let combinedContent = '';

        for (const source of sources) {
            if (source.extracted_content) {
                const sanitizedContent = sanitizeStringUtil(source.extracted_content);
                combinedContent += `\n\n=== ${sanitizeStringUtil(source.name)} ===\n${sanitizedContent}`;
            }
        }

        console.log(`🗺️ [MindMap] Combined ${sources.length} sources: ${combinedContent.length} chars`);

        if (!combinedContent.trim()) {
            throw new HttpsError("failed-precondition", "No content available to generate mind map");
        }

        // 2. Token Calculation
        const inputTokens = estimateTokens(combinedContent);

        console.log(`🗺️ [MindMap] Input: ~${inputTokens} tokens, Output limit: 32768 tokens`);

        // 3. The Improved Prompt with Standard Markdown Rules
        const prompt = `You are an expert in medical didactics. Create a COMPLETE and DETAILED MIND MAP based on the provided content.

${getLanguageInstruction(language)}

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
     # Heart Failure
     ## Pathophysiology
     - Systolic Dysfunction
       - Ejection Fraction < 40%
     - Diastolic Dysfunction
     ## Symptoms
     - Congestive
       - Dyspnea
       - Edema

4. **ALLOWED CHARACTERS**:
   - Use full UTF-8 (accents allowed).
   - You can use emojis to illustrate main topics.
   - ${getLanguageInstruction(language)}

EXEMPLO DO JSON ESPERADO:
{
  "titulo": "Mapa Mental de Insuficiência Cardíaca",
  "markdown": "# Insuficiência Cardíaca\\n## Fisiopatologia\\n- Disfunção Sistólica\\n  - Fração de Ejeção < 40%\\n- Disfunção Diastólica\\n## Sintomas\\n- Congestivos\\n  - Dispneia\\n  - Edema"
}

Gere o JSON agora, garantindo que o campo "markdown" contenha uma string válida com quebras de linha (\\n).`;

        // 4. Call Gemini
        // ✅ Seleção automática e inteligente
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for mindmap generation`);

        let result;
        try {
            result = await callGeminiWithUsage(
                prompt,
                modelName,
                32768, // Increased for large mindmaps
                true // JSON mode
            );
        } catch (error: any) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await callGeminiWithUsage(
                    prompt,
                    fallbackModel,
                    32768,
                    true
                );
            } else {
                throw error;
            }
        }

        console.log(`✅ MindMap generated: ${result.usage.outputTokens} tokens`);

        // 5. Parse & Clean
        const parsed = parseJsonFromResponse(result.text);

        if (!parsed.titulo || (!parsed.markdown && !parsed.mermaid)) {
            console.error('Invalid AI Response:', result.text.substring(0, 200));
            throw new HttpsError("internal", "Invalid response format from AI");
        }

        // Handle legacy mermaid field if model hallucinates it, but prefer markdown
        let contentMarkdown = parsed.markdown;
        let contentMermaid = parsed.mermaid || '';

        // If only mermaid is present, we'll save it as mermaid (legacy support)
        // But ideally we want markdown.

        // 6. Save to Database
        const titlePrefix = tipo === 'recovery' ? 'Recovery: ' : '';
        const finalTitle = titlePrefix + sanitizeStringUtil(parsed.titulo);

        const mindmapData = {
            project_id: project_id || sources[0].project_id,
            user_id: userId,
            title: finalTitle,
            content_markdown: contentMarkdown, // New field
            content_mermaid: contentMermaid,   // Keep for backward compatibility or fallback
            source_ids: finalSourceIds,
            tipo: tipo,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection("mindmaps").add(mindmapData);
        const savedDoc = await docRef.get();

        console.log(`✅ MindMap saved: ${docRef.id}`);

        // 7. Log Token Usage
        await logTokenUsage(
            userId,
            project_id || sources[0].project_id,
            "mindmap",
            result.usage.inputTokens,
            result.usage.outputTokens,
            modelName, // Log the actual model used
            { source_count: finalSourceIds.length, tipo }
        );

        return { success: true, mindmap: { id: docRef.id, ...savedDoc.data() } };

    } catch (error: any) {
        console.error("❌ Error generating mind map:", error);
        throw new HttpsError("internal", error.message || "Failed to generate mind map");
    }
});
