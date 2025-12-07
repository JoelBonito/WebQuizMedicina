import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useProfile } from "../hooks/useProfile";
import i18n from "../lib/i18n";
import { getInitialLanguage } from "../lib/languageUtils";

type Language = "pt" | "pt-PT" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ru" | "ar";

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  getLanguageName: (lang: Language) => string;
  isLoading: boolean;
}

const ThemeContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

const LANGUAGE_NAMES: Record<Language, string> = {
  "pt": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  "en": "English",
  "es": "Español",
  "fr": "Français",
  "de": "Deutsch",
  "it": "Italiano",
  "ja": "日本語",
  "zh": "中文",
  "ru": "Русский",
  "ar": "العربية",
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { profile, updateProfile, loading } = useProfile();

  // Initialize with detected language from browser or localStorage
  const [language, setLanguageState] = useState<Language>(() => {
    const initialLang = getInitialLanguage();
    // Set i18n immediately to avoid any delay
    i18n.changeLanguage(initialLang);
    return initialLang;
  });

  const [hasHydrated, setHasHydrated] = useState(false);

  // Sync with profile when it loads (ONLY ONCE after initial load)
  useEffect(() => {
    if (profile?.response_language && !hasHydrated) {
      const profileLang = profile.response_language as Language;

      // Only update if different from current language
      if (profileLang !== language) {
        console.log('[LanguageContext] Hydrating from profile:', profileLang);
        setLanguageState(profileLang);
        i18n.changeLanguage(profileLang);
        localStorage.setItem("language", profileLang);
      }

      setHasHydrated(true);
    }
  }, [profile, hasHydrated, language]);

  const setLanguage = async (newLanguage: Language) => {
    // Update local state immediately for responsiveness
    setLanguageState(newLanguage);

    // Sync with i18n for UI translation
    i18n.changeLanguage(newLanguage);

    // Save to profile (Firestore)
    if (profile) {
      await updateProfile({ response_language: newLanguage });
    }

    // Also save to localStorage as fallback
    localStorage.setItem("language", newLanguage);
  };

  const getLanguageName = (lang: Language) => {
    return LANGUAGE_NAMES[lang] || lang;
  };

  return (
    <ThemeContext.Provider value={{ language, setLanguage, getLanguageName, isLoading: loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
