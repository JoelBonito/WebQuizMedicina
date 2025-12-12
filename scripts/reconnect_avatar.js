const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket('web-quiz-medicina.firebasestorage.app');

const userId = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

async function reconnectAvatar() {
    console.log('🔗 Reconectando avatar do Firebase Storage ao perfil...\n');

    try {
        // 1. Buscar avatars do usuário no Storage
        const prefix = `avatars/${userId}`;
        const [files] = await bucket.getFiles({ prefix });

        if (files.length === 0) {
            console.log(`❌ Nenhum avatar encontrado para o usuário ${userId}`);
            console.log('💡 Faça upload de um novo avatar através da interface da aplicação.\n');
            process.exit(0);
        }

        console.log(`📁 Encontrados ${files.length} arquivo(s) de avatar:\n`);

        // 2. Pegar o arquivo mais recente
        const sortedFiles = files.sort((a, b) => {
            const aTime = a.metadata?.timeCreated || '0';
            const bTime = b.metadata?.timeCreated || '0';
            return bTime.localeCompare(aTime);
        });

        const latestFile = sortedFiles[0];
        const [metadata] = await latestFile.getMetadata();

        console.log(`📄 Avatar mais recente: ${latestFile.name}`);
        console.log(`   Criado em: ${metadata.timeCreated}`);
        console.log(`   Tamanho: ${(metadata.size / 1024).toFixed(2)} KB\n`);

        // 3. Tornar o arquivo público (necessário para avatar)
        await latestFile.makePublic();

        // 4. Gerar URL pública
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${latestFile.name}`;

        console.log(`🔗 URL pública: ${publicUrl}\n`);

        // 5. Atualizar perfil do usuário no Firestore
        const userProfileRef = db.collection('user_profiles').doc(userId);
        await userProfileRef.update({
            avatar_url: publicUrl
        });

        console.log('✅ Perfil atualizado com sucesso!');
        console.log('🎨 Recarregue a página para ver o avatar.\n');

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

reconnectAvatar();
