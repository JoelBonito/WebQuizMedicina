
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Tentar carregar service account
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ service-account.json não encontrado na raiz.');
    process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function diagnoseLatestQuiz() {
    try {
        console.log('🔍 Iniciando diagnóstico do quiz mais recente...');

        // 1. Encontrar a última questão criada no sistema
        const questionsSnapshot = await db.collection('questions')
            .orderBy('created_at', 'desc')
            .limit(1)
            .get();

        if (questionsSnapshot.empty) {
            console.error('❌ Nenhuma questão encontrada no banco de dados.');
            return;
        }

        const latestQuestion = questionsSnapshot.docs[0].data();
        const projectId = latestQuestion.project_id;
        const targetTime = latestQuestion.created_at.toDate();

        console.log(`✅ Última questão encontrada: ${questionsSnapshot.docs[0].id}`);
        console.log(`📅 Data: ${targetTime.toLocaleString()}`);
        console.log(`🆔 Project ID: ${projectId}`);

        // 2. Buscar informações do projeto
        const projectDoc = await db.collection('projects').doc(projectId).get();
        if (!projectDoc.exists) {
            console.error('❌ Projeto associado não encontrado.');
            return;
        }
        const project = projectDoc.data();
        console.log(`📁 Projeto: ${project?.title || 'Sem título'}`);

        // 3. Buscar todas as questões desse quiz (mesmo session_id ou horário próximo)
        let quizQuestions = [];
        const sessionId = latestQuestion.session_id;

        if (sessionId) {
            console.log(`🔖 Session ID encontrado: ${sessionId}`);
            const sessionQuestions = await db.collection('questions')
                .where('session_id', '==', sessionId)
                .get();
            quizQuestions = sessionQuestions.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            console.log('⚠️ Sem Session ID, buscando por janela de tempo (±5 min)');
            const startTime = new Date(targetTime); startTime.setMinutes(targetTime.getMinutes() - 5);
            const endTime = new Date(targetTime); endTime.setMinutes(targetTime.getMinutes() + 5);

            const timeQuestions = await db.collection('questions')
                .where('project_id', '==', projectId)
                .where('created_at', '>=', startTime)
                .where('created_at', '<=', endTime)
                .get();
            quizQuestions = timeQuestions.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        console.log(`📚 Total de questões no quiz: ${quizQuestions.length}`);

        // 4. Buscar Fontes (Summaries, Mindmaps, e agora Sources raw content se necessário)
        console.log('🕵️ Buscando fontes de conteúdo...');

        const sourceTopics = new Set();

        // A. Resumos
        const summariesSnapshot = await db.collection('summaries')
            .where('project_id', '==', projectId)
            .orderBy('created_at', 'desc')
            .get();

        console.log(`📄 Resumos encontrados: ${summariesSnapshot.size}`);
        summariesSnapshot.docs.forEach((doc, idx) => {
            const content = doc.data().content || '';
            console.log(`   [Resumo ${idx + 1}] Tamanho: ${content.length} chars`);
            // Tentar extrair tópicos
            const matches = content.match(/##\s+(.+)/g) || [];
            if (matches.length > 0) {
                console.log(`   ✅ ${matches.length} tópicos detectados via Regex (## )`);
                matches.forEach(m => sourceTopics.add(m.replace(/##\s+/, '').trim()));
            } else {
                console.log(`   ⚠️ Nenhum tópico detectado com regex padrão.`);
                if (idx === 0) console.log(`   🔎 Amostra do conteúdo: ${content.substring(0, 200)}...`);
            }
        });

        // B. Mindmaps
        const mindmapsSnapshot = await db.collection('mindmaps')
            .where('project_id', '==', projectId)
            .orderBy('created_at', 'desc')
            .get();

        console.log(`🧠 Mapas mentais encontrados: ${mindmapsSnapshot.size}`);
        mindmapsSnapshot.docs.forEach((doc, idx) => {
            const markdown = doc.data().markdown || '';
            // Tentar extrair tópicos
            const matches = markdown.match(/#{1,3}\s+(.+)/g) || [];
            if (matches.length > 0) {
                console.log(`   ✅ ${matches.length} tópicos detectados via Regex (#{1,3})`);
                matches.forEach(m => sourceTopics.add(m.replace(/#{1,3}\s+/, '').trim()));
            }
        });

        const extractedSourceTopics = Array.from(sourceTopics);
        console.log(`📋 Total de tópicos únicos nas fontes: ${extractedSourceTopics.length}`);
        if (extractedSourceTopics.length > 0) {
            console.log(`   Exemplos: ${extractedSourceTopics.slice(0, 5).join(', ')}`);
        } else {
            // Tentar buscar fontes 'sources' se não achou nada em resumos/mapas
            const sourcesSnapshot = await db.collection('sources')
                .where('project_id', '==', projectId)
                .get();
            console.log(`📦 Sources brutos encontrados: ${sourcesSnapshot.size}`);
            // Não vamos ler o conteúdo bruto aqui pois pode ser enorme, mas serve de aviso
        }

        // 5. Comparar Tópicos
        console.log('\n⚖️ Análise de Cobertura:');
        const questionTopics = new Set();
        const topicsCount = {};

        quizQuestions.forEach(q => {
            const t = q.topico ? q.topico.trim() : 'Sem Tópico';
            questionTopics.add(t);
            topicsCount[t] = (topicsCount[t] || 0) + 1;
        });

        const qTopicsList = Array.from(questionTopics);
        console.log(`📌 Tópicos abordados nas questões (${qTopicsList.length}):`);
        qTopicsList.forEach(t => console.log(`   - ${t} (${topicsCount[t]} questões)`));

        // Cruzamento
        if (extractedSourceTopics.length > 0) {
            const covered = extractedSourceTopics.filter(st =>
                qTopicsList.some(qt => qt.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(qt.toLowerCase()))
            );

            const coveragePct = (covered.length / extractedSourceTopics.length) * 100;
            console.log(`\n✅ Cobertura estimada: ${coveragePct.toFixed(1)}% (${covered.length}/${extractedSourceTopics.length} tópicos das fontes)`);

            // Listar não cobertos
            const uncovered = extractedSourceTopics.filter(st =>
                !qTopicsList.some(qt => qt.toLowerCase().includes(st.toLowerCase()) || st.toLowerCase().includes(qt.toLowerCase()))
            );
            if (uncovered.length > 0) {
                console.log(`\n⚠️ Top 5 Tópicos NÃO cobertos:`);
                uncovered.slice(0, 5).forEach(t => console.log(`   - ${t}`));
            }

        } else {
            console.log('\n⚠️ Impossível calcular cobertura: Nenhum tópico extraído das fontes.');
        }

        // 6. Validar Consistência das Perguntas (Heurísticas básicas)
        console.log('\n🧐 Verificação de Qualidade das Perguntas:');
        let issues = 0;
        quizQuestions.forEach((q, i) => {
            const num = i + 1;
            // Checar se tem resposta correta
            if (!q.resposta_correta) {
                console.log(`❌ Questão ${num}: Sem resposta correta definida.`);
                issues++;
            }
            // Checar se a resposta está nas opções
            // Parse opções se forem strings JSON ou arrays
            let cleanOptions = q.opcoes;
            if (typeof q.opcoes === 'string') {
                try { cleanOptions = JSON.parse(q.opcoes); } catch (e) { }
            }

            if (Array.isArray(cleanOptions)) {
                // Heuristica simples: verificar se a letra ou o texto bate
                const match = cleanOptions.some(opt =>
                    opt.startsWith(q.resposta_correta) ||
                    opt === q.resposta_correta ||
                    (q.tipo === 'verdadeiro_falso')
                );
                if (!match && q.tipo !== 'verdadeiro_falso') {
                    console.log(`⚠️ Questão ${num}: Resposta '${q.resposta_correta}' pode não estar clara nas opções.`);
                }
            } else {
                console.log(`❌ Questão ${num}: Opções não são um array válido.`);
                issues++;
            }

            // Justificativa
            if (!q.justificativa || q.justificativa.length < 10) {
                console.log(`⚠️ Questão ${num}: Justificativa muito curta ou ausente.`);
            }
        });

        if (issues === 0) console.log('✅ Nenhuma falha estrutural grave detectada nas questões.');

    } catch (error) {
        console.error('❌ Erro fatal no script:', error);
    }
}

diagnoseLatestQuiz();
