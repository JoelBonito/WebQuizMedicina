import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import pt from '../locales/pt.json';
import ptPT from '../locales/pt-PT.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import it from '../locales/it.json';
import ja from '../locales/ja.json';
import zh from '../locales/zh.json';
import ru from '../locales/ru.json';
import ar from '../locales/ar.json';

i18n
    .use(LanguageDetector) // Detect user language
    .use(initReactI18next) // Pass i18n instance to react-i18next
    .init({
        resources: {
            pt: { translation: pt },
            'pt-PT': { translation: ptPT },
            en: { translation: en },
            es: { translation: es },
            fr: { translation: fr },
            de: { translation: de },
            it: { translation: it },
            ja: { translation: ja },
            zh: { translation: zh },
            ru: { translation: ru },
            ar: { translation: ar },
        },
        fallbackLng: 'pt', // Default language
        interpolation: {
            escapeValue: false, // React already escapes
        },
        detection: {
            // Detect language in this order:
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'language',
        },
    });

export default i18n;
