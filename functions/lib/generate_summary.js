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
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const validation_1 = require("./shared/validation");
const gemini_1 = require("./shared/gemini");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const language_helper_1 = require("./shared/language_helper");
/**
 * Generate the summary title based on the user's language preference
 */
function getSummaryTitle(language) {
    const date = new Date();
    const titles = {
        "pt": `Resumo Gerado em ${date.toLocaleDateString('pt-BR')}`,
        "pt-PT": `Resumo Gerado em ${date.toLocaleDateString('pt-PT')}`,
        "en": `Summary Generated on ${date.toLocaleDateString('en-US')}`,
        "es": `Resumen Generado el ${date.toLocaleDateString('es-ES')}`,
        "fr": `Résumé Généré le ${date.toLocaleDateString('fr-FR')}`,
        "de": `Zusammenfassung erstellt am ${date.toLocaleDateString('de-DE')}`,
        "it": `Riepilogo Generato il ${date.toLocaleDateString('it-IT')}`,
        "ja": `${date.toLocaleDateString('ja-JP')}に生成された要約`,
        "zh": `生成于 ${date.toLocaleDateString('zh-CN')} 的摘要`,
        "ru": `Резюме создано ${date.toLocaleDateString('ru-RU')}`,
        "ar": `ملخص تم إنشاؤه في ${date.toLocaleDateString('ar-SA')}`
    };
    return titles[language] || titles["en"]; // Default to English
}
const generateSummarySchema = zod_1.z.object({
    source_ids: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    project_id: zod_1.z.string().min(1),
});
exports.generate_summary = (0, https_1.onCall)({
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    try {
        // 2. Get user's language preference
        const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, request.auth.uid);
        // 3. Validation
        const { source_ids, project_id } = (0, validation_1.validateRequest)(request.data, generateSummarySchema);
        // 3. Fetch Content (Sources)
        let combinedContent = "";
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
            .get();
        if (sourcesSnapshot.empty) {
            throw new https_1.HttpsError("not-found", "Sources not found");
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
            throw new https_1.HttpsError("failed-precondition", "No content available for generation");
        }
        // 4. Generate Summary
        // 4. Generate Summary
        const prompt = `
${(0, language_helper_1.getLanguageInstruction)(language)}

You are an elite SENIOR MEDICAL PROFESSOR and ACADEMIC MENTOR.
Your task is to create the "MASTER SUMMARY" (Definitive Summary) from the provided material.

🚨 CRITICAL COMPREHENSIVENESS INSTRUCTION:
Users reported that previous summaries ignored almost half the content. THIS IS UNACCEPTABLE.
You must act as a rigorous auditor:
1. First, READ ALL PROVIDED CONTENT.
2. List mentally ALL topics, subtopics, and concepts presented in ALL sources.
3. If the material has 10 topics, your summary MUST have 10 main sections. Do not group excessively to the point of losing details.
4. Identify the origin of each topic (e.g., "From the Cardiology material...").

BASE CONTENT:
${combinedContent}

---

MANDATORY SUMMARY STRUCTURE (HTML):
Return ONLY valid HTML inside a div.

<div class="master-summary">
  <div class="summary-header">
    <h1>📚 ${language === 'pt' ? 'Resumo Mestre Completo' : (language === 'fr' ? 'Résumé Maître Complet' : 'Master Summary')}</h1>
    <p class="subtitle">${language === 'pt' ? 'Análise profunda e exaustiva' : (language === 'fr' ? 'Analyse approfondie et exhaustive' : 'Deep and exhaustive analysis')}</p>
  </div>

  <!-- GENERAL INTRO -->
  <section class="intro-section">
    <h2>Overview</h2>
    <p>[Introductory paragraph integrating themes covered in sources]</p>
  </section>

  <!-- FOR EACH TOPIC FOUND (NO EXCEPTION) -->
  <section class="topic-section">
    <div class="topic-header">
      <h2>[Main Topic Name]</h2>
      <span class="topic-source">Source: [File name or context]</span>
    </div>

    <div class="deep-dive">
      <h3>🔍 Deep Analysis</h3>
      <p>[Detailed explanation, academic/professional level. At least 3 robust paragraphs.]</p>
      <p>[Do not be superficial. Explain pathophysiology, mechanisms, "whys" and nuances.]</p>
      <p>[Use correct technical terms, but explain them didactically.]</p>
    </div>

    <!-- If there are classifications, criteria or lists in the original text, include here -->
    <div class="structured-content">
       <h3>📋 Classifications & Criteria</h3>
       <ul>
         <li><strong>[Item]:</strong> [Detailed description]</li>
       </ul>
    </div>

    <div class="analogy">
       <h3>💡 Analogy or Practical Example</h3>
       <p>[A didactic analogy or short clinical case to illustrate the concept]</p>
    </div>

    <div class="clinical-pearls">
      <h3>💎 Clinical Pearls & Practice</h3>
      <ul>
        <li><strong>[Sign/Symptom]:</strong> [What to look for in physical exam]</li>
        <li><strong>[Alert]:</strong> [Red flags or common mistakes]</li>
        <li><strong>[Conduct]:</strong> [Key points on management/diagnosis cited in text]</li>
      </ul>
    </div>
  </section>

  <!-- CONCLUSION -->
  <section class="conclusion-section">
    <h2>🚀 Final Synthesis</h2>
    <p>[Integrating conclusion]</p>
  </section>
</div>

GOLDEN RULES:
1. **ZERO TOLERANCE FOR OMISSIONS:** If it's in the text, it must be in the summary. Scan text from start to finish.
2. ${(0, language_helper_1.getLanguageInstruction)(language)}
2. **PROFUNDIDADE:** Explicações de 1 parágrafo são proibidas para tópicos principais. Desenvolva o raciocínio.
3. **FIDELIDADE:** Mantenha a terminologia técnica correta.
4. **FORMATO:** HTML limpo, use as classes CSS indicadas.
5. ${(0, language_helper_1.getLanguageInstruction)(language)}

Gere o HTML agora.
    `;
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        // SWITCH BACK TO GENERAL MODEL (FLASH)
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for summary generation`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 32768, false);
        }
        catch (error) {
            // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
            if (error.status === 404 || error.message.includes('not found')) {
                console.warn('⚠️ Primary model failed, trying fallback...');
                const fallbackModel = 'gemini-flash-latest'; // Safe fallback
                console.log(`🤖 Using fallback model: ${fallbackModel}`);
                result = await (0, gemini_1.callGeminiWithUsage)(prompt, fallbackModel, 32768, false);
            }
            else {
                throw error;
            }
        }
        // 5. Save Summary
        const summaryData = {
            project_id,
            user_id: request.auth.uid,
            titulo: getSummaryTitle(language),
            conteudo_html: result.text,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            type: 'general',
            source_ids: source_ids // Save the source IDs
        };
        const docRef = await db.collection("summaries").add(summaryData);
        const savedDoc = await docRef.get();
        // 6. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(request.auth.uid, project_id, "generate_summary", result.usage.inputTokens, result.usage.outputTokens, modelName);
        return { success: true, summary: Object.assign({ id: docRef.id }, savedDoc.data()) };
    }
    catch (error) {
        console.error("Error generating summary:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to generate summary");
    }
});
//# sourceMappingURL=generate_summary.js.map