
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

async function analyzeSessions() {
    try {
        console.log(`📊 ANÁLISE CRONOLÓGICA DE SESSÕES - Projeto: ${TARGET_PROJECT_ID}\n`);

        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', TARGET_PROJECT_ID)
            .orderBy('created_at', 'desc') // Do mais recente para o mais antigo
            .get();

        if (questionsSnapshot.empty) {
            console.log('❌ Nenhuma pergunta encontrada.');
            return;
        }

        // Agrupar por Session ID
        const sessions = {}; // { sessionId: { date, topics: { name: count }, total: 0 } }

        questionsSnapshot.docs.forEach(doc => {
            const q = doc.data();
            const sid = q.session_id || 'sem_sessao_' + q.created_at.toDate().toISOString().split('T')[0];

            if (!sessions[sid]) {
                sessions[sid] = {
                    date: q.created_at.toDate(),
                    topics: {},
                    total: 0,
                    questionIds: []
                };
            }

            const group = sessions[sid];
            const topic = q.topico ? q.topico.trim() : '(Sem Tópico)';

            group.topics[topic] = (group.topics[topic] || 0) + 1;
            group.total++;
            group.questionIds.push(doc.id);
        });

        // Exibir relatório
        const sessionIds = Object.keys(sessions).sort((a, b) => sessions[b].date - sessions[a].date);

        console.log(`Encontradas ${sessionIds.length} sessões de quiz geradas.\n`);

        sessionIds.forEach((sid, index) => {
            const s = sessions[sid];
            console.log(`🗓️  SESSÃO ${index + 1} - ${s.date.toLocaleString('pt-BR')} (ID: ${sid.substring(0, 8)}...)`);
            console.log(`    Total de Questões: ${s.total}`);
            console.log(`    Distribuição de Tópicos:`);

            let hasVenomous = false;
            Object.entries(s.topics)
                .sort(([, a], [, b]) => b - a)
                .forEach(([topic, count]) => {
                    const isVenomous = topic.toLowerCase().includes('ofídic') ||
                        topic.toLowerCase().includes('animal') ||
                        topic.toLowerCase().includes('veneno') ||
                        topic.toLowerCase().includes('peçonhento');
                    if (isVenomous) hasVenomous = true;

                    const marker = isVenomous ? '🐍' : '  ';
                    console.log(`    ${marker} ${topic}: ${count}`);
                });

            if (!hasVenomous) {
                console.log(`    ⚠️ ALERTA: Nenhum tópico sobre animais peçonhentos/ofídicos nesta sessão.`);
            }
            console.log('-'.repeat(50) + '\n');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

analyzeSessions();
