const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const projectId = 'Nx7psBo0MlYtqeBfh4Od';

async function checkLastTwoQuizzes() {
    console.log('🔍 Buscando os 2 últimos quizzes do projeto...\n');

    // Buscar todas as perguntas do projeto, ordenadas por data de criação
    const questionsSnapshot = await db.collection('questions')
        .where('project_id', '==', projectId)
        .orderBy('created_at', 'desc')
        .limit(100) // Pegar mais perguntas para garantir que pegamos 2 sessões completas
        .get();

    if (questionsSnapshot.empty) {
        console.log('❌ Nenhuma pergunta encontrada.');
        process.exit(0);
    }

    // Agrupar por session_id
    const sessionMap = new Map();
    questionsSnapshot.forEach(doc => {
        const data = doc.data();
        const sessionId = data.session_id;

        if (!sessionMap.has(sessionId)) {
            sessionMap.set(sessionId, {
                session_id: sessionId,
                created_at: data.created_at,
                questions: []
            });
        }

        sessionMap.get(sessionId).questions.push({
            id: doc.id,
            pergunta: data.pergunta.substring(0, 80) + '...',
            topico: data.topico,
            dificuldade: data.dificuldade,
            tipo: data.tipo
        });
    });

    // Ordenar sessões por data (mais recente primeiro)
    const sessions = Array.from(sessionMap.values())
        .sort((a, b) => b.created_at.toMillis() - a.created_at.toMillis())
        .slice(0, 2); // Pegar apenas as 2 mais recentes

    console.log(`📊 Total de sessões encontradas: ${sessionMap.size}`);
    console.log(`📋 Analisando as 2 mais recentes:\n`);

    sessions.forEach((session, index) => {
        const date = session.created_at.toDate();
        console.log(`${'='.repeat(80)}`);
        console.log(`🎯 QUIZ ${index + 1} - Session: ${session.session_id}`);
        console.log(`📅 Data: ${date.toLocaleString('pt-BR')}`);
        console.log(`📝 Total de perguntas: ${session.questions.length}`);
        console.log(`${'='.repeat(80)}\n`);

        // Contar tópicos
        const topicCount = {};
        session.questions.forEach(q => {
            const topic = q.topico || 'Sem tópico';
            topicCount[topic] = (topicCount[topic] || 0) + 1;
        });

        console.log('📊 DISTRIBUIÇÃO DE TÓPICOS:');
        Object.entries(topicCount)
            .sort((a, b) => b[1] - a[1])
            .forEach(([topic, count]) => {
                console.log(`   ${count.toString().padStart(2, ' ')}x - ${topic}`);
            });

        console.log('\n📝 LISTA DE PERGUNTAS:');
        session.questions.forEach((q, i) => {
            console.log(`   ${(i + 1).toString().padStart(2, ' ')}. [${q.topico}] ${q.pergunta}`);
        });
        console.log('\n');
    });

    // Verificar se "Acidentes Ofídicos" aparece
    const hasOfidicos = sessions.some(s =>
        s.questions.some(q =>
            q.topico && q.topico.toLowerCase().includes('ofídico')
        )
    );

    console.log(`${'='.repeat(80)}`);
    if (hasOfidicos) {
        console.log('✅ TÓPICO "Acidentes Ofídicos" ENCONTRADO nos últimos quizzes!');
    } else {
        console.log('⚠️  TÓPICO "Acidentes Ofídicos" NÃO encontrado nos últimos quizzes.');
        console.log('   (Isso pode ser esperado se os quizzes foram gerados antes da correção)');
    }
    console.log(`${'='.repeat(80)}`);

    process.exit(0);
}

checkLastTwoQuizzes().catch(error => {
    console.error('❌ Erro:', error);
    process.exit(1);
});
