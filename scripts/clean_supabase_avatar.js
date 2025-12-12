const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const userId = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

async function cleanSupabaseAvatarUrl() {
    console.log('🧹 Limpando URLs antigas do Supabase...\n');

    try {
        const userProfileRef = db.collection('user_profiles').doc(userId);
        const userDoc = await userProfileRef.get();

        if (!userDoc.exists) {
            console.log('❌ Perfil do usuário não encontrado.');
            process.exit(1);
        }

        const data = userDoc.data();
        console.log(`👤 Usuário: ${data.display_name || 'Sem nome'}`);
        console.log(`📸 Avatar URL atual: ${data.avatar_url || 'null'}\n`);

        if (data.avatar_url && data.avatar_url.includes('supabase.co')) {
            console.log('🔧 Detectada URL do Supabase. Removendo...');

            await userProfileRef.update({
                avatar_url: null
            });

            console.log('✅ Campo avatar_url limpo com sucesso!');
            console.log('💡 Próximos passos: Faça upload de um novo avatar nas configurações do perfil.\n');
        } else {
            console.log('✅ Nenhuma URL do Supabase detectada. Nada a fazer.');
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

cleanSupabaseAvatarUrl();
