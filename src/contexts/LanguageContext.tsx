import { createContext, useContext, useState, ReactNode } from "react";

type Language = "pt-BR" | "en-US" | "es-ES";

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  getLanguageName: (lang: Language) => string;
}

const ThemeContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

const LANGUAGE_NAMES: Record<Language, string> = {
  "pt-BR": "Português (Brasil)",
  "en-US": "English (US)",
  "es-ES": "Español",
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("language");
    return (stored as Language) || "pt-BR";
  });

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
    localStorage.setItem("language", newLanguage);
  };

  const getLanguageName = (lang: Language) => {
    return LANGUAGE_NAMES[lang] || lang;
  };

  return (
    <ThemeContext.Provider value={{ language, setLanguage, getLanguageName }}>
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
