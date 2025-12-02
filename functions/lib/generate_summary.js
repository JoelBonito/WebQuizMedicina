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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generate_summary = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
const gemini_1 = require("./shared/gemini");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const generateSummarySchema = zod_1.z.object({
    source_ids: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    project_id: zod_1.z.string().min(1),
});
exports.generate_summary = functions.runWith({
    timeoutSeconds: 540,
    memory: "1GB",
}).https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        // 2. Validation
        const { source_ids, project_id } = (0, validation_1.validateRequest)(data, generateSummarySchema);
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
                combinedContent += `\n\n=== ${(0, validation_1.sanitizeString)(source.name)} ===\n${(0, validation_1.sanitizeString)(source.extracted_content)}`;
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
Você é um professor médico SÊNIOR e MENTOR ACADÊMICO de elite.
Sua tarefa é criar o "RESUMO DEFINITIVO" (Master Summary) a partir do material fornecido.

🚨 INSTRUÇÃO CRÍTICA DE ABRANGÊNCIA:
O usuário relatou que resumos anteriores ignoraram quase metade do conteúdo. ISSO É INACEITÁVEL.
Você deve agir como um auditor rigoroso:
1. Primeiro, LEIA TODO O CONTEÚDO fornecido.
2. Liste mentalmente TODOS os tópicos, subtópicos e conceitos apresentados em TODAS as fontes.
3. Se o material tem 10 tópicos, seu resumo DEVE ter 10 seções principais. Não agrupe excessivamente a ponto de perder detalhes.
4. Identifique a origem de cada tópico (ex: "Do material sobre Cardiologia...").

CONTEÚDO BASE:
${combinedContent}

---

ESTRUTURA OBRIGATÓRIA DO RESUMO (HTML):

<div class="master-summary">
  <div class="summary-header">
    <h1>📚 Resumo Mestre Completo</h1>
    <p class="subtitle">Análise profunda e exaustiva de todo o material de estudo</p>
  </div>

  <!-- INTRODUÇÃO GERAL -->
  <section class="intro-section">
    <h2>Visão Geral</h2>
    <p>[Parágrafo introdutório integrando os temas abordados nas fontes]</p>
  </section>

  <!-- PARA CADA TÓPICO ENCONTRADO (SEM EXCEÇÃO) -->
  <!-- Crie uma section separada para cada grande tema identificado -->
  <section class="topic-section">
    <div class="topic-header">
      <h2>[Nome do Tópico Principal]</h2>
      <span class="topic-source">Fonte: [Nome do arquivo ou contexto]</span>
    </div>

    <div class="deep-dive">
      <h3>🔍 Análise Aprofundada</h3>
      <p>[Explicação detalhada, nível acadêmico/profissional. Mínimo 3 parágrafos robustos.]</p>
      <p>[Não seja superficial. Explique fisiopatologia, mecanismos, "porquês" e nuances.]</p>
      <p>[Use termos técnicos corretos, mas explique-os de forma didática.]</p>
    </div>

    <!-- Se houver classificações, critérios ou listas no texto original, inclua aqui -->
    <div class="structured-content">
       <h3>📋 Classificações e Critérios</h3>
       <ul>
         <li><strong>[Item]:</strong> [Descrição detalhada]</li>
       </ul>
    </div>

    <div class="analogy">
      <h3>💡 Analogia ou Exemplo Prático</h3>
      <p>[Uma analogia didática ou caso clínico curto para ilustrar o conceito]</p>
    </div>

    <div class="clinical-pearls">
      <h3>💎 Pérolas Clínicas & Prática</h3>
      <ul>
        <li><strong>[Sinal/Sintoma]:</strong> [O que buscar no exame físico]</li>
        <li><strong>[Alerta]:</strong> [Red flags ou erros comuns]</li>
        <li><strong>[Conduta]:</strong> [Pontos chave sobre manejo/diagnóstico citados no texto]</li>
      </ul>
    </div>
  </section>

  <!-- CONCLUSÃO -->
  <section class="conclusion-section">
    <h2>🚀 Síntese Final</h2>
    <p>[Conclusão integradora]</p>
  </section>
</div>

REGRAS DE OURO:
1. **TOLERÂNCIA ZERO PARA OMISSÕES:** Se está no texto, deve estar no resumo. Varra o texto do início ao fim.
2. **PROFUNDIDADE:** Explicações de 1 parágrafo são proibidas para tópicos principais. Desenvolva o raciocínio.
3. **FIDELIDADE:** Mantenha a terminologia técnica correta.
4. **FORMATO:** HTML limpo, use as classes CSS indicadas.
5. **IDIOMA:** Português do Brasil.

Gere o HTML agora.
    `;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        // SWITCH BACK TO GENERAL MODEL (FLASH)
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for summary generation`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 16384, false);
        }
        catch (error) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 8192, false);
            }
            else {
                throw error;
            }
        }
        // 5. Save Summary
        const summaryData = {
            project_id,
            user_id: context.auth.uid,
            titulo: `Resumo Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
            conteudo_html: result.text,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            type: 'general',
            source_ids: source_ids // Save the source IDs
        };
        const docRef = await db.collection("summaries").add(summaryData);
        const savedDoc = await docRef.get();
        // 6. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(context.auth.uid, project_id, "generate_summary", result.usage.inputTokens, result.usage.outputTokens, modelName);
        return { success: true, summary: Object.assign({ id: docRef.id }, savedDoc.data()) };
    }
    catch (error) {
        console.error("Error generating summary:", error);
        throw new functions.https.HttpsError("internal", error.message || "Failed to generate summary");
    }
});
//# sourceMappingURL=generate_summary.js.map