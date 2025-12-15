/**
 * Script para ler o resumo do projeto Anatopatologia
 */

const admin = require('firebase-admin');
const path = require('path');

// Service Account
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';

async function main() {
    console.log('='.repeat(70));
    console.log('📋 ANALISANDO RESUMO DO PROJETO ANATOPATOLOGIA');
    console.log('='.repeat(70));

    try {
        // 1. Buscar projetos do usuário
        console.log(`\n👤 Buscando projetos do usuário: ${USER_ID}`);
        const projectsSnapshot = await db.collection('projects')
            .where('user_id', '==', USER_ID)
            .get();

        const projects = projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`📁 Projetos encontrados: ${projects.length}`);

        projects.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.name} (ID: ${p.id})`);
        });

        // 2. Buscar resumos de cada projeto
        for (const project of projects) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📂 Projeto: ${project.name}`);
            console.log(`${'='.repeat(70)}`);

            const summariesSnapshot = await db.collection('summaries')
                .where('project_id', '==', project.id)
                .orderBy('created_at', 'desc')
                .limit(1)
                .get();

            if (summariesSnapshot.empty) {
                console.log('   ❌ Nenhum resumo encontrado');
                continue;
            }

            const summary = summariesSnapshot.docs[0].data();
            console.log(`\n📝 Resumo: ${summary.titulo || 'Sem título'}`);
            console.log(`   Tipo: ${summary.type || 'general'}`);
            console.log(`   Criado em: ${summary.created_at?.toDate?.()?.toLocaleString() || 'N/A'}`);

            // Analisar estrutura HTML do resumo
            const html = summary.conteudo_html || '';
            console.log(`   Tamanho HTML: ${html.length} caracteres`);

            // Extrair headers (H1, H2, H3) para ver estrutura
            const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
            const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
            const h3Matches = html.match(/<h3[^>]*>(.*?)<\/h3>/gi) || [];

            // Limpar tags HTML dos matches
            const cleanTag = (tag) => tag.replace(/<[^>]+>/g, '').trim();

            console.log(`\n📊 ESTRUTURA DO RESUMO:`);
            console.log(`   H1 (Títulos principais): ${h1Matches.length}`);
            console.log(`   H2 (Seções): ${h2Matches.length}`);
            console.log(`   H3 (Sub-seções): ${h3Matches.length}`);

            if (h2Matches.length > 0) {
                console.log(`\n📋 SEÇÕES (H2) ENCONTRADAS:`);
                h2Matches.forEach((h2, i) => {
                    const clean = cleanTag(h2);
                    console.log(`   ${i + 1}. ${clean.substring(0, 80)}${clean.length > 80 ? '...' : ''}`);
                });
            }

            if (h3Matches.length > 0) {
                console.log(`\n📋 SUB-SEÇÕES (H3) - Primeiras 20:`);
                h3Matches.slice(0, 20).forEach((h3, i) => {
                    const clean = cleanTag(h3);
                    console.log(`   ${i + 1}. ${clean.substring(0, 60)}${clean.length > 60 ? '...' : ''}`);
                });
                if (h3Matches.length > 20) {
                    console.log(`   ... e mais ${h3Matches.length - 20} sub-seções`);
                }
            }

            // Verificar se tem tópicos de Tireoide e Fígado
            console.log(`\n🎯 VERIFICAÇÃO DE TÓPICOS-ALVO:`);
            const htmlLower = html.toLowerCase();
            const targets = [
                { name: 'Tireoide/Tireoidite', keywords: ['tireoide', 'tireoidite', 'tiroides', 'tiroiditis', 'hashimoto', 'de quervain'] },
                { name: 'Fígado/Hepático', keywords: ['fígado', 'hepat', 'hígado', 'carcinoma hepatocelular', 'colangiocarcinoma'] },
                { name: 'Tumores Benignos', keywords: ['hemangioma', 'adenoma hepatocelular', 'hiperplasia nodular'] },
            ];

            for (const target of targets) {
                const found = target.keywords.some(kw => htmlLower.includes(kw));
                console.log(`   ${found ? '✅' : '❌'} ${target.name}`);
                if (found) {
                    const foundKeywords = target.keywords.filter(kw => htmlLower.includes(kw));
                    console.log(`      Palavras encontradas: ${foundKeywords.join(', ')}`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }

    process.exit(0);
}

main();
