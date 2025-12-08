import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltando credenciais');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listFiles() {
    console.log('📂 Listando buckets...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error('Erro ao listar buckets:', bucketError);
    } else {
        console.log('Buckets encontrados:', buckets.map(b => b.name));
    }

    const BUCKET = 'sources';
    console.log(`\n📂 Listando arquivos na raiz de '${BUCKET}'...`);

    const { data: files, error } = await supabase.storage.from(BUCKET).list();

    if (error) {
        console.error('Erro ao listar arquivos:', error);
        return;
    }

    console.log('Arquivos/Pastas na raiz:', files);

    if (files && files.length > 0) {
        // Tentar listar dentro da primeira pasta encontrada
        const firstFolder = files.find(f => !f.metadata); // Pastas geralmente não tem metadata ou tem id null
        if (firstFolder) {
            console.log(`\n📂 Listando dentro de '${firstFolder.name}'...`);
            const { data: subFiles } = await supabase.storage.from(BUCKET).list(firstFolder.name);
            console.log('Conteúdo:', subFiles);
        }
    }
}

listFiles();
