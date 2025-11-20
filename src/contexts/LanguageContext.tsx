import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useProfile } from "../hooks/useProfile";

type Language = "pt" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ru" | "ar";

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
  "pt": "Português",
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
  const [language, setLanguageState] = useState<Language>("pt");

  // Sync with profile when it loads
  useEffect(() => {
    if (profile?.response_language) {
      setLanguageState(profile.response_language as Language);
    }
  }, [profile]);

  const setLanguage = async (newLanguage: Language) => {
    // Update local state immediately for responsiveness
    setLanguageState(newLanguage);

    // Save to profile (Supabase)
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
