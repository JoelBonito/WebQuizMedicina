const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializar Firebase Admin
const serviceAccountPath = path.join(__dirname, '../service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

/**
 * Script para Análise de Qualidade do Quiz
 * 
 * Objetivo: Extrair dados do quiz específico e comparar com tópicos da fonte
 * 
 * Dados necessários:
 * - Usuário: renata@medicina.com
 * - Projeto: "Fisiopatologia Final"
 * - Quiz: 20 questões geradas às 21h51 de hoje (09/12/2025)
 */

async function analyzeQuizQuality() {
    try {
        console.log('🔍 Iniciando análise de qualidade do quiz...\n');

        // 1. Buscar usuário pelo email
        console.log('📧 Buscando usuário renata@medicina.com...');
        const userProfilesSnapshot = await db.collection('user_profiles')
            .where('email', '==', 'renata@medicina.com')
            .limit(1)
            .get();

        if (userProfilesSnapshot.empty) {
            console.error('❌ Usuário renata@medicina.com não encontrado!');
            return;
        }

        const userProfile = userProfilesSnapshot.docs[0];
        const userId = userProfile.id;
        console.log(`✅ Usuário encontrado: ${userId}\n`);

        // 2. Buscar projeto "Fisiopatologia Final"
        console.log('📂 Buscando projeto "Fisiopatologia Final"...');
        const projectsSnapshot = await db.collection('projects')
            .where('user_id', '==', userId)
            .get();

        const fisiopatologiaProject = projectsSnapshot.docs.find(doc =>
            doc.data().title.toLowerCase().includes('fisiopatologia final')
        );

        if (!fisiopatologiaProject) {
            console.error('❌ Projeto "Fisiopatologia Final" não encontrado!');
            console.log('Projetos disponíveis:');
            projectsSnapshot.docs.forEach(doc => {
                console.log(`  - ${doc.data().title} (ID: ${doc.id})`);
            });
            return;
        }

        const projectId = fisiopatologiaProject.id;
        const projectData = fisiopatologiaProject.data();
        console.log(`✅ Projeto encontrado: ${projectData.title} (ID: ${projectId})\n`);

        // 3. Buscar quiz gerado às 21h51 de hoje
        console.log('🕐 Buscando quiz gerado às 21h51...');

        // Definir intervalo de tempo para busca (21h45 - 21h55)
        const today = new Date('2025-12-09');
        const startTime = new Date(today);
        startTime.setHours(21, 45, 0, 0);
        const endTime = new Date(today);
        endTime.setHours(21, 55, 0, 0);

        console.log(`Buscando questões entre ${startTime.toLocaleString('pt-BR')} e ${endTime.toLocaleString('pt-BR')}`);

        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', projectId)
            .where('created_at', '>=', admin.firestore.Timestamp.fromDate(startTime))
            .where('created_at', '<=', admin.firestore.Timestamp.fromDate(endTime))
            .orderBy('created_at', 'desc')
            .get();

        if (questionsSnapshot.empty) {
            console.log('⚠️  Nenhum quiz encontrado nesse horário exato.');
            console.log('Buscando TODOS os quizzes de hoje...\n');

            const todayStart = new Date(today);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(today);
            todayEnd.setHours(23, 59, 59, 999);

            const allTodayQuestions = await db.collection('questions')
                .where('project_id', '==', projectId)
                .where('created_at', '>=', admin.firestore.Timestamp.fromDate(todayStart))
                .where('created_at', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
                .orderBy('created_at', 'desc')
                .get();

            console.log(`📊 Total de questões geradas hoje: ${allTodayQuestions.size}\n`);

            // Agrupar por session_id
            const sessionMap = {};
            allTodayQuestions.docs.forEach(doc => {
                const data = doc.data();
                const sessionId = data.session_id || 'sem_sessao';
                if (!sessionMap[sessionId]) {
                    sessionMap[sessionId] = [];
                }
                sessionMap[sessionId].push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at.toDate()
                });
            });

            console.log('📋 Sessões de quiz encontradas:');
            Object.keys(sessionMap).forEach(sessionId => {
                const questions = sessionMap[sessionId];
                const firstQuestion = questions[0];
                console.log(`\n🎯 Sessão: ${sessionId}`);
                console.log(`   Horário: ${firstQuestion.created_at.toLocaleString('pt-BR')}`);
                console.log(`   Quantidade: ${questions.length} questões`);
            });

            // Pegar a sessão mais próxima de 21h51
            const target = new Date(today);
            target.setHours(21, 51, 0, 0);

            let closestSession = null;
            let smallestDiff = Infinity;

            Object.keys(sessionMap).forEach(sessionId => {
                const questions = sessionMap[sessionId];
                if (questions.length >= 15) { // Pelo menos 15 questões
                    const firstQuestion = questions[0];
                    const diff = Math.abs(firstQuestion.created_at - target);
                    if (diff < smallestDiff) {
                        smallestDiff = diff;
                        closestSession = sessionId;
                    }
                }
            });

            if (!closestSession) {
                console.error('\n❌ Nenhuma sessão de quiz válida encontrada próxima de 21h51!');
                return;
            }

            console.log(`\n✅ Sessão mais próxima de 21h51 selecionada: ${closestSession}`);
            const quizQuestions = sessionMap[closestSession].slice(0, 20); // Pegar apenas as 20 primeiras

            await analyzeQuestions(quizQuestions, projectId, projectData.title);

        } else {
            console.log(`✅ Encontradas ${questionsSnapshot.size} questões no horário especificado\n`);

            const quizQuestions = questionsSnapshot.docs.slice(0, 20).map(doc => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at.toDate()
            }));

            await analyzeQuestions(quizQuestions, projectId, projectData.title);
        }

    } catch (error) {
        console.error('❌ Erro na análise:', error);
    } finally {
        process.exit(0);
    }
}

async function analyzeQuestions(questions, projectId, projectTitle) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 ANÁLISE DE QUALIDADE DO QUIZ');
    console.log('='.repeat(80) + '\n');

    console.log(`📁 Projeto: ${projectTitle}`);
    console.log(`📅 Data do Quiz: ${questions[0].created_at.toLocaleString('pt-BR')}`);
    console.log(`📝 Total de Questões Analisadas: ${questions.length}\n`);

    // Buscar fonte (resumo ou mapa mental) para comparação
    console.log('📚 Buscando fontes de referência (resumo/mapa mental)...');

    const summariesSnapshot = await db.collection('summaries')
        .where('project_id', '==', projectId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

    const mindmapsSnapshot = await db.collection('mindmaps')
        .where('project_id', '==', projectId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

    let sourceTopics = new Set();

    if (!summariesSnapshot.empty) {
        const summary = summariesSnapshot.docs[0].data();
        console.log('✅ Resumo encontrado!');

        // Extrair tópicos do conteúdo do resumo
        const summaryContent = summary.content || '';
        const topicMatches = summaryContent.match(/##\s+(.+)/g) || [];
        topicMatches.forEach(match => {
            const topic = match.replace(/##\s+/, '').trim();
            sourceTopics.add(topic);
        });

        console.log(`📋 Tópicos identificados no resumo: ${sourceTopics.size}\n`);
    }

    if (!mindmapsSnapshot.empty) {
        const mindmap = mindmapsSnapshot.docs[0].data();
        console.log('✅ Mapa mental encontrado!');

        // Extrair tópicos do markdown do mapa mental
        const mindmapContent = mindmap.markdown || '';
        const topicMatches = mindmapContent.match(/#{1,3}\s+(.+)/g) || [];
        topicMatches.forEach(match => {
            const topic = match.replace(/#{1,3}\s+/, '').trim();
            sourceTopics.add(topic);
        });

        console.log(`📋 Tópicos identificados no mapa mental: ${sourceTopics.size}\n`);
    }

    // Análise das questões
    console.log('\n' + '-'.repeat(80));
    console.log('📝 QUESTÕES DO QUIZ');
    console.log('-'.repeat(80) + '\n');

    const questionTopics = new Set();
    const questionsReport = [];

    questions.forEach((q, index) => {
        const questionNumber = index + 1;
        const topic = q.topico || 'Sem tópico definido';
        questionTopics.add(topic);

        questionsReport.push({
            numero: questionNumber,
            pergunta: q.pergunta,
            topico: topic,
            dificuldade: q.dificuldade,
            tipo: q.tipo,
            opcoes: q.opcoes || [],
            resposta_correta: q.resposta_correta,
            justificativa: q.justificativa || 'Sem justificativa'
        });

        console.log(`\n📌 QUESTÃO ${questionNumber}`);
        console.log(`Tópico: ${topic}`);
        console.log(`Dificuldade: ${q.dificuldade}`);
        console.log(`Tipo: ${q.tipo}`);
        console.log(`\nPergunta: ${q.pergunta}`);

        if (q.opcoes && q.opcoes.length > 0) {
            console.log('\nOpções:');
            q.opcoes.forEach((opt, i) => {
                const marker = opt === q.resposta_correta ? '✅' : '  ';
                console.log(`${marker} ${String.fromCharCode(65 + i)}) ${opt}`);
            });
        }

        console.log(`\nResposta Correta: ${q.resposta_correta}`);
        if (q.justificativa) {
            console.log(`Justificativa: ${q.justificativa}`);
        }
        console.log('-'.repeat(80));
    });

    // Análise de cobertura de tópicos
    console.log('\n' + '='.repeat(80));
    console.log('📊 ANÁLISE DE COBERTURA DE TÓPICOS');
    console.log('='.repeat(80) + '\n');

    console.log(`🎯 Tópicos na fonte (resumo/mapa mental): ${sourceTopics.size}`);
    console.log(`📝 Tópicos cobertos no quiz: ${questionTopics.size}\n`);

    const sourceTopicsArray = Array.from(sourceTopics);
    const questionTopicsArray = Array.from(questionTopics);

    console.log('📚 Tópicos da fonte:');
    sourceTopicsArray.forEach((topic, i) => {
        const covered = questionTopicsArray.some(qt =>
            qt.toLowerCase().includes(topic.toLowerCase()) ||
            topic.toLowerCase().includes(qt.toLowerCase())
        );
        console.log(`${covered ? '✅' : '❌'} ${i + 1}. ${topic}`);
    });

    console.log('\n📝 Tópicos presentes no quiz:');
    questionTopicsArray.forEach((topic, i) => {
        const count = questions.filter(q => q.topico === topic).length;
        console.log(`${i + 1}. ${topic} (${count} questões)`);
    });

    // Tópicos NÃO cobertos
    const uncoveredTopics = sourceTopicsArray.filter(sourceTopic =>
        !questionTopicsArray.some(qt =>
            qt.toLowerCase().includes(sourceTopic.toLowerCase()) ||
            sourceTopic.toLowerCase().includes(qt.toLowerCase())
        )
    );

    if (uncoveredTopics.length > 0) {
        console.log('\n⚠️  TÓPICOS NÃO COBERTOS PELO QUIZ:');
        uncoveredTopics.forEach((topic, i) => {
            console.log(`${i + 1}. ${topic}`);
        });
    } else {
        console.log('\n✅ Todos os tópicos da fonte foram cobertos pelo quiz!');
    }

    // Salvar relatório em JSON
    const report = {
        projeto: projectTitle,
        data_quiz: questions[0].created_at.toISOString(),
        total_questoes: questions.length,
        estatisticas: {
            topicos_fonte: sourceTopicsArray.length,
            topicos_quiz: questionTopicsArray.length,
            topicos_nao_cobertos: uncoveredTopics.length,
            taxa_cobertura: ((questionTopicsArray.length / sourceTopicsArray.length) * 100).toFixed(2) + '%'
        },
        questoes: questionsReport,
        topicos_fonte: sourceTopicsArray,
        topicos_quiz: questionTopicsArray,
        topicos_nao_cobertos: uncoveredTopics
    };

    const reportPath = '/Users/macbookdejoel/Documents/PROJETOS/WebQuizMedicina/WebQuizMedicina/docs/quiz_quality_report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n💾 Relatório completo salvo em: ${reportPath}`);
    console.log('\n' + '='.repeat(80));
}

// Executar análise
analyzeQuizQuality();
