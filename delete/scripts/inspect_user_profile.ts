import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';

if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Faltando arquivo de Conta de Serviço`);
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function checkUserProfile() {
    console.log('🔍 Verificando estrutura de user_profiles...');
    const snapshot = await db.collection('user_profiles').limit(1).get();

    if (snapshot.empty) {
        console.log('❌ user_profiles está vazia.');
        return;
    }

    const data = snapshot.docs[0].data();
    console.log('Campos encontrados:', Object.keys(data));
    console.log('Exemplo:', data);
}

checkUserProfile().catch(console.error);
