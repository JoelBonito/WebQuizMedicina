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

async function checkTokenUsage() {
    console.log('🔍 Verificando coleção token_usage...');

    const snapshot = await db.collection('token_usage').limit(5).get();

    if (snapshot.empty) {
        console.log('❌ A coleção token_usage está VAZIA.');
        return;
    }

    console.log(`✅ Encontrados ${snapshot.size} documentos (amostra).`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\n📄 ID: ${doc.id}`);
        console.log(`   user_id: ${data.user_id}`);
        console.log(`   created_at:`, data.created_at);
        console.log(`   Tipo de created_at:`, data.created_at ? data.created_at.constructor.name : 'undefined');
        console.log(`   total_tokens: ${data.total_tokens}`);
    });
}

checkTokenUsage().catch(console.error);
