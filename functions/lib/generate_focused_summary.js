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
exports.generate_focused_summary = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const gemini_1 = require("./shared/gemini");
const sanitization_1 = require("./shared/sanitization");
const validation_1 = require("./shared/validation");
const token_usage_1 = require("./shared/token_usage");
const modelSelector_1 = require("./shared/modelSelector");
const language_helper_1 = require("./shared/language_helper");
/**
 * Generate the focused summary title based on the user's language preference
 */
function getFocusedSummaryTitle(language) {
    const titles = {
        "pt": "🎯 Resumo Focado nas Suas Dificuldades",
        "pt-PT": "🎯 Resumo Focado nas Suas Dificuldades",
        "en": "🎯 Focused Summary on Your Difficulties",
        "es": "🎯 Resumen Enfocado en Tus Dificultades",
        "fr": "🎯 Résumé Ciblé sur Vos Difficultés",
        "de": "🎯 Fokussierte Zusammenfassung Ihrer Schwierigkeiten",
        "it": "🎯 Riepilogo Mirato sulle Tue Difficoltà",
        "ja": "🎯 あなたの難点に焦点を当てた要約",
        "zh": "🎯 针对您难点的重点总结",
        "ru": "🎯 Сводка по Вашим Сложностям",
        "ar": "🎯 ملخص مركز على صعوباتك"
    };
    return titles[language] || titles["en"]; // Default to English
}
exports.generate_focused_summary = (0, https_1.onCall)({
    timeoutSeconds: 120,
    memory: "1GiB",
    region: "us-central1",
}, async (request) => {
    var _a;
    const db = admin.firestore();
    try {
        if (!request.auth) {
            throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
        }
        const { project_id } = (0, validation_1.validateRequest)(request.data, validation_1.generateFocusedSummarySchema);
        const userId = request.auth.uid;
        // Get user's language preference
        const language = await (0, language_helper_1.getLanguageFromRequest)(request.data, db, userId);
        // 1. Verify project ownership and get name
        const projectDoc = await db.collection("projects").doc(project_id).get();
        if (!projectDoc.exists || ((_a = projectDoc.data()) === null || _a === void 0 ? void 0 : _a.user_id) !== userId) {
            throw new https_1.HttpsError("not-found", "Project not found or unauthorized");
        }
        const project = projectDoc.data();
        // 2. Get user's difficulties (not resolved, ordered by level)
        const difficultiesSnapshot = await db.collection("difficulties")
            .where("user_id", "==", userId)
            .where("project_id", "==", project_id)
            .where("resolvido", "==", false)
            .orderBy("nivel", "desc")
            .limit(10)
            .get();
        const difficulties = difficultiesSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        if (difficulties.length === 0) {
            throw new https_1.HttpsError("failed-precondition", "No difficulties found. Study with quiz and flashcards first to identify your weak points.");
        }
        // 3. Get all sources for this project
        const sourcesSnapshot = await db.collection("sources")
            .where("project_id", "==", project_id)
            .where("status", "==", "ready")
            .get();
        const sources = sourcesSnapshot.docs
            .map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .filter((s) => s.extracted_content); // Ensure content exists
        if (sources.length === 0) {
            throw new https_1.HttpsError("failed-precondition", "No sources available. Please upload and process sources first.");
        }
        // 4. Build difficulty list for context
        const difficultiesList = difficulties
            .map((d, index) => {
            const stars = '⚠️'.repeat(Math.min(d.nivel, 5));
            const sanitizedTopic = (0, sanitization_1.cleanString)(d.topico || 'Unknown');
            const sanitizedType = (0, sanitization_1.cleanString)(d.tipo_origem || 'unknown');
            return `${index + 1}. ${sanitizedTopic} ${stars} (nível ${d.nivel}) - origem: ${sanitizedType}`;
        })
            .join('\n');
        const topTopics = difficulties.slice(0, 5).map((d) => (0, sanitization_1.cleanString)(d.topico));
        // 5. Build Context
        console.log('📚 [FULL-SOURCES] Using complete sources for maximum quality');
        const combinedContext = sources
            .map((source) => {
            const sanitizedName = (0, sanitization_1.cleanString)(source.name || 'Unknown');
            const sanitizedContent = (0, sanitization_1.cleanString)(source.extracted_content || '');
            return `[Fonte: ${sanitizedName}]\n${sanitizedContent}`;
        })
            .join('\n\n---\n\n');
        console.log(`📊 [FULL-SOURCES] ${sources.length} sources, ~${Math.ceil(combinedContext.length / 4)} tokens`);
        // 6. Construct Prompt (English base + dynamic language instruction)
        const prompt = `${(0, language_helper_1.getLanguageInstruction)(language)}

You are an EXPERIENCED and DIDACTIC medical professor creating personalized study material.

YOUR GOAL: Create summaries that REALLY help students who did NOT understand the topic the first time.

STUDENT PROFILE:
- Studying: "${(0, sanitization_1.cleanString)((project === null || project === void 0 ? void 0 : project.name) || '')}"
- Identified ${difficulties.length} difficulties during quiz/flashcard studies
- Needs SIMPLE explanations, not overly technical
- Learns better with analogies, practical examples, and connections
- Is looking to UNDERSTAND, not memorize

COMPLETE STUDY MATERIAL:
${combinedContext}

🎯 IDENTIFIED DIFFICULTIES (ordered by priority):
${difficultiesList}

---

TASK: Create a didactic summary FOCUSED EXCLUSIVELY on the difficulty topics above.

For EACH difficulty topic, you MUST include the 5 sections below:

📖 SECTION 1 - Simple and Clear Explanation
Goal: Help the student UNDERSTAND, not memorize
- Language level: As you would explain to a learning colleague
- Avoid technical jargon without explanation
- Use short, direct sentences
- Start with "Simply put..." or "Basically..." or "What happens is..."
- Give context: WHY does this matter? WHEN does it happen?
- 2-3 short paragraphs

💡 SECTION 2 - Analogy or Practical Example
Goal: Make the concept MEMORABLE and VISUAL
- Compare with everyday situations
- Use metaphors that create mental images
- Practical clinical example when applicable
- Suggested format: "Think of it like..." or "It's like when..." or "Imagine that..."
- Be creative but accurate
- 1-2 paragraphs

📌 SECTION 3 - Key Points to Memorize
Goal: Provide "hooks" for retention
- 3-5 essential bullet points
- Each point: MAXIMUM 1 line
- Use bold for keywords
- Include numbers, values, specific criteria
- If possible, create mnemonic or catchy phrase
- Format: <li><strong>[Concept]:</strong> [Short explanation]</li>

🏥 SECTION 4 - Clinical Application (if applicable)
Goal: Show WHEN and HOW to use in practice
- In what situations do you need to remember this?
- What is the practical importance of this knowledge?
- Examples of real cases or exam questions
- How to avoid common mistakes?
- Why does this appear on exams/board certifications?
- 1-2 paragraphs

🔗 SECTION 5 - Connections with Other Concepts
Goal: Integrate knowledge, not isolate it
- How does this topic connect with other subjects?
- Cause-effect relationships
- Big picture: where does this fit?
- What to study next to consolidate?
- Use bullet point list for clarity

---

HTML FORMAT - Semantic Structure:

GENERAL STRUCTURE:
<div class="focused-summary">
  <div class="summary-header">
    <h1>🎯 Focused Summary on Your Difficulties</h1>
    <p class="subtitle">Personalized material for ${(0, sanitization_1.cleanString)((project === null || project === void 0 ? void 0 : project.name) || '')}</p>
    <p class="meta">Based on ${difficulties.length} topics identified during your studies</p>
  </div>

  <!-- Repeat section below for EACH difficulty topic -->
  <section class="difficulty-topic" data-nivel="[level]">
    ...
  </section>
</div>

STRUCTURE FOR EACH TOPIC:
<section class="difficulty-topic" data-nivel="[level]">
  <div class="topic-header">
    <h2>[number]. [Topic Name] [⚠️ symbols corresponding to level]</h2>
    <span class="origin-badge">[origin: quiz/flashcard/chat]</span>
  </div>

  <div class="explanation">
    <h3>🔍 Simple Explanation</h3>
    <p>[First paragraph: basic concept]</p>
    <p>[Second paragraph: why it matters]</p>
  </div>

  <div class="analogy">
    <h3>💡 Analogy/Practical Example</h3>
    <p>[Concrete and memorable analogy]</p>
  </div>

  <div class="key-points">
    <h3>📌 Key Points</h3>
    <ul>
      <li><strong>Concept 1:</strong> Short explanation</li>
      <li><strong>Concept 2:</strong> Short explanation</li>
      <li><strong>Concept 3:</strong> Short explanation</li>
      <li>💡 <strong>Tip:</strong> Mnemonic or catchy phrase (if applicable)</li>
    </ul>
  </div>

  <div class="clinical-application">
    <h3>🏥 Clinical Application</h3>
    <p>[When/how this matters in medical practice]</p>
  </div>

  <div class="connections">
    <h3>🔗 Connections with Other Concepts</h3>
    <ul>
      <li><strong>[Related topic 1]:</strong> How it connects</li>
      <li><strong>[Related topic 2]:</strong> How it connects</li>
    </ul>
  </div>
</section>

---

CRITICAL INSTRUCTIONS - READ CAREFULLY:

✅ HTML QUALITY:
- VALID and well-structured HTML
- Close all tags correctly
- Use descriptive CSS classes (explanation, analogy, key-points, clinical-application, connections)
- Well-indented and organized structure
- Do not use inline style attributes

✅ PRIORITIZATION:
- Topics with MORE ⚠️ (higher level) should come FIRST
- Dedicate more details and examples to the most difficult topics
- If topics are related, mention the connections

✅ TONE AND LANGUAGE:
- ENCOURAGING and POSITIVE tone
- "You can understand this!" not "This is complicated"
- ACCESSIBLE language, not too technical
- Explain medical terms when using them
- Use bold <strong> for emphasis
- Emojis only in section titles (🔍💡📌🏥🔗)

✅ FOCUS:
- COMPREHENSION > mechanical memorization
- WHY and WHEN > rote facts
- PRACTICAL APPLICATION > abstract theory
- CONNECTIONS > isolated topics

❌ DO NOT:
- Don't use medical jargon without explaining
- Don't assume the student already knows basic concepts
- Don't be vague or generic ("this is important", "study well")
- Don't ignore any topic from the difficulties list
- Don't copy text from material without adapting to didactic language
- Don't create empty sections

---

NOW IT'S YOUR TURN:

Create the focused summary following EXACTLY the format above for ALL ${difficulties.length} difficulty topics listed.

Respond ONLY with complete, well-formatted HTML. Do not add explanations outside the HTML.`;
        // 7. Call Gemini
        // ✅ Seleção automática e inteligente
        const selector = (0, modelSelector_1.getModelSelector)();
        const modelName = await selector.selectBestModel('general');
        console.log(`🤖 Using model: ${modelName} for focused summary`);
        let result;
        try {
            result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 32768, // Increased for comprehensive summaries
            false // jsonMode (we want HTML)
            );
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
        // 8. Sanitize HTML
        const sanitizedHtml = (0, sanitization_1.sanitizeHtml)(result.text);
        // 9. Save Summary
        const summaryData = {
            project_id,
            user_id: userId,
            titulo: getFocusedSummaryTitle(language),
            conteudo_html: sanitizedHtml,
            topicos: topTopics,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            type: 'focused',
            difficulties_count: difficulties.length
        };
        const docRef = await db.collection("summaries").add(summaryData);
        const savedDoc = await docRef.get();
        // 10. Log Token Usage
        await (0, token_usage_1.logTokenUsage)(userId, project_id, "focused_summary", result.usage.inputTokens, result.usage.outputTokens, modelName, // Log the actual model used
        { difficulties_count: difficulties.length, top_topics: topTopics });
        return {
            success: true,
            summary: Object.assign({ id: docRef.id }, savedDoc.data()),
            difficulties_count: difficulties.length,
            top_topics: topTopics,
        };
    }
    catch (error) {
        console.error("❌ Error generating focused summary:", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to generate focused summary");
    }
});
//# sourceMappingURL=generate_focused_summary.js.map