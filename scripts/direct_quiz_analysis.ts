#!/usr/bin/env tsx

/**
 * Script Direto para Análise de Qualidade do Quiz
 * Acessa Firestore diretamente via Admin SDK
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Inicializar Firebase Admin
const serviceAccountPath = path.join(__dirname, '../service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

interface QuizQuestion {
    id: string;
    pergunta: string;
    topico: string | null;
    dificuldade: string;
    tipo: string;
    opcoes: string[];
    resposta_correta: string;
    justificativa: string | null;
    created_at: Date;
}

async function analyzeQuizQuality() {
    try {
        console.log('🔍 Iniciando análise de qualidade do quiz...\n');

        // Parâmetros da análise
        const email = 'renata@medicina.com';
        const projectName = 'Fisiopatologia Final';
        const targetTime = '2025-12-09T21:51:00';

        // 1. Buscar usuário
        console.log(`📧 Buscando usuário ${email}...`);
        const userProfilesSnapshot = await db
            .collection('user_profiles')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (userProfilesSnapshot.empty) {
            console.error(`❌ Usuário ${email} não encontrado!`);
            return;
        }

        const userId = userProfilesSnapshot.docs[0].id;
        console.log(`✅ Usuário encontrado: ${userId}\n`);

        // 2. Buscar projeto
        console.log(`📂 Buscando projeto "${projectName}"...`);
        const projectsSnapshot = await db
            .collection('projects')
            .where('user_id', '==', userId)
            .get();

        const project = projectsSnapshot.docs.find(doc =>
            doc.data().title.toLowerCase().includes(projectName.toLowerCase())
        );

        if (!project) {
            console.error(`❌ Projeto "${projectName}" não encontrado!`);
            console.log('Projetos disponíveis:');
            projectsSnapshot.docs.forEach(doc => {
                console.log(`  - ${doc.data().title} (ID: ${doc.id})`);
            });
            return;
        }

        const projectId = project.id;
        const projectData = project.data();
        console.log(`✅ Projeto encontrado: ${projectData.title} (ID: ${projectId})\n`);

        // 3. Buscar quiz pelo horário
        console.log('🕐 Buscando quiz...');
        const target = new Date(targetTime);
        const start_time = new Date(target);
        start_time.setMinutes(target.getMinutes() - 5);
        const end_time = new Date(target);
        end_time.setMinutes(target.getMinutes() + 5);

        let quizQuestions: QuizQuestion[] = [];

        // Tentar buscar no intervalo de ±5 minutos
        const questionsNearTarget = await db
            .collection('questions')
            .where('project_id', '==', projectId)
            .where('created_at', '>=', admin.firestore.Timestamp.fromDate(start_time))
            .where('created_at', '<=', admin.firestore.Timestamp.fromDate(end_time))
            .orderBy('created_at', 'desc')
            .get();

        if (questionsNearTarget.empty) {
            console.log('⚠️  Nenhum quiz encontrado nesse horário exato.');
            console.log('Buscando TODOS os quizzes de hoje...\n');

            const todayStart = new Date(target);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(target);
            todayEnd.setHours(23, 59, 59, 999);

            const allTodayQuestions = await db
                .collection('questions')
                .where('project_id', '==', projectId)
                .where('created_at', '>=', admin.firestore.Timestamp.fromDate(todayStart))
                .where('created_at', '<=', admin.firestore.Timestamp.fromDate(todayEnd))
                .orderBy('created_at', 'desc')
                .get();

            console.log(`📊 Total de questões geradas hoje: ${allTodayQuestions.size}\n`);

            // Agrupar por session_id
            const sessionMap: { [key: string]: QuizQuestion[] } = {};
            allTodayQuestions.docs.forEach(doc => {
                const data = doc.data();
                const sessionId = data.session_id || 'sem_sessao';
                if (!sessionMap[sessionId]) {
                    sessionMap[sessionId] = [];
                }
                sessionMap[sessionId].push({
                    id: doc.id,
                    ...data,
                    created_at: data.created_at.toDate(),
                } as QuizQuestion);
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
            let closestSession: string | null = null;
            let smallestDiff = Infinity;

            Object.keys(sessionMap).forEach(sessionId => {
                const questions = sessionMap[sessionId];
                if (questions.length >= 15) {
                    const firstQuestion = questions[0];
                    const diff = Math.abs(firstQuestion.created_at.getTime() - target.getTime());
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
            quizQuestions = sessionMap[closestSession].slice(0, 20);
        } else {
            console.log(`✅ Encontradas ${questionsNearTarget.size} questões no horário especificado\n`);
            quizQuestions = questionsNearTarget.docs.slice(0, 20).map(doc => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at.toDate(),
            })) as QuizQuestion[];
        }

        // 4. Buscar fontes de referência
        console.log('📚 Buscando fontes de referência...');

        const summariesSnapshot = await db
            .collection('summaries')
            .where('project_id', '==', projectId)
            .orderBy('created_at', 'desc')
            .limit(1)
            .get();

        const mindmapsSnapshot = await db
            .collection('mindmaps')
            .where('project_id', '==', projectId)
            .orderBy('created_at', 'desc')
            .limit(1)
            .get();

        const sourceTopics = new Set<string>();

        if (!summariesSnapshot.empty) {
            const summary = summariesSnapshot.docs[0].data();
            console.log('✅ Resumo encontrado!');

            const summaryContent = summary.content || '';
            const topicMatches = summaryContent.match(/##\s+(.+)/g) || [];
            topicMatches.forEach((match: string) => {
                const topic = match.replace(/##\s+/, '').trim();
                sourceTopics.add(topic);
            });

            console.log(`📋 Tópicos identificados no resumo: ${sourceTopics.size}`);
        }

        if (!mindmapsSnapshot.empty) {
            const mindmap = mindmapsSnapshot.docs[0].data();
            console.log('✅ Mapa mental encontrado!');

            const mindmapContent = mindmap.markdown || '';
            const topicMatches = mindmapContent.match(/#{1,3}\s+(.+)/g) || [];
            topicMatches.forEach((match: string) => {
                const topic = match.replace(/#{1,3}\s+/, '').trim();
                sourceTopics.add(topic);
            });

            console.log(`📋 Tópicos identificados no mapa mental: ${sourceTopics.size}`);
        }

        console.log();

        // 5. Análise das questões
        console.log('\n' + '='.repeat(80));
        console.log('📊 ANÁLISE DE QUALIDADE DO QUIZ');
        console.log('='.repeat(80) + '\n');

        console.log(`📁 Projeto: ${projectData.title}`);
        console.log(`📅 Data do Quiz: ${quizQuestions[0].created_at.toLocaleString('pt-BR')}`);
        console.log(`📝 Total de Questões Analisadas: ${quizQuestions.length}\n`);

        const questionTopics = new Set<string>();
        const questionsReport: any[] = [];

        console.log('\n' + '-'.repeat(80));
        console.log('📝 QUESTÕES DO QUIZ');
        console.log('-'.repeat(80) + '\n');

        quizQuestions.forEach((q, index) => {
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

        // 6. Análise de cobertura de tópicos
        console.log('\n' + '='.repeat(80));
        console.log('📊 ANÁLISE DE COBERTURA DE TÓPICOS');
        console.log('='.repeat(80) + '\n');

        const sourceTopicsArray = Array.from(sourceTopics);
        const questionTopicsArray = Array.from(questionTopics);

        console.log(`🎯 Tópicos na fonte (resumo/mapa mental): ${sourceTopicsArray.length}`);
        console.log(`📝 Tópicos cobertos no quiz: ${questionTopicsArray.length}\n`);

        console.log('📚 Tópicos da fonte:');
        sourceTopicsArray.forEach((topic, i) => {
            const covered = questionTopicsArray.some(qt =>
                qt.toLowerCase().includes(topic.toLowerCase()) ||
                topic.toLowerCase().includes(qt.toLowerCase())
            );
            console.log(`${covered ? '✅' : '❌'} ${i + 1}. ${topic}`);
        });

        console.log('\n📝 Tópicos presentes no quiz:');
        const topicDistribution: { [key: string]: number } = {};
        quizQuestions.forEach(q => {
            const topic = q.topico || 'Sem tópico definido';
            topicDistribution[topic] = (topicDistribution[topic] || 0) + 1;
        });

        questionTopicsArray.forEach((topic, i) => {
            const count = topicDistribution[topic];
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
            projeto: projectData.title,
            data_quiz: quizQuestions[0].created_at.toISOString(),
            total_questoes: quizQuestions.length,
            estatisticas: {
                topicos_fonte: sourceTopicsArray.length,
                topicos_quiz: questionTopicsArray.length,
                topicos_nao_cobertos: uncoveredTopics.length,
                taxa_cobertura: sourceTopicsArray.length > 0
                    ? ((questionTopicsArray.length / sourceTopicsArray.length) * 100).toFixed(2) + '%'
                    : 'N/A'
            },
            questoes: questionsReport,
            topicos_fonte: sourceTopicsArray,
            topicos_quiz: questionTopicsArray,
            topicos_nao_cobertos: uncoveredTopics,
            distribuicao_topicos: topicDistribution
        };

        const reportPath = path.join(__dirname, '../docs/quiz_quality_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

        console.log(`\n💾 Relatório completo salvo em: ${reportPath}`);
        console.log('\n' + '='.repeat(80));

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na análise:', error);
        process.exit(1);
    }
}

// Executar análise
analyzeQuizQuality();
