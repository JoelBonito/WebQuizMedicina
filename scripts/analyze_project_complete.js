/**
 * Script para analisar completamente um projeto
 * Tópicos, Mapa Mental, Resumo, Flashcards e Quiz
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const PROJECT_ID = 'SUUgrZkijNbqCa23aOVc';

async function main() {
    console.log('═'.repeat(80));
    console.log('📊 ANÁLISE COMPLETA DO PROJETO');
    console.log(`   ID: ${PROJECT_ID}`);
    console.log('═'.repeat(80));

    try {
        // 1. INFO DO PROJETO
        const projectDoc = await db.collection('projects').doc(PROJECT_ID).get();
        if (!projectDoc.exists) {
            console.log('❌ Projeto não encontrado');
            process.exit(1);
        }
        const project = projectDoc.data();
        console.log(`\n📁 PROJETO: ${project.name}`);
        console.log(`   Criado: ${project.created_at?.toDate?.()?.toLocaleString() || 'N/A'}`);

        // 2. FONTES E TÓPICOS
        console.log('\n' + '─'.repeat(80));
        console.log('📄 FONTES E TÓPICOS');
        console.log('─'.repeat(80));

        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', PROJECT_ID)
            .get();

        let totalTopics = 0;
        let totalSubtopics = 0;

        for (const doc of sourcesSnapshot.docs) {
            const source = doc.data();
            console.log(`\n📎 ${source.name}`);
            console.log(`   Status: ${source.status}`);
            console.log(`   Conteúdo: ${source.extracted_content?.length || 0} chars`);

            if (source.topics && source.topics.length > 0) {
                console.log(`\n   📋 TÓPICOS EXTRAÍDOS (${source.topics.length}):`);
                source.topics.forEach((t, i) => {
                    const relevanceEmoji = t.relevance === 'high' ? '🔴' : t.relevance === 'medium' ? '🟡' : '🟢';
                    const subtopicCount = t.subtopics?.length || 0;
                    console.log(`      ${i + 1}. ${relevanceEmoji} ${t.name} (${subtopicCount} sub-tópicos)`);

                    // Mostrar sub-tópicos se existirem
                    if (t.subtopics && t.subtopics.length > 0) {
                        t.subtopics.slice(0, 5).forEach(st => {
                            console.log(`          • ${st}`);
                        });
                        if (t.subtopics.length > 5) {
                            console.log(`          ... e mais ${t.subtopics.length - 5}`);
                        }
                    }
                    totalSubtopics += subtopicCount;
                });
                totalTopics += source.topics.length;
            } else {
                console.log('   ❌ Sem tópicos extraídos');
            }
        }

        console.log(`\n   📊 TOTAL: ${totalTopics} tópicos principais + ${totalSubtopics} sub-tópicos`);

        // 3. MAPA MENTAL
        console.log('\n' + '─'.repeat(80));
        console.log('🧠 MAPA MENTAL');
        console.log('─'.repeat(80));

        const mindmapsSnapshot = await db.collection('mindmaps')
            .where('project_id', '==', PROJECT_ID)
            .get();

        if (mindmapsSnapshot.empty) {
            console.log('   ❌ Nenhum mapa mental encontrado');
        } else {
            for (const doc of mindmapsSnapshot.docs) {
                const mm = doc.data();
                console.log(`\n   📍 Mapa: ${doc.id}`);
                console.log(`   Criado: ${mm.created_at?.toDate?.()?.toLocaleString() || 'N/A'}`);

                // Contar nós se existir estrutura
                if (mm.nodes) {
                    console.log(`   Nós: ${mm.nodes.length}`);
                    // Mostrar estrutura resumida
                    const roots = mm.nodes.filter(n => !n.parent_id);
                    console.log(`   Raízes: ${roots.length}`);
                }
                if (mm.conteudo_html) {
                    console.log(`   HTML: ${mm.conteudo_html.length} chars`);
                }
            }
        }

        // 4. RESUMOS
        console.log('\n' + '─'.repeat(80));
        console.log('📝 RESUMOS');
        console.log('─'.repeat(80));

        const summariesSnapshot = await db.collection('summaries')
            .where('project_id', '==', PROJECT_ID)
            .get();

        if (summariesSnapshot.empty) {
            console.log('   ❌ Nenhum resumo encontrado');
        } else {
            for (const doc of summariesSnapshot.docs) {
                const s = doc.data();
                const html = s.conteudo_html || '';

                // Extrair seções H2
                const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
                const cleanTag = (tag) => tag.replace(/<[^>]+>/g, '').trim();

                console.log(`\n   📄 ${s.titulo || 'Sem título'}`);
                console.log(`   Tipo: ${s.type || 'general'}`);
                console.log(`   Tamanho: ${html.length} chars`);
                console.log(`   Seções (H2): ${h2Matches.length}`);

                if (h2Matches.length > 0) {
                    h2Matches.slice(0, 10).forEach((h2, i) => {
                        console.log(`      ${i + 1}. ${cleanTag(h2).substring(0, 60)}${cleanTag(h2).length > 60 ? '...' : ''}`);
                    });
                    if (h2Matches.length > 10) {
                        console.log(`      ... e mais ${h2Matches.length - 10} seções`);
                    }
                }
            }
        }

        // 5. FLASHCARDS
        console.log('\n' + '─'.repeat(80));
        console.log('🃏 FLASHCARDS');
        console.log('─'.repeat(80));

        const flashcardsSnapshot = await db.collection('flashcards')
            .where('project_id', '==', PROJECT_ID)
            .get();

        if (flashcardsSnapshot.empty) {
            console.log('   ❌ Nenhum flashcard encontrado');
        } else {
            console.log(`   ✅ Total: ${flashcardsSnapshot.size} flashcards`);

            // Agrupar por tópico
            const byTopic = {};
            flashcardsSnapshot.forEach(doc => {
                const fc = doc.data();
                const topic = fc.topico || 'Sem tópico';
                byTopic[topic] = (byTopic[topic] || 0) + 1;
            });

            console.log(`\n   📊 Por tópico:`);
            Object.entries(byTopic).slice(0, 15).forEach(([topic, count]) => {
                console.log(`      • ${topic}: ${count}`);
            });
            if (Object.keys(byTopic).length > 15) {
                console.log(`      ... e mais ${Object.keys(byTopic).length - 15} tópicos`);
            }
        }

        // 6. QUESTÕES (QUIZ)
        console.log('\n' + '─'.repeat(80));
        console.log('❓ QUESTÕES (QUIZ)');
        console.log('─'.repeat(80));

        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', PROJECT_ID)
            .get();

        if (questionsSnapshot.empty) {
            console.log('   ❌ Nenhuma questão encontrada');
        } else {
            console.log(`   ✅ Total: ${questionsSnapshot.size} questões`);

            // Agrupar por tópico
            const byTopic = {};
            const bySessao = {};

            questionsSnapshot.forEach(doc => {
                const q = doc.data();
                const topic = q.topico || 'Sem tópico';
                byTopic[topic] = (byTopic[topic] || 0) + 1;

                const session = q.session_id || 'Sem sessão';
                bySessao[session] = (bySessao[session] || 0) + 1;
            });

            console.log(`\n   📊 Por tópico (${Object.keys(byTopic).length} tópicos únicos):`);
            Object.entries(byTopic).slice(0, 15).forEach(([topic, count]) => {
                console.log(`      • ${topic}: ${count}`);
            });
            if (Object.keys(byTopic).length > 15) {
                console.log(`      ... e mais ${Object.keys(byTopic).length - 15} tópicos`);
            }

            console.log(`\n   📊 Por sessão (${Object.keys(bySessao).length} quizzes):`);
            Object.entries(bySessao).forEach(([session, count]) => {
                console.log(`      • Quiz ${session.substring(0, 8)}...: ${count} questões`);
            });
        }

        // 7. VERIFICAÇÃO DE COBERTURA
        console.log('\n' + '─'.repeat(80));
        console.log('🎯 VERIFICAÇÃO DE COBERTURA');
        console.log('─'.repeat(80));

        // Coletar todos os textos para verificar keywords
        let allContent = '';
        sourcesSnapshot.forEach(doc => {
            const s = doc.data();
            allContent += ' ' + (s.extracted_content || '');
            if (s.topics) {
                s.topics.forEach(t => {
                    allContent += ' ' + t.name;
                    if (t.subtopics) allContent += ' ' + t.subtopics.join(' ');
                });
            }
        });
        allContent = allContent.toLowerCase();

        const checks = [
            { name: 'Tireoide', keywords: ['tireoide', 'tireoidite', 'tiroides', 'tiroiditis', 'hashimoto'] },
            { name: 'Fígado', keywords: ['fígado', 'hígado', 'hepat', 'hepatocelular'] },
            { name: 'Esôfago', keywords: ['esôfago', 'esófago', 'barrett', 'erge'] },
            { name: 'Estômago', keywords: ['estômago', 'gástrico', 'gastrit'] },
            { name: 'Intestino', keywords: ['crohn', 'colite', 'colorretal', 'intestin'] },
            { name: 'Cavidade Oral', keywords: ['oral', 'boca', 'salivar'] },
        ];

        checks.forEach(c => {
            const found = c.keywords.some(k => allContent.includes(k));
            console.log(`   ${found ? '✅' : '❌'} ${c.name}`);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error(error.stack);
    }

    console.log('\n' + '═'.repeat(80));
    process.exit(0);
}

main();
