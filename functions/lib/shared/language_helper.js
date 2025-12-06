"use strict";
/**
 * Language Helper for Cloud Functions
 * Provides utilities for dynamic language support based on user profile
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanguageFromRequest = exports.getUserLanguage = exports.getLanguageInstruction = exports.LANGUAGE_NAMES = void 0;
exports.LANGUAGE_NAMES = {
    pt: 'Português do Brasil',
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
exports.getLanguageInstruction = getLanguageInstruction;
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
exports.getUserLanguage = getUserLanguage;
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
exports.getLanguageFromRequest = getLanguageFromRequest;
//# sourceMappingURL=language_helper.js.map