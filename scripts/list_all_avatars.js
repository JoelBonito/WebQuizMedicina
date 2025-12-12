const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const storage = admin.storage();
const bucket = storage.bucket('web-quiz-medicina.firebasestorage.app');

async function listAllAvatars() {
    console.log('🔍 Listando TODOS os arquivos de avatar...\n');

    try {
        const [files] = await bucket.getFiles({ prefix: 'avatars/' });

        if (files.length === 0) {
            console.log('❌ Pasta "avatars/" está vazia.');
            console.log('💡 Faça upload de um avatar através da interface da aplicação.\n');

            // Listar TODOS os arquivos do bucket para debug
            console.log('🔍 Listando TODAS as pastas do Storage:\n');
            const [allFiles] = await bucket.getFiles();

            const folders = new Set();
            allFiles.forEach(file => {
                const parts = file.name.split('/');
                if (parts.length > 1) {
                    folders.add(parts[0]);
                }
            });

            if (folders.size > 0) {
                console.log('📁 Pastas encontradas:');
                folders.forEach(folder => console.log(`   - ${folder}/`));
            } else {
                console.log('📁 Nenhuma pasta encontrada no Storage.');
            }

            process.exit(0);
        }

        console.log(`✅ Encontrados ${files.length} arquivo(s) na pasta avatars/:\n`);

        for (const file of files) {
            const [metadata] = await file.getMetadata();

            console.log(`📄 ${file.name}`);
            console.log(`   Tamanho: ${(metadata.size / 1024).toFixed(2)} KB`);
            console.log(`   Criado: ${metadata.timeCreated}`);

            // Gerar URL pública
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
            console.log(`   URL: ${publicUrl}`);
            console.log();
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

listAllAvatars();
