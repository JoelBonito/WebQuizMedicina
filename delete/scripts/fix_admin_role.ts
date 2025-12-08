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
const auth = admin.auth();

const TARGET_EMAIL = 'jbento1@gmail.com';

async function fixAdmin() {
    console.log(`🔍 Buscando usuário por email: ${TARGET_EMAIL}...`);

    try {
        const userRecord = await auth.getUserByEmail(TARGET_EMAIL);
        const uid = userRecord.uid;
        console.log(`✅ Usuário encontrado! UID: ${uid}`);

        const userRef = db.collection('user_profiles').doc(uid);
        const doc = await userRef.get();

        if (doc.exists) {
            const data = doc.data();
            console.log(`ℹ️ Role atual no Firestore: ${data?.role}`);

            if (data?.role !== 'admin') {
                console.log('🔄 Atualizando role para admin...');
                await userRef.set({ role: 'admin' }, { merge: true });
                console.log('✅ Role atualizada com sucesso!');
            } else {
                console.log('✅ Usuário já é admin.');
            }
        } else {
            console.log('⚠️ Perfil não existe no Firestore. Criando...');
            await userRef.set({
                email: TARGET_EMAIL,
                role: 'admin',
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Perfil criado como admin!');
        }

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error('❌ Usuário não encontrado no Firebase Auth com esse email.');
        } else {
            console.error('❌ Erro:', error);
        }
    }
}

fixAdmin().catch(console.error);
