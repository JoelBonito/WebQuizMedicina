import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};



// DEBUG: Verificar se as variáveis estão sendo carregadas
console.log('[Firebase Config Check]', {
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    apiKeyPresent: !!firebaseConfig.apiKey
});

if (!firebaseConfig.authDomain) {
    console.error('[CRITICAL] VITE_FIREBASE_AUTH_DOMAIN is missing! Check your .env file and restart the server.');
}

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Configura o Firebase Auth para usar o idioma do dispositivo
// Isso garante que emails de sistema (reset de senha, verificação) sejam enviados no idioma correto
auth.useDeviceLanguage();

export default app;
