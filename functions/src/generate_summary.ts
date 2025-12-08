import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { validateRequest, sanitizeString } from "./shared/validation";
import { callGeminiWithUsage } from "./shared/gemini";
import { logTokenUsage } from "./shared/token_usage";
import { getModelSelector } from "./shared/modelSelector";
import { getLanguageFromRequest, getLanguageInstruction } from "./shared/language_helper";

/**
 * Generate the summary title based on the user's language preference
 */
function getSummaryTitle(language: string): string {
  const date = new Date();
  const titles: Record<string, string> = {
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


const generateSummarySchema = z.object({
  source_ids: z.array(z.string().min(1)).min(1),
  project_id: z.string().min(1),
});

export const generate_summary = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
  region: "us-central1"
}, async (request) => {
  const db = admin.firestore();
  // 1. Auth Check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  try {
    // 2. Get user's language preference
    const language = await getLanguageFromRequest(request.data, db, request.auth.uid);

    // 3. Validation
    const { source_ids, project_id } = validateRequest(request.data, generateSummarySchema);

    // 3. Fetch Content (Sources)
    let combinedContent = "";
    const sourcesSnapshot = await db.collection("sources")
      .where("project_id", "==", project_id)
      .where(admin.firestore.FieldPath.documentId(), "in", source_ids)
      .get();

    if (sourcesSnapshot.empty) {
      throw new HttpsError("not-found", "Sources not found");
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
      throw new HttpsError("failed-precondition", "No content available for generation");
    }

    // 4. Generate Summary
    // Helper function to get translated section titles
    const getSectionTitles = (lang: string) => {
      const titles: Record<string, any> = {
        pt: {
          masterSummary: 'Resumo Mestre Completo',
          subtitle: 'Análise profunda e exaustiva',
          overview: 'Visão Geral',
          deepAnalysis: 'Análise Profunda',
          classifications: 'Classificações e Critérios',
          analogy: 'Analogia ou Exemplo Prático',
          clinicalPearls: 'Pérolas Clínicas e Prática',
          conclusion: 'Síntese Final',
          signSymptom: 'Sinal/Sintoma',
          alert: 'Alerta',
          conduct: 'Conduta'
        },
        en: {
          masterSummary: 'Master Summary',
          subtitle: 'Deep and exhaustive analysis',
          overview: 'Overview',
          deepAnalysis: 'Deep Analysis',
          classifications: 'Classifications & Criteria',
          analogy: 'Analogy or Practical Example',
          clinicalPearls: 'Clinical Pearls & Practice',
          conclusion: 'Final Synthesis',
          signSymptom: 'Sign/Symptom',
          alert: 'Alert',
          conduct: 'Conduct'
        },
        fr: {
          masterSummary: 'Résumé Maître Complet',
          subtitle: 'Analyse approfondie et exhaustive',
          overview: 'Vue d\'ensemble',
          deepAnalysis: 'Analyse Approfondie',
          classifications: 'Classifications et Critères',
          analogy: 'Analogie ou Exemple Pratique',
          clinicalPearls: 'Perles Cliniques et Pratique',
          conclusion: 'Synthèse Finale',
          signSymptom: 'Signe/Symptôme',
          alert: 'Alerte',
          conduct: 'Conduite'
        },
        es: {
          masterSummary: 'Resumen Maestro Completo',
          subtitle: 'Análisis profundo y exhaustivo',
          overview: 'Resumen General',
          deepAnalysis: 'Análisis Profundo',
          classifications: 'Clasificaciones y Criterios',
          analogy: 'Analogía o Ejemplo Práctico',
          clinicalPearls: 'Perlas Clínicas y Práctica',
          conclusion: 'Síntesis Final',
          signSymptom: 'Signo/Síntoma',
          alert: 'Alerta',
          conduct: 'Conducta'
        }
      };
      return titles[lang] || titles['en'];
    };

    const sectionTitles = getSectionTitles(language);

    const prompt = `
${getLanguageInstruction(language)}

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
    <h1>📚 ${sectionTitles.masterSummary}</h1>
    <p class="subtitle">${sectionTitles.subtitle}</p>
  </div>

  <!-- GENERAL INTRO -->
  <section class="intro-section">
    <h2>${sectionTitles.overview}</h2>
    <p>[Introductory paragraph integrating themes covered in sources]</p>
  </section>

  <!-- FOR EACH TOPIC FOUND (NO EXCEPTION) -->
  <section class="topic-section">
    <div class="topic-header">
      <h2>[Main Topic Name]</h2>
      <span class="topic-source">Source: [File name or context]</span>
    </div>

    <div class="deep-dive">
      <h3>🔍 ${sectionTitles.deepAnalysis}</h3>
      <p>[Detailed explanation, academic/professional level. At least 3 robust paragraphs.]</p>
      <p>[Do not be superficial. Explain pathophysiology, mechanisms, "whys" and nuances.]</p>
      <p>[Use correct technical terms, but explain them didactically.]</p>
    </div>

    <!-- If there are classifications, criteria or lists in the original text, include here -->
    <div class="structured-content">
       <h3>📋 ${sectionTitles.classifications}</h3>
       <ul>
         <li><strong>[Item]:</strong> [Detailed description]</li>
       </ul>
    </div>

    <div class="analogy">
       <h3>💡 ${sectionTitles.analogy}</h3>
       <p>[A didactic analogy or short clinical case to illustrate the concept]</p>
    </div>

    <div class="clinical-pearls">
      <h3>💎 ${sectionTitles.clinicalPearls}</h3>
      <ul>
        <li><strong>${sectionTitles.signSymptom}:</strong> [What to look for in physical exam]</li>
        <li><strong>${sectionTitles.alert}:</strong> [Red flags or common mistakes]</li>
        <li><strong>${sectionTitles.conduct}:</strong> [Key points on management/diagnosis cited in text]</li>
      </ul>
    </div>
  </section>

  <!-- CONCLUSION -->
  <section class="conclusion-section">
    <h2>🚀 ${sectionTitles.conclusion}</h2>
    <p>[Integrating conclusion]</p>
  </section>
</div>

GOLDEN RULES:
1. **ZERO TOLERANCE FOR OMISSIONS:** If it's in the text, it must be in the summary. Scan text from start to finish.
2. ${getLanguageInstruction(language)}
3. **PROFUNDIDADE:** Explicações de 1 parágrafo são proibidas para tópicos principais. Desenvolva o raciocínio.
4. **FIDELIDADE:** Mantenha a terminologia técnica correta.
5. **FORMATO:** HTML limpo, use as classes CSS indicadas.
6. ${getLanguageInstruction(language)}

Gere o HTML agora.
    `;

    // ✅ Seleção automática e inteligente
    const selector = getModelSelector();
    // SWITCH BACK TO GENERAL MODEL (FLASH)
    const modelName = await selector.selectBestModel('general');
    console.log(`🤖 Using model: ${modelName} for summary generation`);

    let result;
    try {
      result = await callGeminiWithUsage(prompt, modelName, 32768, false);
    } catch (error: any) {
      // 🔄 FALLBACK AUTOMÁTICO se o modelo falhar
      if (error.status === 404 || error.message.includes('not found')) {
        console.warn('⚠️ Primary model failed, trying fallback...');
        const fallbackModel = 'gemini-flash-latest'; // Safe fallback
        console.log(`🤖 Using fallback model: ${fallbackModel}`);
        result = await callGeminiWithUsage(prompt, fallbackModel, 32768, false);
      } else {
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
      type: 'general', // Added type for consistency
      source_ids: source_ids // Save the source IDs
    };

    const docRef = await db.collection("summaries").add(summaryData);
    const savedDoc = await docRef.get();

    // 6. Log Token Usage
    await logTokenUsage(
      request.auth.uid,
      project_id,
      "generate_summary",
      result.usage.inputTokens,
      result.usage.outputTokens,
      modelName
    );

    return { success: true, summary: { id: docRef.id, ...savedDoc.data() } };

  } catch (error: any) {
    console.error("Error generating summary:", error);
    throw new HttpsError("internal", error.message || "Failed to generate summary");
  }
});
