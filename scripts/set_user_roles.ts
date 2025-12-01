import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';

if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Faltando arquivo de Conta de Serviço do Firebase em ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const USERS_TO_UPDATE = [
    { uid: '5vzDHICTBaVUExX82JaYhE1kDHp2', role: 'admin' },
    { uid: 'aW6ODLcd95RvbReCpgnsxWcXxOw1', role: 'student' },
    { uid: 'PkHrf8eJ7XNGZNAfF5cpMIy4ZA72', role: 'student' }
];

async function setRoles() {
    console.log('🚀 Atualizando roles de usuários...');

    for (const user of USERS_TO_UPDATE) {
        const userRef = db.collection('user_profiles').doc(user.uid);

        try {
            // Usar set com merge para criar se não existir ou atualizar se existir
            await userRef.set({
                role: user.role,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`   ✅ Usuário ${user.uid} definido como '${user.role}'`);
        } catch (error: any) {
            console.error(`   ❌ Erro ao atualizar ${user.uid}:`, error.message);
        }
    }

    console.log('\n🎉 Atualização de roles concluída!');
}

setRoles().catch(console.error);
