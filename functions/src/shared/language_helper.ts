/**
 * Language Helper for Cloud Functions
 * Provides utilities for dynamic language support based on user profile
 */

export const LANGUAGE_NAMES: Record<string, string> = {
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
export function getLanguageInstruction(language: string = 'pt'): string {
    const langName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES['pt'];
    return `**IDIOMA:** Responda SEMPRE em ${langName}.`;
}

/**
 * Fetch user's preferred language from their profile
 * @param db - Firestore instance
 * @param userId - User ID
 * @returns Language code (defaults to 'pt')
 */
export async function getUserLanguage(
    db: FirebaseFirestore.Firestore,
    userId: string
): Promise<string> {
    try {
        const profileDoc = await db.collection('profiles').doc(userId).get();
        const language = profileDoc.data()?.response_language;

        // Validate language exists in our supported list
        if (language && LANGUAGE_NAMES[language]) {
            return language;
        }

        return 'pt'; // Default fallback
    } catch (error) {
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
export async function getLanguageFromRequest(
    data: any,
    db: FirebaseFirestore.Firestore,
    userId: string
): Promise<string> {
    // Priority: explicit parameter > user profile > default
    if (data.language && LANGUAGE_NAMES[data.language]) {
        return data.language;
    }

    return await getUserLanguage(db, userId);
}
