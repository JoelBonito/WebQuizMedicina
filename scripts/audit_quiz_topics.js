/**
 * Auditoria de Quizzes e Tópicos Faltantes
 * Usuário: aW6ODLcd95RvbReCpgnsxWcXxOw1
 * 
 * Verifica se os tópicos mencionados estão presentes nas questions e sources.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Configuração - USANDO USER_ID
const TARGET_USER_ID = 'aW6ODLcd95RvbReCpgnsxWcXxOw1';
const TOPICS_TO_CHECK = [
    'Patologias tiróides',
    'Tumores malignos',
    'Nódulos e tumores hepáticos'
];

// Carregar service account
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

async function runAudit() {
    console.log('═'.repeat(80));
    console.log('🔍 AUDITORIA DE QUIZZES E TÓPICOS FALTANTES');
    console.log(`👤 Usuário: ${TARGET_USER_ID}`);
    console.log('═'.repeat(80));
    console.log('');

    // 1. BUSCAR TODOS OS PROJETOS DO USUÁRIO
    console.log('📊 ETAPA 1: Buscando projetos do usuário...');
    const projectsSnapshot = await db.collection('projects')
        .where('user_id', '==', TARGET_USER_ID)
        .get();

    if (projectsSnapshot.empty) {
        console.error('❌ Nenhum projeto encontrado para este usuário!');
        process.exit(1);
    }

    const projects = projectsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`   ✅ Projetos encontrados: ${projects.length}`);
    projects.forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.id} - "${p.title || 'Sem título'}"`);
    });
    console.log('');

    // 2. BUSCAR TODAS AS QUESTÕES DO USUÁRIO (de todos os projetos)
    console.log('📊 ETAPA 2: Buscando questões...');
    let allQuestions = [];

    for (const project of projects) {
        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', project.id)
            .orderBy('created_at', 'desc')
            .get();

        const questions = questionsSnapshot.docs.map(d => ({
            id: d.id,
            project_id: project.id,
            project_title: project.title,
            ...d.data()
        }));
        allQuestions = allQuestions.concat(questions);
        console.log(`   📝 Projeto ${project.id}: ${questions.length} questões`);
    }

    console.log(`   📝 Total de questões: ${allQuestions.length}`);
    console.log('');

    // 3. AGRUPAR POR SESSION_ID (QUIZZES)
    console.log('📊 ETAPA 3: Agrupando por sessão (quiz)...');
    const sessionMap = new Map();
    allQuestions.forEach(q => {
        const sid = q.session_id || 'sem_sessao';
        if (!sessionMap.has(sid)) {
            sessionMap.set(sid, {
                session_id: sid,
                project_id: q.project_id,
                created_at: q.created_at,
                questions: []
            });
        }
        sessionMap.get(sid).questions.push(q);
    });

    const sessions = Array.from(sessionMap.values())
        .filter(s => s.created_at)
        .sort((a, b) => {
            const dateA = a.created_at?.toMillis?.() || 0;
            const dateB = b.created_at?.toMillis?.() || 0;
            return dateB - dateA;
        });

    console.log(`   🎯 Total de sessões (quizzes): ${sessions.length}`);
    console.log('');

    // 4. ANALISAR OS 3 ÚLTIMOS QUIZZES
    console.log('═'.repeat(80));
    console.log('📋 ANÁLISE DOS 3 ÚLTIMOS QUIZZES');
    console.log('═'.repeat(80));

    const lastThreeSessions = sessions.slice(0, 3);

    lastThreeSessions.forEach((session, index) => {
        const date = session.created_at?.toDate?.() || new Date();
        console.log('');
        console.log(`🎯 QUIZ ${index + 1}`);
        console.log(`   📅 Data: ${date.toLocaleString('pt-BR')}`);
        console.log(`   🔑 Session ID: ${session.session_id}`);
        console.log(`   📁 Projeto: ${session.project_id}`);
        console.log(`   📝 Perguntas: ${session.questions.length}`);

        // Contar tópicos
        const topicCount = {};
        session.questions.forEach(q => {
            const topic = q.topico || 'Sem tópico';
            topicCount[topic] = (topicCount[topic] || 0) + 1;
        });

        console.log('   📊 Tópicos neste quiz:');
        Object.entries(topicCount)
            .sort((a, b) => b[1] - a[1])
            .forEach(([topic, count]) => {
                console.log(`      ${count}x - ${topic}`);
            });
    });

    // 5. BUSCAR TÓPICOS FALTANTES NAS QUESTÕES
    console.log('');
    console.log('═'.repeat(80));
    console.log('🔎 BUSCA POR TÓPICOS FALTANTES EM TODAS AS QUESTÕES');
    console.log('═'.repeat(80));

    const topicSearchResults = {};

    for (const targetTopic of TOPICS_TO_CHECK) {
        console.log('');
        console.log(`🎯 Buscando: "${targetTopic}"`);

        // Busca case-insensitive parcial
        const matchingQuestions = allQuestions.filter(q => {
            if (!q.topico) return false;
            const qTopic = q.topico.toLowerCase();
            const target = targetTopic.toLowerCase();
            return qTopic.includes(target) || target.includes(qTopic) ||
                // Busca por palavras-chave
                target.split(' ').some(word => word.length > 3 && qTopic.includes(word));
        });

        topicSearchResults[targetTopic] = matchingQuestions.length;

        if (matchingQuestions.length > 0) {
            console.log(`   ✅ ENCONTRADO em ${matchingQuestions.length} questões!`);
            matchingQuestions.slice(0, 5).forEach(q => {
                const date = q.created_at?.toDate?.() || new Date();
                console.log(`      - Tópico: "${q.topico}" (Quiz: ${q.session_id?.slice(0, 8)}..., Data: ${date.toLocaleDateString('pt-BR')})`);
            });
        } else {
            console.log(`   ❌ NÃO ENCONTRADO em nenhuma questão.`);
        }
    }

    // 6. BUSCAR NOS SOURCES
    console.log('');
    console.log('═'.repeat(80));
    console.log('📁 ANÁLISE DAS FONTES (SOURCES)');
    console.log('═'.repeat(80));

    let allSources = [];
    for (const project of projects) {
        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', project.id)
            .get();

        const sources = sourcesSnapshot.docs.map(d => ({
            id: d.id,
            project_id: project.id,
            ...d.data()
        }));
        allSources = allSources.concat(sources);
    }

    console.log(`   📦 Total de fontes: ${allSources.length}`);
    console.log('');

    allSources.forEach((source, index) => {
        console.log(`   📄 Fonte ${index + 1}: ${source.name || source.filename || 'Sem nome'}`);
        console.log(`      Tipo: ${source.type || 'Desconhecido'}`);
        console.log(`      Projeto: ${source.project_id}`);

        if (source.extracted_topics && Array.isArray(source.extracted_topics)) {
            console.log(`      📊 Tópicos extraídos: ${source.extracted_topics.length}`);
            source.extracted_topics.forEach(t => console.log(`         - ${t}`));
        }
        console.log('');
    });

    // 7. BUSCAR TÓPICOS NOS CONTENTS DAS SOURCES
    console.log('🔎 Buscando tópicos faltantes no conteúdo das fontes...');

    for (const targetTopic of TOPICS_TO_CHECK) {
        console.log(`   🎯 "${targetTopic}":`);

        let foundInSource = false;
        for (const source of allSources) {
            const content = (source.content || source.raw_content || '').toLowerCase();
            if (content.includes(targetTopic.toLowerCase())) {
                console.log(`      ✅ Encontrado no conteúdo da fonte: ${source.name || source.id}`);
                foundInSource = true;
            }

            // Verificar também nos tópicos extraídos
            if (source.extracted_topics && Array.isArray(source.extracted_topics)) {
                const matchTopic = source.extracted_topics.find(t => {
                    const tLower = t.toLowerCase();
                    const targetLower = targetTopic.toLowerCase();
                    return tLower.includes(targetLower) || targetLower.includes(tLower);
                });
                if (matchTopic) {
                    console.log(`      ✅ Encontrado nos tópicos extraídos: "${matchTopic}"`);
                    foundInSource = true;
                }
            }
        }

        if (!foundInSource) {
            console.log(`      ❌ NÃO encontrado em nenhuma fonte.`);
        }
    }

    // 8. SUMÁRIO FINAL
    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 SUMÁRIO DA AUDITORIA');
    console.log('═'.repeat(80));
    console.log(`   👤 Usuário: ${TARGET_USER_ID}`);
    console.log(`   📁 Projetos: ${projects.length}`);
    console.log(`   📝 Total de questões: ${allQuestions.length}`);
    console.log(`   🎯 Total de quizzes (sessões): ${sessions.length}`);
    console.log(`   📦 Total de fontes: ${allSources.length}`);
    console.log('');
    console.log('   🔍 Resultado da busca por tópicos:');
    for (const topic of TOPICS_TO_CHECK) {
        const count = topicSearchResults[topic];
        console.log(`      ${count > 0 ? '✅' : '❌'} ${topic}: ${count} questões encontradas`);
    }
    console.log('');

    // Diagnóstico
    console.log('═'.repeat(80));
    console.log('🩺 DIAGNÓSTICO');
    console.log('═'.repeat(80));

    const allMissing = TOPICS_TO_CHECK.every(t => topicSearchResults[t] === 0);

    if (allMissing) {
        console.log('⚠️  PROBLEMA IDENTIFICADO: Nenhum dos tópicos solicitados possui perguntas.');
        console.log('');
        console.log('   Possíveis causas:');
        console.log('   1. Os tópicos não foram extraídos das fontes durante o upload');
        console.log('   2. A IA não gerou perguntas sobre esses tópicos específicos');
        console.log('   3. Os documentos de origem não contêm esses tópicos');
        console.log('');
        console.log('   Recomendações:');
        console.log('   1. Verificar se os documentos uploadados contêm esses tópicos');
        console.log('   2. Gerar um novo quiz especificamente sobre esses tópicos');
        console.log('   3. Verificar os logs da Cloud Function de extração de tópicos');
    } else {
        console.log('✅ Alguns tópicos foram encontrados. Verifique os detalhes acima.');
    }

    console.log('═'.repeat(80));

    process.exit(0);
}

runAudit().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
});
