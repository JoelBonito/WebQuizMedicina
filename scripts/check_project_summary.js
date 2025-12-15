const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
    const PROJECT_ID = 'LIFxgxATl9C5EzgKhCk9';

    console.log('🔍 Buscando resumos do projeto:', PROJECT_ID);

    const snapshot = await db.collection('summaries')
        .where('project_id', '==', PROJECT_ID)
        .get();

    console.log(`\n📝 Resumos encontrados: ${snapshot.size}`);

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const html = data.conteudo_html || '';

        console.log('\n' + '='.repeat(70));
        console.log(`📄 Título: ${data.titulo}`);
        console.log(`   Tipo: ${data.type || 'general'}`);
        console.log(`   Criado: ${data.created_at?.toDate?.()?.toLocaleString() || 'N/A'}`);
        console.log(`   Tamanho: ${html.length} chars`);

        // Extrair H2s
        const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
        const cleanTag = (tag) => tag.replace(/<[^>]+>/g, '').trim();

        console.log(`\n📊 SEÇÕES DO RESUMO (${h2Matches.length}):`);
        h2Matches.forEach((h2, i) => {
            const clean = cleanTag(h2);
            console.log(`   ${i + 1}. ${clean}`);
        });

        // Verificar tópicos alvo
        const htmlLower = html.toLowerCase();
        console.log('\n🎯 VERIFICAÇÃO:');
        console.log(`   Tireoide: ${['tireoide', 'tireoidite', 'tiroides', 'tiroiditis', 'hashimoto', 'quervain', 'riedel'].some(k => htmlLower.includes(k)) ? '✅' : '❌'}`);
        console.log(`   Fígado/Hepático: ${['fígado', 'hepat', 'hígado', 'hepatocelular', 'colangiocarcinoma', 'hemangioma'].some(k => htmlLower.includes(k)) ? '✅' : '❌'}`);
    }

    process.exit(0);
}
main();
