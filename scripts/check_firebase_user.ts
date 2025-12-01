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

async function checkUser(email: string) {
    console.log(`🔍 Verificando usuário: ${email}`);

    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        console.log(`✅ Usuário encontrado no Firebase Authentication:`);
        console.log(`   UID: ${userRecord.uid}`);
        console.log(`   Email: ${userRecord.email}`);
        console.log(`   Email verificado: ${userRecord.emailVerified}`);
        console.log(`   Desabilitado: ${userRecord.disabled}`);
        console.log(`   Criado em: ${userRecord.metadata.creationTime}`);
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.log(`❌ Usuário NÃO existe no Firebase Authentication`);
            console.log(`   Você precisa criar este usuário ou resetar a senha.`);
        } else {
            console.error(`❌ Erro ao buscar usuário:`, error);
        }
    }
}

const email = process.argv[2] || 'jbento1@gmail.com';
checkUser(email).catch(console.error);
