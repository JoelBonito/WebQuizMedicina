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
// Baseado no que já foi usado anteriormente
const USER_ID_MAPPING: { [key: string]: string } = {
    'd3bdff0d-ff99-4359-8ae6-d0f06499e281': '5vzDHICTBaVUExX82JaYhE1kDHp2', // jbento1@gmail.com (Admin)
    '0e19795f-88ed-4aa2-97dd-532b645850d0': 'aW6ODLcd95RvbReCpgnsxWcXxOw1', // renata@medicina.com
    '9ffe1328-4afc-4156-806f-32f735b8899e': 'PkHrf8eJ7XNGZNAfF5cpMIy4ZA72'  // carlos@medicina.com
};

async function migrateTokenUsage() {
    console.log('🚀 Iniciando migração de token_usage...');

    // 1. Buscar dados do Supabase
    const { data: usageData, error } = await supabase
        .from('token_usage_logs')
        .select('*');

    if (error) {
        console.error('❌ Erro ao buscar token_usage do Supabase:', error);
        return;
    }

    if (!usageData || usageData.length === 0) {
        console.log('⚠️ Nenhum dado encontrado em token_usage no Supabase.');
        return;
    }

    console.log(`📦 Encontrados ${usageData.length} registros para migrar.`);

    let migratedCount = 0;
    let skippedCount = 0;

    const batchSize = 500;
    let batch = db.batch();
    let operationCount = 0;

    for (const item of usageData) {
        // Mapear user_id
        const firebaseUserId = USER_ID_MAPPING[item.user_id];

        if (!firebaseUserId) {
            // Se não tiver mapeamento, podemos pular ou migrar com o ID original (mas ficará órfão)
            // Vamos pular para manter a consistência, ou logar um aviso.
            // console.warn(`⚠️ Usuário não mapeado: ${item.user_id}. Pulando registro.`);
            skippedCount++;
            continue;
        }

        const docRef = db.collection('token_usage').doc(item.id.toString()); // Usar ID original se possível, ou auto-id

        // Converter timestamp
        const createdAt = item.created_at ? new Date(item.created_at) : new Date();

        // Calcular total_tokens e mapear custos
        const inputTokens = Number(item.tokens_input || 0);
        const outputTokens = Number(item.tokens_output || 0);
        const totalTokens = inputTokens + outputTokens;
        const totalCost = Number(item.cost_usd || 0);

        const firestoreData = {
            ...item,
            user_id: firebaseUserId,
            created_at: admin.firestore.Timestamp.fromDate(createdAt),
            // Campos mapeados corretamente
            tokens_input: inputTokens,
            tokens_output: outputTokens,
            total_tokens: totalTokens, // Campo calculado
            total_cost: totalCost,      // Mapeado de cost_usd
            operation_type: item.operation_type || 'unknown'
        };

        batch.set(docRef, firestoreData);
        migratedCount++;
        operationCount++;

        if (operationCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
            console.log(`... processados ${migratedCount} registros.`);
        }
    }

    if (operationCount > 0) {
        await batch.commit();
    }

    console.log(`✅ Migração concluída!`);
    console.log(`   Migrados: ${migratedCount}`);
    console.log(`   Pulados (usuário desconhecido): ${skippedCount}`);
}

migrateTokenUsage().catch(console.error);
