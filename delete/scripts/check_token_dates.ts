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

async function checkDates() {
    console.log('🔍 Verificando datas em token_usage...');

    const snapshot = await db.collection('token_usage')
        .orderBy('created_at', 'asc')
        .limit(1)
        .get();

    const lastSnapshot = await db.collection('token_usage')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) {
        console.log('❌ Coleção vazia.');
        return;
    }

    const first = snapshot.docs[0].data().created_at.toDate();
    const last = lastSnapshot.docs[0].data().created_at.toDate();

    console.log(`📅 Primeiro registro: ${first.toISOString()}`);
    console.log(`📅 Último registro:   ${last.toISOString()}`);

    // Verificar quantos registros nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSnapshot = await db.collection('token_usage')
        .where('created_at', '>=', thirtyDaysAgo)
        .count()
        .get();

    console.log(`📊 Registros nos últimos 30 dias: ${recentSnapshot.data().count}`);
}

checkDates().catch(console.error);
