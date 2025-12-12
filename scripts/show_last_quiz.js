
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

async function showLastQuizQuestions() {
    try {
        console.log(`🔍 PERGUNTAS DO ÚLTIMO QUIZ GERADO\n`);

        // Pegar a última questão para descobrir o session_id mais recente
        const lastQ = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .orderBy('created_at', 'desc')
            .limit(1)
            .get();

        if (lastQ.empty) {
            console.log('Nenhuma questão encontrada.');
            return;
        }

        const lastSessionId = lastQ.docs[0].data().session_id;
        const lastDate = lastQ.docs[0].data().created_at.toDate();

        console.log(`📅 Data: ${lastDate.toLocaleString()}`);
        console.log(`🆔 ID da Sessão: ${lastSessionId}\n`);

        // Buscar TODAS as questões dessa sessão
        const sessionQuestions = await db.collection('questions')
            .where('session_id', '==', lastSessionId)
            .get();

        console.log(`📝 Total de Questões: ${sessionQuestions.size}`);
        console.log('-'.repeat(60));

        const questions = sessionQuestions.docs.map(d => d.data());

        // Filtrar as de cobras
        const snakeQuestions = questions.filter(q =>
            (q.topico && q.topico.includes('Ofídic')) ||
            (q.pergunta && (q.pergunta.includes('serpente') || q.pergunta.includes('cobra') || q.pergunta.includes('veneno')))
        );

        if (snakeQuestions.length > 0) {
            console.log(`\n🐍 QUESTÕES SOBRE ANIMAIS/SERPENTES ENCONTRADAS NESTA SESSÃO:`);
            snakeQuestions.forEach((q, i) => {
                console.log(`\n   [${i + 1}] Tópico: ${q.topico}`);
                console.log(`       Pergunta: ${q.pergunta}`);
                console.log(`       Resposta Correta: ${q.resposta_correta}`);
            });
        } else {
            console.log(`\n❌ NENHUMA questão sobre serpentes/veneno encontrada nesta sessão específica.`);
        }

        console.log('\n' + '-'.repeat(60));
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

showLastQuizQuestions();
