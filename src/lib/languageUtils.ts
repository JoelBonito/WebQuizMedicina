/**
 * Utility functions for language detection and management
 */

type Language = "pt" | "pt-PT" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ru" | "ar";

const SUPPORTED_LANGUAGES: Language[] = ["pt", "pt-PT", "en", "es", "fr", "de", "it", "ja", "zh", "ru", "ar"];

const FALLBACK_LANGUAGE: Language = "en";

/**
 * Detects the browser's language and maps it to our supported languages
 * Priority order:
 * 1. Exact match (e.g., 'pt-BR' -> 'pt')
 * 2. Primary language match (e.g., 'en-US' -> 'en')
 * 3. Fallback to English
 */
export function detectBrowserLanguage(): Language {
    // Get browser language(s)
    const browserLanguages = navigator.languages || [navigator.language];

    // Try to find exact or partial match
    for (const browserLang of browserLanguages) {
        const normalizedLang = browserLang.toLowerCase();

        // Exact match
        if (SUPPORTED_LANGUAGES.includes(normalizedLang as Language)) {
            return normalizedLang as Language;
        }

        // Special case for Portuguese variants
        if (normalizedLang.startsWith('pt-br')) {
            return 'pt';
        }
        if (normalizedLang.startsWith('pt-pt') || normalizedLang.startsWith('pt')) {
            return 'pt-PT';
        }

        // Try to match primary language (e.g., 'en-US' -> 'en')
        const primaryLang = normalizedLang.split('-')[0];
        if (SUPPORTED_LANGUAGES.includes(primaryLang as Language)) {
            return primaryLang as Language;
        }
    }

    // Fallback to English if no match found
    console.log('[Language Detection] No match found, using fallback:', FALLBACK_LANGUAGE);
    return FALLBACK_LANGUAGE;
}

/**
 * Gets the initial language from multiple sources with priority:
 * 1. Saved in localStorage (from previous session)
 * 2. Browser language detection
 * 3. Fallback to English
 */
export function getInitialLanguage(): Language {
    // Priority 1: Check localStorage
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && SUPPORTED_LANGUAGES.includes(savedLanguage as Language)) {
        console.log('[Language Detection] Using saved language:', savedLanguage);
        return savedLanguage as Language;
    }

    // Priority 2: Detect from browser
    const detectedLanguage = detectBrowserLanguage();
    console.log('[Language Detection] Detected browser language:', detectedLanguage);
    return detectedLanguage;
}

export type { Language };
