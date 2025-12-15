/**
 * Script para listar projetos de um usuário específico
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const TARGET_USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ service-account.json não encontrado.');
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function findProjects() {
    console.log('🔍 Buscando projetos do usuário:', TARGET_USER_ID);
    console.log('');

    // Tentar como user_id
    const byUserId = await db.collection('projects')
        .where('user_id', '==', TARGET_USER_ID)
        .get();

    console.log(`📁 Projetos encontrados por user_id: ${byUserId.size}`);

    if (byUserId.size > 0) {
        byUserId.docs.forEach((doc, i) => {
            const data = doc.data();
            console.log(`   ${i + 1}. ID: ${doc.id}`);
            console.log(`      Título: ${data.title || 'Sem título'}`);
            console.log(`      Criado: ${data.created_at?.toDate?.()?.toLocaleString('pt-BR') || 'N/A'}`);
        });
    }

    // Também tentar buscar o documento diretamente
    console.log('');
    console.log('🔍 Tentando buscar documento direto...');
    const directDoc = await db.collection('projects').doc(TARGET_USER_ID).get();

    if (directDoc.exists) {
        console.log('   ✅ Encontrado como doc ID!');
        const data = directDoc.data();
        console.log('   Dados:', JSON.stringify(data, null, 2));
    } else {
        console.log('   ❌ Não encontrado como doc ID.');
    }

    // Listar os últimos 10 projetos para referência
    console.log('');
    console.log('📋 Últimos 10 projetos no sistema:');
    const recentProjects = await db.collection('projects')
        .orderBy('created_at', 'desc')
        .limit(10)
        .get();

    recentProjects.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`   ${i + 1}. [${doc.id}] "${data.title || 'Sem título'}" - User: ${data.user_id?.slice(0, 8)}...`);
    });

    process.exit(0);
}

findProjects().catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
});
