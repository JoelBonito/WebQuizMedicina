/**
 * Script para buscar TODOS os resumos do usuário
 */

const admin = require('firebase-admin');

// Service Account
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

async function main() {
    console.log('='.repeat(70));
    console.log('📋 BUSCANDO TODOS OS RESUMOS DO USUÁRIO');
    console.log('='.repeat(70));

    try {
        // Buscar TODOS os resumos do usuário
        const summariesSnapshot = await db.collection('summaries')
            .where('user_id', '==', USER_ID)
            .get();

        console.log(`\n📝 Resumos encontrados: ${summariesSnapshot.size}`);

        if (summariesSnapshot.empty) {
            console.log('❌ Nenhum resumo encontrado para este usuário');
            process.exit(0);
        }

        for (const doc of summariesSnapshot.docs) {
            const summary = doc.data();
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📄 ID: ${doc.id}`);
            console.log(`   Título: ${summary.titulo || 'Sem título'}`);
            console.log(`   Projeto: ${summary.project_id}`);
            console.log(`   Tipo: ${summary.type || 'general'}`);
            console.log(`   Criado: ${summary.created_at?.toDate?.()?.toLocaleString() || 'N/A'}`);

            const html = summary.conteudo_html || '';
            console.log(`   Tamanho: ${html.length} caracteres`);

            // Extrair H2s (seções principais)
            const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
            const cleanTag = (tag) => tag.replace(/<[^>]+>/g, '').trim();

            if (h2Matches.length > 0) {
                console.log(`\n   📊 SEÇÕES (${h2Matches.length}):`);
                h2Matches.forEach((h2, i) => {
                    const clean = cleanTag(h2);
                    console.log(`      ${i + 1}. ${clean.substring(0, 70)}${clean.length > 70 ? '...' : ''}`);
                });
            }

            // Verificar tópicos-alvo
            const htmlLower = html.toLowerCase();
            const hasTireoide = ['tireoide', 'tireoidite', 'tiroides', 'tiroiditis', 'hashimoto', 'quervain', 'riedel'].some(kw => htmlLower.includes(kw));
            const hasFigado = ['fígado', 'hepat', 'hígado', 'hepatocelular', 'colangiocarcinoma', 'hemangioma'].some(kw => htmlLower.includes(kw));

            console.log(`\n   🎯 Contém Tireoide: ${hasTireoide ? '✅' : '❌'}`);
            console.log(`   🎯 Contém Fígado: ${hasFigado ? '✅' : '❌'}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }

    process.exit(0);
}

main();
