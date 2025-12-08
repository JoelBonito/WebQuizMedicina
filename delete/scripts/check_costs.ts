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

async function checkCosts() {
    console.log('🔍 Verificando custos em token_usage...');

    const snapshot = await db.collection('token_usage').limit(10).get();

    if (snapshot.empty) {
        console.log('❌ Coleção vazia.');
        return;
    }

    console.log(`✅ Encontrados ${snapshot.size} documentos (amostra).\n`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`📄 ID: ${doc.id}`);
        console.log(`   user_id: ${data.user_id}`);
        console.log(`   total_tokens: ${data.total_tokens}`);
        console.log(`   total_cost: ${data.total_cost}`);
        console.log(`   operation_type: ${data.operation_type}`);
        console.log();
    });
}

checkCosts().catch(console.error);
