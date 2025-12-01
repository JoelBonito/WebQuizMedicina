import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
    process.exit(1);
}

if (!fs.existsSync(FIREBASE_SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ Faltando arquivo de Conta de Serviço do Firebase em ${FIREBASE_SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
}

// Inicializar Clientes
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET // Usar bucket do .env se disponível
    });
}
const bucket = admin.storage().bucket();
const db = admin.firestore();

// Bucket do Supabase para migrar
const SUPABASE_BUCKET = 'project-sources';

async function migrateStorage() {
    console.log('🚀 Iniciando migração do Storage...');

    // 1. Listar arquivos no bucket do Supabase
    console.log(`📂 Listando arquivos no bucket '${SUPABASE_BUCKET}'...`);

    // Listar recursivamente é complexo no Supabase se houver muitas pastas.
    // Vamos tentar listar a raiz e iterar, ou usar uma abordagem baseada nos registros do banco de dados.
    // Abordagem Híbrida: Ler a tabela 'sources' (já migrada para Firestore) e para cada registro que tem 'storage_path', tentar baixar.

    const sourcesSnapshot = await db.collection('sources').get();

    if (sourcesSnapshot.empty) {
        console.log('ℹ️ Nenhuma fonte encontrada no Firestore para migrar arquivos.');
        return;
    }

    console.log(`📄 Encontrados ${sourcesSnapshot.size} registros de fontes. Verificando arquivos...`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of sourcesSnapshot.docs) {
        const source = doc.data();
        const oldPath = source.storage_path;

        if (!oldPath) {
            // Fontes apenas texto ou extraídas podem não ter storage_path
            skippedCount++;
            continue;
        }

        console.log(`\n⬇️ Processando: ${source.name} (Path: ${oldPath})`);

        // Baixar do Supabase
        const { data: fileData, error: downloadError } = await supabase
            .storage
            .from(SUPABASE_BUCKET)
            .download(oldPath);

        if (downloadError) {
            console.error(`   ❌ Erro ao baixar do Supabase: ${downloadError.message}`);
            // Tentar verificar se o path inclui o bucket ou não
            // Às vezes storage_path no banco inclui 'sources/', às vezes não.
            // O .download() espera o caminho RELATIVO ao bucket.

            // Se o erro for "Object not found", pode ser que o path esteja errado.
            errorCount++;
            continue;
        }

        if (!fileData) {
            console.error(`   ❌ Arquivo vazio ou não encontrado.`);
            errorCount++;
            continue;
        }

        // Converter Blob/Buffer para Buffer do Node
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload para Firebase Storage
        // Podemos manter o mesmo caminho ou prefixar. Vamos manter o mesmo para simplificar.
        const firebaseFile = bucket.file(oldPath);

        try {
            await firebaseFile.save(buffer, {
                metadata: {
                    contentType: source.type || 'application/octet-stream',
                    metadata: {
                        originalName: source.name,
                        migratedFrom: 'supabase'
                    }
                }
            });
            console.log(`   ✅ Upload concluído para Firebase: ${oldPath}`);
            successCount++;
        } catch (uploadError: any) {
            console.error(`   ❌ Erro ao fazer upload para Firebase: ${uploadError.message}`);
            errorCount++;
        }
    }

    console.log('\n📊 Resumo da Migração de Storage:');
    console.log(`   ✅ Sucesso: ${successCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log(`   ⏭️ Pulados (sem path): ${skippedCount}`);
}

migrateStorage().catch(console.error);
