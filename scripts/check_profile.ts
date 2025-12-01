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

const TARGET_UID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1'; // Um dos usuários alunos

async function checkProfile() {
    console.log(`🔍 Verificando perfil para UID: ${TARGET_UID}...`);

    const doc = await db.collection('user_profiles').doc(TARGET_UID).get();

    if (doc.exists) {
        console.log('✅ Perfil ENCONTRADO!');
        console.log('Dados:', doc.data());
    } else {
        console.log('❌ Perfil NÃO ENCONTRADO.');
    }

    console.log('\n🔍 Verificando projetos deste usuário...');
    const projects = await db.collection('projects').where('user_id', '==', TARGET_UID).get();
    console.log(`✅ Encontrados ${projects.size} projetos.`);
}

checkProfile().catch(console.error);
