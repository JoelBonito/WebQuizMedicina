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

async function listCollections() {
    console.log('🔍 Listando coleções do Firestore...');
    const collections = await db.listCollections();

    const stats: any = {};

    for (const col of collections) {
        const snapshot = await col.count().get();
        stats[col.id] = snapshot.data().count;
        console.log(`📂 ${col.id}: ${snapshot.data().count} documentos`);
    }

    return stats;
}

listCollections().catch(console.error);
