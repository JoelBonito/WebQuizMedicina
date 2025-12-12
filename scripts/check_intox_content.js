const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkIntoxContent() {
    console.log('🔍 Verificando conteúdo sobre Intoxicações Exógenas...\n');

    const sourceDoc = await db.collection('sources')
        .where('project_id', '==', 'Nx7psBo0MlYtqeBfh4Od')
        .limit(1)
        .get();

    if (sourceDoc.empty) {
        console.log('❌ Source não encontrado');
        process.exit(1);
    }

    const content = sourceDoc.docs[0].data().extracted_content;

    // Buscar seções sobre intoxicações
    const keywords = [
        'INTOXICACIONES EXÓGENAS',
        'INTOXICACIONES EXOGENAS',
        'intoxicac',
        'veneno',
        'toxíndrome',
        'toxindrome',
        'paracetamol',
        'organofosforado',
        'carbón activado'
    ];

    console.log('📋 Buscando palavras-chave relacionadas:\n');

    keywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = content.match(regex);
        console.log(`   ${keyword}: ${matches ? matches.length + ' ocorrências' : '❌ NÃO ENCONTRADO'}`);
    });

    // Extrair trecho sobre intoxicações
    const intoxIndex = content.search(/INTOXICACIONES EXÓGENAS|INTOXICACIONES EXOGENAS/i);

    if (intoxIndex !== -1) {
        console.log(`\n✅ Seção "INTOXICACIONES EXÓGENAS" encontrada na posição ${intoxIndex}`);
        console.log(`📏 Distância do início: ${intoxIndex} caracteres`);
        console.log(`📏 Distância do final: ${content.length - intoxIndex} caracteres\n`);

        const excerpt = content.substring(intoxIndex, intoxIndex + 1000);
        console.log('--- TRECHO DA SEÇÃO (1000 caracteres) ---');
        console.log(excerpt);
        console.log('-------------------------------------------\n');
    } else {
        console.log('\n❌ Seção "INTOXICACIONES EXÓGENAS" NÃO ENCONTRADA no conteúdo');
    }

    process.exit(0);
}

checkIntoxContent().catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
});
