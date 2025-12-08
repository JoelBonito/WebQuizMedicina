import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuração do Firebase
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

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Credenciais do Supabase faltando no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapeamento de IDs (Supabase -> Firebase)
const USER_ID_MAPPING: { [key: string]: string } = {
    'd3bdff0d-ff99-4359-8ae6-d0f06499e281': '5vzDHICTBaVUExX82JaYhE1kDHp2', // jbento1@gmail.com (Admin)
    '0e19795f-88ed-4aa2-97dd-532b645850d0': 'aW6ODLcd95RvbReCpgnsxWcXxOw1', // renata@medicina.com
    '9ffe1328-4afc-4156-806f-32f735b8899e': 'PkHrf8eJ7XNGZNAfF5cpMIy4ZA72'  // carlos@medicina.com
};

async function mergeProfiles() {
    console.log('🚀 Iniciando fusão de profiles em user_profiles...');

    // 1. Buscar dados de profiles do Supabase
    const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('*');

    if (error) {
        console.error('❌ Erro ao buscar profiles do Supabase:', error);
        return;
    }

    if (!profilesData || profilesData.length === 0) {
        console.log('⚠️ Nenhum dado encontrado em profiles.');
        return;
    }

    console.log(`📦 Encontrados ${profilesData.length} perfis para processar.`);

    let updatedCount = 0;
    const batch = db.batch();
    let operationCount = 0;

    for (const profile of profilesData) {
        // Mapear ID
        const firebaseUserId = USER_ID_MAPPING[profile.id];

        if (!firebaseUserId) {
            console.warn(`⚠️ Usuário não mapeado: ${profile.id} (${profile.display_name}). Pulando.`);
            continue;
        }

        const docRef = db.collection('user_profiles').doc(firebaseUserId);

        const updates: any = {};
        if (profile.display_name) updates.display_name = profile.display_name;
        if (profile.avatar_url) updates.avatar_url = profile.avatar_url;
        if (profile.response_language) updates.response_language = profile.response_language;

        // Se houver role em profiles e quisermos preservar (embora user_profiles já tenha role)
        // updates.role = profile.role; 

        if (Object.keys(updates).length > 0) {
            batch.set(docRef, updates, { merge: true });
            updatedCount++;
            operationCount++;
        }
    }

    if (operationCount > 0) {
        await batch.commit();
    }

    console.log(`✅ Fusão concluída! ${updatedCount} perfis atualizados com dados extras.`);
}

mergeProfiles().catch(console.error);
