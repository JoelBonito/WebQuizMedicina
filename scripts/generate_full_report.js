
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
const OUTPUT_DIR = path.join(process.cwd(), 'docs');

async function generateReports() {
    try {
        console.log(`📊 GERANDO RELATÓRIOS COMPLETOS - Projeto: ${TARGET_PROJECT_ID}\n`);

        // ---------------------------------------------------------
        // 1. RELATÓRIO DE TÓPICOS DAS FONTES
        // ---------------------------------------------------------
        console.log('1️⃣ Extraindo tópicos das fontes...');
        const sourceTopics = new Set();

        // Sources (Metadata)
        const sourcesSnapshot = await db.collection('sources')
            .where('project_id', '==', TARGET_PROJECT_ID).get();
        sourcesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.topics && Array.isArray(data.topics)) {
                data.topics.forEach(t => sourceTopics.add(typeof t === 'string' ? t : t.topic));
            }
        });

        // Summaries
        const summariesSnapshot = await db.collection('summaries')
            .where('project_id', '==', TARGET_PROJECT_ID).get();
        summariesSnapshot.docs.forEach(doc => {
            const matches = (doc.data().content || '').match(/##\s+(.+)/g) || [];
            matches.forEach(m => sourceTopics.add(m.replace(/##\s+/, '').trim()));
        });

        // Mindmaps
        const mindmapsSnapshot = await db.collection('mindmaps')
            .where('project_id', '==', TARGET_PROJECT_ID).get();
        mindmapsSnapshot.docs.forEach(doc => {
            const matches = (doc.data().markdown || '').match(/#{1,3}\s+(.+)/g) || [];
            matches.forEach(m => sourceTopics.add(m.replace(/#{1,3}\s+/, '').trim()));
        });

        let sourceTable = `# Relatório de Tópicos das Fontes\n\n| ID | Tópico Extraído |\n|--- | --- |\n`;
        const sortedTopics = Array.from(sourceTopics).sort();
        sortedTopics.forEach((t, i) => {
            sourceTable += `| ${i + 1} | ${t} |\n`;
        });

        fs.writeFileSync(path.join(OUTPUT_DIR, 'report_topics_sources.md'), sourceTable);
        console.log('✅ Relatório de fontes salvo em docs/report_topics_sources.md');


        // ---------------------------------------------------------
        // 2. RELATÓRIO DE QUIZZES (PERGUNTAS)
        // ---------------------------------------------------------
        console.log('2️⃣ Extraindo histórico de quizzes...');

        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .orderBy('created_at', 'desc')
            .get();

        // Agrupar por sessão
        const sessions = {};
        questionsSnapshot.docs.forEach(doc => {
            const q = doc.data();
            const sid = q.session_id || 'sem_sessao';
            if (!sessions[sid]) sessions[sid] = [];
            sessions[sid].push(q);
        });

        let quizTable = `# Relatório Histórico de Quizzes\n\n`;

        Object.keys(sessions).forEach((sid, idx) => {
            const questions = sessions[sid];
            const date = questions[0].created_at.toDate().toLocaleString('pt-BR');

            quizTable += `## Quiz ${idx + 1} - ${date}\n`;
            quizTable += `**ID da Sessão:** ${sid}\n\n`;
            quizTable += `| # | Tópico (BD) | Pergunta (Texto) | Consistência |\n|---|---|---|---|\n`;

            questions.forEach((q, i) => {
                const topic = q.topico || '(Sem Tópico)';
                const text = q.pergunta || '';

                // Checagem simples de consistência
                // Se o tópico fala de cobra/veneno e a pergunta não tem palavras-chave
                let consistencia = '✅ OK';
                const topicLower = topic.toLowerCase();
                const textLower = text.toLowerCase();

                if (topicLower.includes('ofídic') || topicLower.includes('serpente')) {
                    if (!textLower.includes('serpente') && !textLower.includes('cobra') && !textLower.includes('veneno') && !textLower.includes('picada')) {
                        consistencia = '❌ **INCONSISTENTE** (Pergunta não cita cobras)';
                    }
                }

                quizTable += `| ${i + 1} | ${topic} | ${text.substring(0, 80)}... | ${consistencia} |\n`;
            });
            quizTable += `\n---\n\n`;
        });

        fs.writeFileSync(path.join(OUTPUT_DIR, 'report_quizzes_history.md'), quizTable);
        console.log('✅ Relatório de quizzes salvo em docs/report_quizzes_history.md');

        process.exit(0);

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

generateReports();
