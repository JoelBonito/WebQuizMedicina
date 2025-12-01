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

async function migrateTable(tableName: string, hasUserId: boolean = true) {
    console.log(`🚀 Iniciando migração de ${tableName}...`);

    const { data, error } = await supabase
        .from(tableName)
        .select('*');

    if (error) {
        console.error(`❌ Erro ao buscar ${tableName} do Supabase:`, error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log(`⚠️ Nenhum dado encontrado em ${tableName}.`);
        return;
    }

    console.log(`📦 Encontrados ${data.length} registros em ${tableName}.`);

    let migratedCount = 0;
    let batch = db.batch();
    let operationCount = 0;
    const batchSize = 500;

    for (const item of data) {
        const docRef = db.collection(tableName).doc(item.id.toString());
        let firestoreData = { ...item };

        // Converter datas
        if (item.created_at) firestoreData.created_at = admin.firestore.Timestamp.fromDate(new Date(item.created_at));
        if (item.updated_at) firestoreData.updated_at = admin.firestore.Timestamp.fromDate(new Date(item.updated_at));

        // Mapear user_id se necessário
        if (hasUserId && item.user_id) {
            const firebaseUserId = USER_ID_MAPPING[item.user_id];
            if (firebaseUserId) {
                firestoreData.user_id = firebaseUserId;
            } else {
                // console.warn(`⚠️ Usuário não mapeado em ${tableName}: ${item.user_id}`);
                // Mantém o ID original se não mapeado, ou decide pular
            }
        }

        batch.set(docRef, firestoreData);
        migratedCount++;
        operationCount++;

        if (operationCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
        }
    }

    if (operationCount > 0) {
        await batch.commit();
    }

    console.log(`✅ Migração de ${tableName} concluída: ${migratedCount} registros.`);
}

async function runMigration() {
    // 1. Mindmaps (tem user_id)
    await migrateTable('mindmaps', true);

    // 2. Source Chunks (tem user_id? geralmente sim, ou project_id)
    // Vamos assumir que tem user_id, se não tiver, o código apenas ignora o mapeamento se o campo não existir no objeto
    await migrateTable('source_chunks', true);

    // 3. Difficulty Taxonomy (provavelmente tabela de sistema, sem user_id)
    await migrateTable('difficulty_taxonomy', false);

    // 4. Audit Logs (tem user_id)
    await migrateTable('audit_logs', true);
}

runMigration().catch(console.error);
