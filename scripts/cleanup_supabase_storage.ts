import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configuração
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PRESERVED_FOLDERS = [
    '73d4d19a-10bc-4d98-95ac-77a4b65a323a',
    '868f7d6e-9a14-45d7-a9c0-8904d9c134d9',
    'a09797fe-75b0-4894-951e-6c845e835940',
    '10d762e0-d5f1-407f-80c4-20e9848d867f',
    'cd7843ec-7778-419b-a643-8e0b1862d376'
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no arquivo .env');
    process.exit(1);
}

// Inicializar Cliente
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupStorage() {
    console.log('🚀 Iniciando limpeza do Supabase Storage...');

    // 1. Listar Buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
        console.error('❌ Erro ao listar buckets:', bucketsError);
        return;
    }

    if (!buckets || buckets.length === 0) {
        console.log('ℹ️ Nenhum bucket encontrado.');
        return;
    }

    console.log(`📦 Encontrados ${buckets.length} buckets: ${buckets.map(b => b.name).join(', ')}`);

    for (const bucket of buckets) {
        console.log(`\n📂 Processando bucket: ${bucket.name}...`);
        await processFolder(bucket.name, '');
    }

    console.log('\n🎉 Limpeza Completa!');
}

async function processFolder(bucketName: string, path: string) {
    // Listar arquivos na pasta atual
    const { data: items, error } = await supabase.storage.from(bucketName).list(path, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
        console.error(`   ❌ Erro ao listar itens em ${bucketName}/${path}:`, error);
        return;
    }

    if (!items || items.length === 0) {
        return;
    }

    const filesToDelete: string[] = [];

    for (const item of items) {
        const itemPath = path ? `${path}/${item.name}` : item.name;

        // Check if the current folder/file name is in the preserved list
        // This applies to ANY level. If a folder name matches, we preserve it and everything inside.
        if (PRESERVED_FOLDERS.includes(item.name)) {
            console.log(`   🛡️ Preservando (por nome): ${itemPath}`);
            continue;
        }

        if (!item.metadata) {
            // É uma pasta
            console.log(`   📂 Entrando na pasta para limpeza: ${itemPath}`);
            await processFolder(bucketName, itemPath);
        } else {
            // É um arquivo
            console.log(`   🗑️ Marcando para deleção: ${itemPath}`);
            filesToDelete.push(itemPath);
        }
    }

    if (filesToDelete.length > 0) {
        console.log(`   🔥 Deletando ${filesToDelete.length} arquivos em ${bucketName}/${path}...`);
        const { error: deleteError } = await supabase.storage.from(bucketName).remove(filesToDelete);
        if (deleteError) {
            console.error(`   ❌ Erro ao deletar arquivos:`, deleteError);
        } else {
            console.log(`   ✅ Arquivos deletados.`);
        }
    }
}

cleanupStorage().catch(console.error);
