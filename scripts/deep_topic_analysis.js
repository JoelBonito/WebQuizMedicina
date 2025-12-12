
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

const TARGET_PROJECT_ID = 'Nx7psBo0MlYtqeBfh4Od';

async function deepAnalyzeTopics() {
    try {
        console.log(`🔍 ANÁLISE PROFUNDA DE TÓPICOS - Projeto: ${TARGET_PROJECT_ID}`);
        console.log('='.repeat(60));

        // ---------------------------------------------------------
        // 1. Extrair TODOS os Tópicos das Fontes (O que DEVERIA cair)
        // ---------------------------------------------------------
        console.log('\n📚 1. LEVANTAMENTO DE TÓPICOS NAS FONTES');
        const sourceTopicsSet = new Set();

        // A. Sources (Metadata rico)
        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .get();

        console.log(`   📦 Sources encontrados: ${sourcesSnapshot.size}`);
        sourcesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            console.log(`      - Arquivo: "${data.name}"`);

            if (data.topics && Array.isArray(data.topics)) {
                data.topics.forEach(t => {
                    // Lidar com tópicos que podem ser objetos { topic: "Nome", ... } ou strings
                    const topicName = (typeof t === 'object' && t.topic) ? t.topic : t;
                    if (typeof topicName === 'string') {
                        sourceTopicsSet.add(topicName.trim());
                    }
                });
            }
        });

        // B. Summaries (Conteúdo gerado)
        const summariesSnapshot = await db.collection('summaries')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .get();

        summariesSnapshot.docs.forEach(doc => {
            const content = doc.data().content || '';
            const matches = content.match(/##\s+(.+)/g) || [];
            matches.forEach(m => sourceTopicsSet.add(m.replace(/##\s+/, '').trim()));
        });

        // C. Mindmaps
        const mindmapsSnapshot = await db.collection('mindmaps')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .get();

        mindmapsSnapshot.docs.forEach(doc => {
            const md = doc.data().markdown || '';
            const matches = md.match(/#{1,3}\s+(.+)/g) || [];
            matches.forEach(m => sourceTopicsSet.add(m.replace(/#{1,3}\s+/, '').trim()));
        });

        const allSourceTopics = Array.from(sourceTopicsSet).sort();
        console.log(`\n📌 LISTA COMPLETA DE TÓPICOS ENCONTRADOS NAS FONTES (${allSourceTopics.length}):`);
        allSourceTopics.forEach(t => console.log(`   • ${t}`));


        // ---------------------------------------------------------
        // 2. Extrair Tópicos de TODAS as Perguntas (O que CAIU)
        // ---------------------------------------------------------
        console.log('\n\n📝 2. LEVANTAMENTO DE PERGUNTAS GERADAS (TODOS OS QUIZZES)');
        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            // .limit(500) // Remover limite para pegar TUDO
            .get();

        if (questionsSnapshot.empty) {
            console.log('   ❌ Nenhuma pergunta encontrada neste projeto.');
            return;
        }

        const stats = {
            totalQuestions: questionsSnapshot.size,
            topicsCovered: {}, // { "TopicName": count }
            sessions: new Set()
        };

        questionsSnapshot.docs.forEach(doc => {
            const q = doc.data();
            const topic = q.topico ? q.topico.trim() : '(Sem Tópico)';

            stats.topicsCovered[topic] = (stats.topicsCovered[topic] || 0) + 1;
            if (q.session_id) stats.sessions.add(q.session_id);
        });

        console.log(`   🔢 Total de Perguntas Analisadas: ${stats.totalQuestions}`);
        console.log(`   🔄 Total de Quizzes (Sessões): ${stats.sessions.size}`);

        console.log('\n📌 FREQUÊNCIA DE TÓPICOS NAS PERGUNTAS:');
        const sortedQuestionTopics = Object.entries(stats.topicsCovered)
            .sort(([, a], [, b]) => b - a); // Order by count desc

        sortedQuestionTopics.forEach(([topic, count]) => {
            console.log(`   • ${topic}: ${count} questões`);
        });


        // ---------------------------------------------------------
        // 3. ANÁLISE DE LACUNAS (GAP ANALYSIS)
        // ---------------------------------------------------------
        console.log('\n\n⚠️ 3. TÓPICOS IGNORADOS (GAP ANALYSIS)');
        console.log('   (Tópicos presentes nas fontes mas com ZERO perguntas)');
        console.log('   -----------------------------------------------------');

        const ignoredTopics = allSourceTopics.filter(sourceTopic => {
            // Check fuzzy match against all question topics
            const isCovered = Object.keys(stats.topicsCovered).some(qTopic =>
                qTopic.toLowerCase().includes(sourceTopic.toLowerCase()) ||
                sourceTopic.toLowerCase().includes(qTopic.toLowerCase())
            );
            return !isCovered;
        });

        if (ignoredTopics.length === 0) {
            console.log('   ✅ Incrível! Todos os tópicos das fontes foram abordados pelo menos uma vez.');
        } else {
            ignoredTopics.forEach(t => console.log(`   ❌ ${t}`));

            // Destaque específico para "Animais Venenosos" se solicitado
            const animalsRelated = ignoredTopics.filter(t =>
                t.toLowerCase().includes('animais') ||
                t.toLowerCase().includes('veneno') ||
                t.toLowerCase().includes('peçonhentos')
            );

            if (animalsRelated.length > 0) {
                console.log('\n   🕷️ CONFIRMADO: Tópicos sobre animais venenosos foram detectados na fonte mas ignorados nas perguntas.');
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('RELATÓRIO CONCLUÍDO');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    }
}

deepAnalyzeTopics();
