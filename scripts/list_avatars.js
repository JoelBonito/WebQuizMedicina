const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const storage = admin.storage();
const bucket = storage.bucket('web-quiz-medicina.firebasestorage.app');

async function listAvatars() {
    console.log('🔍 Listando arquivos de avatar no Firebase Storage...\n');

    try {
        const [files] = await bucket.getFiles({ prefix: 'avatars/' });

        if (files.length === 0) {
            console.log('❌ Nenhum avatar encontrado no Firebase Storage (pasta avatars/).');
            console.log('💡 Os avatars devem ser enviados através da interface da aplicação.\n');
            process.exit(0);
        }

        console.log(`📁 Total de arquivos encontrados: ${files.length}\n`);

        for (const file of files) {
            const [metadata] = await file.getMetadata();

            console.log(`📄 ${file.name}`);
            console.log(`   Tamanho: ${(metadata.size / 1024).toFixed(2)} KB`);
            console.log(`   Criado em: ${metadata.timeCreated}`);
            console.log(`   Content-Type: ${metadata.contentType}`);

            // Gerar URL pública
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-01-2500'
            });

            console.log(`   URL: ${url.substring(0, 100)}...`);
            console.log();
        }

        console.log('✅ Use a função de upload na aplicação para adicionar novos avatars.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro ao listar avatars:', error);
        process.exit(1);
    }
}

listAvatars();
