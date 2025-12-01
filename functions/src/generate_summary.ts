import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { z } from "zod";
import { validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const generateSummarySchema = z.object({
    source_ids: z.array(z.string().min(1)).min(1),
    project_id: z.string().min(1),
});

export const generate_summary = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
        // 2. Validation
        const { source_ids, project_id } = validateRequest(data, generateSummarySchema);

        // 3. Fetch Content (Sources)
        let combinedContent = "";
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
            .get();

        if (sourcesSnapshot.empty) {
            throw new functions.https.HttpsError("not-found", "Sources not found");
        }

        sourcesSnapshot.forEach(doc => {
            const source = doc.data();
            if (source.extracted_content) {
                combinedContent += `\n\n=== ${sanitizeString(source.name)} ===\n${sanitizeString(source.extracted_content)}`;
            }
        });

        const MAX_CONTENT_LENGTH = 2000000;
        if (combinedContent.length > MAX_CONTENT_LENGTH) {
            combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
        }

        if (!combinedContent.trim()) {
            throw new functions.https.HttpsError("failed-precondition", "No content available for generation");
        }

        // 4. Generate Summary
        const prompt = `
Você é um professor médico EXPERIENTE e DIDÁTICO criando um "Resumo Mestre" completo do material fornecido.

SEU OBJETIVO: Criar um resumo ABRANGENTE e DETALHADO que sirva como fonte única de estudo para o aluno. Não faça resumos superficiais.

CONTEÚDO BASE:
${combinedContent}

---

ESTRUTURA DO RESUMO (HTML):

<div class="master-summary">
  <div class="summary-header">
    <h1>📚 Resumo Mestre Completo</h1>
    <p class="subtitle">Síntese detalhada de todo o material de estudo</p>
  </div>

  <!-- INTRODUÇÃO GERAL -->
  <section class="intro-section">
    <h2>Visão Geral</h2>
    <p>[Parágrafo introdutório contextualizando o tema geral do material]</p>
  </section>

  <!-- PARA CADA TÓPICO PRINCIPAL IDENTIFICADO NO CONTEÚDO -->
  <!-- Você deve identificar os grandes temas e criar uma seção completa para CADA UM -->
  <section class="main-topic">
    <div class="topic-header">
      <h2>[Nome do Tópico Principal]</h2>
    </div>

    <div class="explanation">
      <h3>🔍 Explicação Detalhada</h3>
      <p>[Explicação aprofundada do conceito. Não seja raso. Use 2-3 parágrafos se necessário.]</p>
      <p>[Desenvolva o raciocínio, explique o "porquê" e o "como".]</p>
    </div>

    <div class="analogy">
      <h3>💡 Analogia ou Exemplo Prático</h3>
      <p>[Uma analogia didática ou exemplo do cotidiano para tornar o conceito memorável]</p>
    </div>

    <div class="key-points">
      <h3>📌 Pontos-Chave para Memorizar</h3>
      <ul>
        <li><strong>[Conceito Chave]:</strong> [Explicação]</li>
        <li><strong>[Critério/Valor]:</strong> [Explicação]</li>
        <li>... (Liste todos os pontos cruciais deste tópico)</li>
      </ul>
    </div>

    <div class="clinical-application">
      <h3>🏥 Aplicação Clínica / Relevância</h3>
      <p>[Como isso se aplica na prática médica? Por que é importante saber isso?]</p>
    </div>
  </section>

  <!-- CONCLUSÃO -->
  <section class="conclusion-section">
    <h2>🚀 Conclusão e Próximos Passos</h2>
    <p>[Síntese final integrando os tópicos]</p>
  </section>
</div>

---

REGRAS CRÍTICAS DE QUALIDADE:

1.  **PROFUNDIDADE:** Não faça apenas tópicos soltos. Escreva parágrafos explicativos completos. O aluno precisa LER e ENTENDER, não apenas ver uma lista de palavras.
2.  **ABRANGÊNCIA:** Cubra TODO o conteúdo fornecido. Se houver 5 temas diferentes nos textos base, crie 5 seções completas de "main-topic".
3.  **DIDÁTICA:** Use linguagem clara, mas tecnicamente precisa. Explique termos complexos.
4.  **FORMATO:**
    *   Use tags HTML semânticas conforme o modelo acima.
    *   Use classes CSS (explanation, analogy, key-points, clinical-application) para manter a estrutura.
    *   Use **negrito** para destacar termos importantes.
5.  **IDIOMA:** Português do Brasil.

SAÍDA: Apenas o código HTML do corpo do resumo.
    `;

        // ✅ Seleção automática e inteligente
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for summary generation`);

        let result;
        try {
            result = await callGeminiWithUsage(prompt, modelName, 16384, false);
        } catch (error: any) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await callGeminiWithUsage(prompt, fallbackModel, 8192, false);
            } else {
                throw error;
            }
        }

        // 5. Save Summary
        const summaryData = {
            project_id,
            titulo: `Resumo Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
            conteudo_html: result.text,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            type: 'general' // Added type for consistency
        };

        const docRef = await db.collection("summaries").add(summaryData);
        const savedDoc = await docRef.get();

        // 6. Log Token Usage
        await logTokenUsage(
            context.auth.uid,
            project_id,
            "generate_summary",
            result.usage.inputTokens,
            result.usage.outputTokens,
            modelName
        );

        return { success: true, summary: { id: docRef.id, ...savedDoc.data() } };

    } catch (error: any) {
        console.error("Error generating summary:", error);
        throw new functions.https.HttpsError("internal", error.message || "Failed to generate summary");
    }
});
