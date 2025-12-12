
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
const TARGET_TOPIC_KEYWORD = 'Ofídicos'; // Palavra-chave do tópico suspeito

async function debugTopicsAndQuestions() {
    try {
        console.log(`🔍 DEBUG DE CONTEÚDO - Projeto: ${TARGET_PROJECT_ID}\n`);

        // 1. Inspecionar o Resumo (Summary)
        console.log('📄 CONTEÚDO DO RESUMO (Primeiros 1000 chars):');
        const summaryDoc = await db.collection('summaries')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .limit(1)
            .get();

        if (!summaryDoc.empty) {
            const content = summaryDoc.docs[0].data().content || '';
            console.log(content.substring(0, 1000));
            console.log('\n--- Fim do Preview ---\n');

            // Testar regex manual no console
            const hashMatches = content.match(/##\s+(.+)/g) || [];
            console.log(`Regex ##: ${hashMatches.length} matches`);
            const boldMatches = content.match(/\*\*(.+?)\*\*/g) || [];
            console.log(`Regex **: ${boldMatches.length} matches`);
        } else {
            console.log('❌ Resumo não encontrado.');
        }


        // 2. Inspecionar Perguntas do Tópico "Acidentes Ofídicos"
        console.log(`\n\n🐍 PERGUNTAS SOBRE "${TARGET_TOPIC_KEYWORD}":`);
        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .get(); // Pegar todas e filtrar em memória para ver flexibilidade

        const poisonQuestions = questionsSnapshot.docs.filter(d => {
            const t = d.data().topico || '';
            return t.includes(TARGET_TOPIC_KEYWORD);
        });

        if (poisonQuestions.length > 0) {
            console.log(`✅ Encontradas ${poisonQuestions.length} questões.`);
            poisonQuestions.slice(0, 3).forEach((d, i) => {
                const q = d.data();
                console.log(`\n[Questão ${i + 1}] Session: ${q.session_id}`);
                console.log(`   Pergunta: ${q.pergunta}`);
                console.log(`   Resposta: ${q.resposta_correta}`);
                console.log(`   Justificativa: ${q.justificativa}`);
            });
        } else {
            console.log('❌ Nenhuma questão encontrada com essa palavra-chave no tópico.');
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro fatal:', error);
        process.exit(1);
    }
}

debugTopicsAndQuestions();
