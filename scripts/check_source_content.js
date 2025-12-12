const admin = require('firebase-admin');
const path = require('path');
// Tenta carregar o service account de dois lugares possíveis para garantir
let serviceAccount;
try {
    serviceAccount = require('../service-account.json');
} catch (e) {
    try {
        serviceAccount = require('./service-account.json');
    } catch (e2) {
        console.error('❌ service-account.json não encontrado em ../ ou ./');
        process.exit(1);
    }
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function run() {
    console.log('🔍 Buscando source "Final Primeiros Auxílios .pdf"...');
    // Usando o ID do projeto que sabemos ser o alvo
    const projectId = 'Nx7psBo0MlYtqeBfh4Od';

    const snapshot = await db.collection('sources')
        .where('project_id', '==', projectId)
        .get();

    let found = false;
    snapshot.forEach(doc => {
        const data = doc.data();
        // Check flexível de nome
        if (data.name && (data.name.includes('Auxílios') || data.name.includes('Auxilios'))) {
            found = true;
            console.log(`✅ Source encontrado: "${data.name}" (ID: ${doc.id})`);

            const content = data.extracted_content || '';
            console.log(`📏 Tamanho do conteúdo extraído: ${content.length} caracteres`);

            // Verificar se fala de cobras
            const snakeTerms = /cobra|serpente|ofídico|veneno|jararaca|cascavel/i;
            const hasSnake = snakeTerms.test(content);
            console.log(`🐍 Contém termos sobre cobras/venenos? ${hasSnake ? '✅ SIM' : '❌ NÃO'}`);

            console.log(`\n--- ÚLTIMOS 500 CARACTERES DO TEXTO ---\n...${content.slice(-500)}\n---------------------------------------`);

            if (content.length > 1000000) {
                console.log('⚠️ O texto é muito grande, pode ter sido truncado na extração ou upload.');
            }
        }
    });

    if (!found) {
        console.log('❌ Nenhum source com "Auxílios" no nome foi encontrado neste projeto.');
        console.log('Sources disponíveis:');
        snapshot.forEach(doc => console.log(`- ${doc.data().name}`));
    }
}

run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
