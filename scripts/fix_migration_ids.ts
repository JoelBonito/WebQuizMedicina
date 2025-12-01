import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';

if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Faltando arquivo de Conta de Serviço do Firebase em ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Mapeamento fornecido pelo usuário: Supabase ID -> Firebase ID
const ID_MAPPING: Record<string, string> = {
    'd3bdff0d-ff99-4359-8ae6-d0f06499e281': '5vzDHICTBaVUExX82JaYhE1kDHp2',
    '0e19795f-88ed-4aa2-97dd-532b645850d0': 'aW6ODLcd95RvbReCpgnsxWcXxOw1',
    '9ffe1328-4afc-4156-806f-32f735b8899e': 'PkHrf8eJ7XNGZNAfF5cpMIy4ZA72'
};

const TABLES_TO_FIX = [
    'projects',
    'sources',
    'questions',
    'flashcards',
    'summaries',
    'difficulties',
    'progress',
    'chat_messages'
];

async function fixMigration() {
    console.log('🚀 Iniciando correção de IDs de migração...');

    // 1. Corrigir/Re-migrar User Profiles
    console.log('\n👤 Corrigindo User Profiles...');
    for (const [supabaseId, firebaseUid] of Object.entries(ID_MAPPING)) {
        // Buscar perfil no Supabase
        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', supabaseId)
            .single();

        if (error || !profile) {
            console.warn(`   ⚠️ Perfil não encontrado no Supabase para ID ${supabaseId}`);
            continue;
        }

        // Salvar no Firestore com o ID correto
        const data = { ...profile };
        delete data.id; // Remover ID antigo
        // Garantir que user_id (se existir no corpo) seja atualizado, embora o doc ID seja o principal
        if (data.user_id) data.user_id = firebaseUid;

        await db.collection('user_profiles').doc(firebaseUid).set(data, { merge: true });
        console.log(`   ✅ Perfil migrado/corrigido: ${supabaseId} -> ${firebaseUid}`);
    }

    // 2. Corrigir user_id nas outras coleções
    console.log('\n📦 Corrigindo referências em outras coleções...');

    for (const table of TABLES_TO_FIX) {
        console.log(`   Verificando tabela: ${table}...`);
        let updateCount = 0;

        for (const [supabaseId, firebaseUid] of Object.entries(ID_MAPPING)) {
            // Buscar documentos que ainda têm o ID antigo do Supabase
            const snapshot = await db.collection(table).where('user_id', '==', supabaseId).get();

            if (snapshot.empty) continue;

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { user_id: firebaseUid });
                updateCount++;
            });

            await batch.commit();
            console.log(`      -> Atualizados ${snapshot.size} registros de ${supabaseId} para ${firebaseUid}`);
        }

        if (updateCount === 0) {
            console.log(`      (Nenhuma correção necessária)`);
        }
    }

    console.log('\n🎉 Correção de IDs Completa!');
}

fixMigration().catch(console.error);
