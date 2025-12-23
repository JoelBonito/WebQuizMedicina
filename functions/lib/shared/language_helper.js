"use strict";
/**
 * Language Helper for Cloud Functions
 * Provides utilities for dynamic language support based on user profile
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_NAMES = void 0;
exports.getLanguageInstruction = getLanguageInstruction;
exports.getTrueFalseOptions = getTrueFalseOptions;
exports.getPromptTexts = getPromptTexts;
exports.getQuizExample = getQuizExample;
exports.getFlashcardExample = getFlashcardExample;
exports.getMindmapExample = getMindmapExample;
exports.getUserLanguage = getUserLanguage;
exports.getLanguageFromRequest = getLanguageFromRequest;
exports.LANGUAGE_NAMES = {
    pt: 'Português do Brasil',
    'pt-PT': 'Português de Portugal',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    ja: '日本語',
    zh: '中文',
    ru: 'Русский',
    ar: 'العربية'
};
/**
 * Generate language instruction for AI prompts
 * @param language - Language code (pt, en, es, etc.)
 * @returns Formatted language instruction for prompt
 */
function getLanguageInstruction(language = 'pt') {
    const langName = exports.LANGUAGE_NAMES[language] || exports.LANGUAGE_NAMES['pt'];
    return `**IDIOMA:** Responda SEMPRE em ${langName}.`;
}
/**
 * Get localized True/False options for quiz questions
 */
function getTrueFalseOptions(language = 'pt') {
    const options = {
        pt: { true: 'Verdadeiro', false: 'Falso', display: '["Verdadeiro", "Falso"]' },
        'pt-PT': { true: 'Verdadeiro', false: 'Falso', display: '["Verdadeiro", "Falso"]' },
        en: { true: 'True', false: 'False', display: '["True", "False"]' },
        es: { true: 'Verdadero', false: 'Falso', display: '["Verdadero", "Falso"]' },
        fr: { true: 'Vrai', false: 'Faux', display: '["Vrai", "Faux"]' },
        de: { true: 'Wahr', false: 'Falsch', display: '["Wahr", "Falsch"]' },
        it: { true: 'Vero', false: 'Falso', display: '["Vero", "Falso"]' },
        ja: { true: '正しい', false: '間違い', display: '["正しい", "間違い"]' },
        zh: { true: '正确', false: '错误', display: '["正确", "错误"]' },
        ru: { true: 'Верно', false: 'Неверно', display: '["Верно", "Неверно"]' },
        ar: { true: 'صحيح', false: 'خاطئ', display: '["صحيح", "خاطئ"]' }
    };
    return options[language] || options['pt'];
}
/**
 * Get localized prompt texts for quiz/flashcard generation
 */
function getPromptTexts(language = 'pt') {
    const texts = {
        pt: {
            professorIntro: 'Você é um professor universitário de MEDICINA',
            quizTitle: 'criando uma prova',
            flashcardTitle: 'criando Flashcards para estudo',
            recoveryTitle: 'criando material de RECUPERAÇÃO personalizado',
            questionTypes: 'TIPOS DE QUESTÃO',
            multipleChoice: 'Conceitos diretos',
            trueFalse: 'Julgue a afirmação',
            citation: 'Qual destes é um exemplo de...',
            clinicalCase: 'Cenário curto + conduta',
            formatRules: 'REGRAS DE FORMATO',
            justificationRules: 'REGRAS PARA A JUSTIFICATIVA',
            accordingToText: 'Segundo o texto...',
            conciseness: 'CONCISÃO',
            difficulty: 'dificuldade',
            easy: 'fácil',
            medium: 'médio',
            hard: 'difícil',
            general: 'Geral'
        },
        en: {
            professorIntro: 'You are a university-level MEDICINE professor',
            quizTitle: 'creating an exam',
            flashcardTitle: 'creating study Flashcards',
            recoveryTitle: 'creating personalized RECOVERY material',
            questionTypes: 'QUESTION TYPES',
            multipleChoice: 'Direct concepts',
            trueFalse: 'Judge the statement',
            citation: 'Which of these is an example of...',
            clinicalCase: 'Short scenario + conduct',
            formatRules: 'FORMAT RULES',
            justificationRules: 'JUSTIFICATION RULES',
            accordingToText: 'According to the text...',
            conciseness: 'CONCISENESS',
            difficulty: 'difficulty',
            easy: 'easy',
            medium: 'medium',
            hard: 'hard',
            general: 'General'
        },
        fr: {
            professorIntro: 'Vous êtes un professeur universitaire de MÉDECINE',
            quizTitle: 'créant un examen',
            flashcardTitle: 'créant des Flashcards d\'étude',
            recoveryTitle: 'créant du matériel de RÉCUPÉRATION personnalisé',
            questionTypes: 'TYPES DE QUESTIONS',
            multipleChoice: 'Concepts directs',
            trueFalse: 'Jugez l\'affirmation',
            citation: 'Lequel est un exemple de...',
            clinicalCase: 'Scénario court + conduite',
            formatRules: 'RÈGLES DE FORMAT',
            justificationRules: 'RÈGLES DE JUSTIFICATION',
            accordingToText: 'Selon le texte...',
            conciseness: 'CONCISION',
            difficulty: 'difficulté',
            easy: 'facile',
            medium: 'moyen',
            hard: 'difficile',
            general: 'Général'
        },
        es: {
            professorIntro: 'Eres un profesor universitario de MEDICINA',
            quizTitle: 'creando un examen',
            flashcardTitle: 'creando Flashcards de estudio',
            recoveryTitle: 'creando material de RECUPERACIÓN personalizado',
            questionTypes: 'TIPOS DE PREGUNTA',
            multipleChoice: 'Conceptos directos',
            trueFalse: 'Juzgue la afirmación',
            citation: '¿Cuál de estos es un ejemplo de...?',
            clinicalCase: 'Escenario corto + conducta',
            formatRules: 'REGLAS DE FORMATO',
            justificationRules: 'REGLAS DE JUSTIFICACIÓN',
            accordingToText: 'Según el texto...',
            conciseness: 'CONCISIÓN',
            difficulty: 'dificultad',
            easy: 'fácil',
            medium: 'medio',
            hard: 'difícil',
            general: 'General'
        }
    };
    return texts[language] || texts['pt'];
}
/**
 * Get localized example for quiz question
 */
function getQuizExample(language = 'pt') {
    const examples = {
        pt: `{
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para hipertensão em negros?",
      "opcoes": ["A) Tiazídicos", "B) Beta-bloqueadores", "C) IECA", "D) Losartana"],
      "resposta_correta": "A",
      "justificativa": "Segundo o texto, tiazídicos são mais eficazes em pacientes negros.",
      "dica": "Pense na droga que atua no rim.",
      "dificuldade": "médio",
      "topico": "Cardiologia"
    }`,
        en: `{
      "tipo": "multipla_escolha",
      "pergunta": "What is the first-line treatment for hypertension in Black patients?",
      "opcoes": ["A) Thiazides", "B) Beta-blockers", "C) ACE inhibitors", "D) Losartan"],
      "resposta_correta": "A",
      "justificativa": "According to the text, thiazides are more effective in Black patients.",
      "dica": "Think about the drug that acts on the kidney.",
      "dificuldade": "medium",
      "topico": "Cardiology"
    }`,
        fr: `{
      "tipo": "multipla_escolha",
      "pergunta": "Quel est le traitement de première ligne pour l'hypertension chez les patients noirs?",
      "opcoes": ["A) Thiazidiques", "B) Bêta-bloquants", "C) IEC", "D) Losartan"],
      "resposta_correta": "A",
      "justificativa": "Selon le texte, les thiazidiques sont plus efficaces chez les patients noirs.",
      "dica": "Pensez au médicament qui agit sur le rein.",
      "dificuldade": "moyen",
      "topico": "Cardiologie"
    }`,
        es: `{
      "tipo": "multipla_escolha",
      "pergunta": "¿Cuál es el tratamiento de primera línea para la hipertensión en pacientes negros?",
      "opcoes": ["A) Tiazidas", "B) Betabloqueantes", "C) IECA", "D) Losartán"],
      "resposta_correta": "A",
      "justificativa": "Según el texto, las tiazidas son más eficaces en pacientes negros.",
      "dica": "Piensa en el fármaco que actúa en el riñón.",
      "dificuldade": "medio",
      "topico": "Cardiología"
    }`
    };
    return examples[language] || examples['pt'];
}
/**
 * Get localized example for flashcard
 */
function getFlashcardExample(language = 'pt') {
    const examples = {
        pt: `{
      "frente": "Qual o tratamento de primeira linha para Hipertensão em negros?",
      "verso": "Tiazídicos ou Bloqueadores de Canais de Cálcio (BCC).",
      "topico": "Cardiologia",
      "dificuldade": "médio"
    }`,
        en: `{
      "frente": "What is the first-line treatment for Hypertension in Black patients?",
      "verso": "Thiazides or Calcium Channel Blockers (CCB).",
      "topico": "Cardiology",
      "dificuldade": "medium"
    }`,
        fr: `{
      "frente": "Quel est le traitement de première ligne pour l'hypertension chez les patients noirs?",
      "verso": "Thiazidiques ou Inhibiteurs Calciques (IC).",
      "topico": "Cardiologie",
      "dificuldade": "moyen"
    }`,
        es: `{
      "frente": "¿Cuál es el tratamiento de primera línea para la Hipertensión en pacientes negros?",
      "verso": "Tiazidas o Bloqueadores de Canales de Calcio (BCC).",
      "topico": "Cardiología",
      "dificuldade": "medio"
    }`
    };
    return examples[language] || examples['pt'];
}
/**
 * Get localized example for mindmap structure
 */
function getMindmapExample(language = 'pt') {
    const examples = {
        pt: `# Insuficiência Cardíaca
## Fisiopatologia
- Disfunção Sistólica
  - Fração de Ejeção < 40%
- Disfunção Diastólica
## Sintomas
- Congestivos
  - Dispneia
  - Edema`,
        en: `# Heart Failure
## Pathophysiology
- Systolic Dysfunction
  - Ejection Fraction < 40%
- Diastolic Dysfunction
## Symptoms
- Congestive
  - Dyspnea
  - Edema`,
        fr: `# Insuffisance Cardiaque
## Physiopathologie
- Dysfonction Systolique
  - Fraction d'Éjection < 40%
- Dysfonction Diastolique
## Symptômes
- Congestifs
  - Dyspnée
  - Œdème`,
        es: `# Insuficiencia Cardíaca
## Fisiopatología
- Disfunción Sistólica
  - Fracción de Eyección < 40%
- Disfunción Diastólica
## Síntomas
- Congestivos
  - Disnea
  - Edema`
    };
    return examples[language] || examples['pt'];
}
/**
 * Fetch user's preferred language from their profile
 * @param db - Firestore instance
 * @param userId - User ID
 * @returns Language code (defaults to 'pt')
 */
async function getUserLanguage(db, userId) {
    var _a;
    try {
        const profileDoc = await db.collection('profiles').doc(userId).get();
        const language = (_a = profileDoc.data()) === null || _a === void 0 ? void 0 : _a.response_language;
        // Validate language exists in our supported list
        if (language && exports.LANGUAGE_NAMES[language]) {
            return language;
        }
        return 'pt'; // Default fallback
    }
    catch (error) {
        console.warn('Failed to fetch user language, using default:', error);
        return 'pt';
    }
}
/**
 * Get language from data parameter with fallback to user profile
 * @param data - Request data that may contain language parameter
 * @param db - Firestore instance
 * @param userId - User ID
 * @returns Language code
 */
async function getLanguageFromRequest(data, db, userId) {
    // Priority: explicit parameter > user profile > default
    if (data.language && exports.LANGUAGE_NAMES[data.language]) {
        return data.language;
    }
    return await getUserLanguage(db, userId);
}
//# sourceMappingURL=language_helper.js.map