import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { callGeminiWithUsage, parseJsonFromResponse } from "./shared/gemini";
import { estimateTokens, calculateSafeOutputTokens } from "./shared/output_limits";
import { sanitizeString as sanitizeStringUtil } from "./shared/sanitization";
import { validateRequest, generateMindmapSchema } from "./shared/validation";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";

const db = admin.firestore();



export const generate_mindmap = onCall({
    timeoutSeconds: 300,
    memory: "1GiB",
    region: "us-central1",
    cors: true,
}, async (request) => {
    try {
        if (!request.auth) {
            throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
        }

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
            throw new functions.https.HttpsError("not-found", "No sources found");
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
            throw new functions.https.HttpsError("failed-precondition", "No content available to generate mind map");
        }

        // 2. Token Calculation
        const inputTokens = estimateTokens(combinedContent);
        const safeOutputTokens = calculateSafeOutputTokens(combinedContent, 60000);

        console.log(`🗺️ [MindMap] Input: ~${inputTokens} tokens, Safe output: ${safeOutputTokens} tokens`);

        // 3. The Improved Prompt with Standard Markdown Rules
        const prompt = `Você é um especialista em didática médica. Crie um MAPA MENTAL completo e detalhado com base no conteúdo fornecido.

CONTEÚDO:
${combinedContent}

INSTRUÇÕES TÉCNICAS (CRÍTICO - SIGA EXATAMENTE):
 
 1. **FORMATO JSON OBRIGATÓRIO**: 
    - Sua resposta DEVE ser APENAS um objeto JSON válido
    - Campos obrigatórios: "titulo" (string) e "markdown" (string)
    - Nada antes ou depois do JSON (NÃO use \`\`\`json)

2. **ESTRUTURA MARKDOWN (Markmap)**:
   - Use a sintaxe padrão de Markdown para listas hierárquicas.
   - O nó raiz deve ser um título H1 (# Título).
   - Os ramos principais devem ser títulos H2 (## Ramo).
   - Os sub-ramos podem ser H3 (###) ou listas com hifens (-).
   - Use **negrito** para ênfase.
   - Use *itálico* para detalhes secundários.

3. **HIERARQUIA E PROFUNDIDADE**:
   - Crie uma estrutura profunda (pelo menos 3-4 níveis).
   - Use listas aninhadas para detalhar conceitos.
   - Exemplo:
     # Insuficiência Cardíaca
     ## Fisiopatologia
     - Disfunção Sistólica
       - Fração de Ejeção < 40%
     - Disfunção Diastólica
     ## Sintomas
     - Congestivos
       - Dispneia
       - Edema

4. **CARACTERES PERMITIDOS**:
   - Use UTF-8 completo (acentos permitidos).
   - Pode usar emojis para ilustrar tópicos principais.

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
                safeOutputTokens,
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
                    safeOutputTokens,
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
            throw new functions.https.HttpsError("internal", "Invalid response format from AI");
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
        throw new functions.https.HttpsError("internal", error.message || "Failed to generate mind map");
    }
});
