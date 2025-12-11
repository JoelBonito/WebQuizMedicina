/**
 * Cloud Function para Análise de Qualidade do Quiz
 * 
 * Endpoint: POST /analyzeQuizQuality
 * 
 * Body: {
 *   email: "renata@medicina.com",
 *   projectName: "Fisiopatologia Final",
 *   targetTime: "2025-12-09T21:51:00"
 * }
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

interface AnalyzeQuizQualityData {
    email: string;
    projectName: string;
    targetTime: string;
}

export const analyzeQuizQuality = functions
    .region('southamerica-east1')
    .https.onCall(async (data: AnalyzeQuizQualityData, context: functions.https.CallableContext) => {
        try {
            const { email, projectName, targetTime } = data;

            console.log('📊 Iniciando análise de qualidade do quiz...');
            console.log(`Email: ${email}, Projeto: ${projectName}, Horário: ${targetTime}`);

            const db = admin.firestore();

            // 1. Buscar usuário pelo email
            console.log('📧 Buscando usuário...');
            const userProfilesSnapshot = await db
                .collection('user_profiles')
                .where('email', '==', email)
                .limit(1)
                .get();

            if (userProfilesSnapshot.empty) {
                throw new functions.https.HttpsError(
                    'not-found',
                    `Usuário ${email} não encontrado`
                );
            }

            const userProfile = userProfilesSnapshot.docs[0];
            const userId = userProfile.id;
            console.log(`✅ Usuário encontrado: ${userId}`);

            // 2. Buscar projeto por nome
            console.log('📂 Buscando projeto...');
            const projectsSnapshot = await db
                .collection('projects')
                .where('user_id', '==', userId)
                .get();

            const project = projectsSnapshot.docs.find((doc) =>
                doc.data().title.toLowerCase().includes(projectName.toLowerCase())
            );

            if (!project) {
                const availableProjects = projectsSnapshot.docs.map(
                    (doc) => doc.data().title
                );
                throw new functions.https.HttpsError(
                    'not-found',
                    `Projeto "${projectName}" não encontrado. Projetos disponíveis: ${availableProjects.join(', ')}`
                );
            }

            const projectId = project.id;
            const projectData = project.data();
            console.log(`✅ Projeto encontrado: ${projectData.title} (ID: ${projectId})`);

            // 3. Buscar quiz pelo horário
            console.log('🕐 Buscando quiz...');
            const target = new Date(targetTime);
            const startTime = new Date(target);
            startTime.setMinutes(target.getMinutes() - 5);
            const endTime = new Date(target);
            endTime.setMinutes(target.getMinutes() + 5);

            const questionsSnapshot = await db
                .collection('questions')
                .where('project_id', '==', projectId)
                .where('created_at', '>=', admin.firestore.Timestamp.fromDate(startTime))
                .where('created_at', '<=', admin.firestore.Timestamp.fromDate(endTime))
                .orderBy('created_at', 'desc')
                .get();

            let quizQuestions: any[] = [];

            if (questionsSnapshot.empty) {
                console.log('⚠️ Nenhum quiz encontrado nesse horário exato. Buscando todos os quizzes de hoje...');

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

                // Agrupar por session_id
                const sessionMap: { [key: string]: any[] } = {};
                allTodayQuestions.docs.forEach((doc) => {
                    const questionData = doc.data();
                    const sessionId = questionData.session_id || 'sem_sessao';
                    if (!sessionMap[sessionId]) {
                        sessionMap[sessionId] = [];
                    }
                    sessionMap[sessionId].push({
                        id: doc.id,
                        ...questionData,
                        created_at: questionData.created_at.toDate(),
                    });
                });

                // Encontrar sessão mais próxima do horário alvo
                let closestSession = null;
                let smallestDiff = Infinity;

                Object.keys(sessionMap).forEach((sessionId) => {
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
                    throw new functions.https.HttpsError(
                        'not-found',
                        'Nenhuma sessão de quiz válida encontrada próxima do horário especificado'
                    );
                }

                quizQuestions = sessionMap[closestSession].slice(0, 20);
            } else {
                quizQuestions = questionsSnapshot.docs.slice(0, 20).map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    created_at: doc.data().created_at.toDate(),
                }));
            }

            console.log(`✅ Encontradas ${quizQuestions.length} questões`);

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

            const sourceTopics: Set<string> = new Set();

            // Extrair tópicos do resumo
            if (!summariesSnapshot.empty) {
                const summary = summariesSnapshot.docs[0].data();
                const summaryContent = summary.content || '';
                const topicMatches = summaryContent.match(/##\s+(.+)/g) || [];
                topicMatches.forEach((match: string) => {
                    const topic = match.replace(/##\s+/, '').trim();
                    sourceTopics.add(topic);
                });
                console.log(`✅ Resumo encontrado com ${topicMatches.length} tópicos`);
            }

            // Extrair tópicos do mapa mental
            if (!mindmapsSnapshot.empty) {
                const mindmap = mindmapsSnapshot.docs[0].data();
                const mindmapContent = mindmap.markdown || '';
                const topicMatches = mindmapContent.match(/#{1,3}\s+(.+)/g) || [];
                topicMatches.forEach((match: string) => {
                    const topic = match.replace(/#{1,3}\s+/, '').trim();
                    sourceTopics.add(topic);
                });
                console.log(`✅ Mapa mental encontrado com ${topicMatches.length} tópicos`);
            }

            // 5. Análise de questões e tópicos
            const questionTopics: Set<string> = new Set();
            const questionsReport = quizQuestions.map((q, index) => {
                const topic = q.topico || 'Sem tópico definido';
                questionTopics.add(topic);

                return {
                    numero: index + 1,
                    pergunta: q.pergunta,
                    topico: topic,
                    dificuldade: q.dificuldade,
                    tipo: q.tipo,
                    opcoes: q.opcoes || [],
                    resposta_correta: q.resposta_correta,
                    justificativa: q.justificativa || 'Sem justificativa',
                };
            });

            // 6. Análise de cobertura
            const sourceTopicsArray = Array.from(sourceTopics);
            const questionTopicsArray = Array.from(questionTopics);

            const uncoveredTopics = sourceTopicsArray.filter(
                (sourceTopic) =>
                    !questionTopicsArray.some(
                        (qt) =>
                            qt.toLowerCase().includes(sourceTopic.toLowerCase()) ||
                            sourceTopic.toLowerCase().includes(qt.toLowerCase())
                    )
            );

            const coveredTopics = sourceTopicsArray.filter(
                (sourceTopic) =>
                    questionTopicsArray.some(
                        (qt) =>
                            qt.toLowerCase().includes(sourceTopic.toLowerCase()) ||
                            sourceTopic.toLowerCase().includes(qt.toLowerCase())
                    )
            );

            // Contagem de questões por tópico
            const topicDistribution: { [key: string]: number } = {};
            quizQuestions.forEach((q) => {
                const topic = q.topico || 'Sem tópico definido';
                topicDistribution[topic] = (topicDistribution[topic] || 0) + 1;
            });

            // 7. Montar relatório final
            const report = {
                projeto: projectData.title,
                data_quiz: quizQuestions[0].created_at.toISOString(),
                total_questoes: quizQuestions.length,
                estatisticas: {
                    topicos_fonte: sourceTopicsArray.length,
                    topicos_quiz: questionTopicsArray.length,
                    topicos_cobertos: coveredTopics.length,
                    topicos_nao_cobertos: uncoveredTopics.length,
                    taxa_cobertura: sourceTopicsArray.length > 0
                        ? ((coveredTopics.length / sourceTopicsArray.length) * 100).toFixed(2) + '%'
                        : 'N/A',
                },
                questoes: questionsReport,
                topicos_fonte: sourceTopicsArray,
                topicos_quiz: questionTopicsArray,
                topicos_cobertos: coveredTopics,
                topicos_nao_cobertos: uncoveredTopics,
                distribuicao_topicos: topicDistribution,
            };

            console.log('✅ Análise concluída!');
            return report;
        } catch (error: any) {
            console.error('❌ Erro na análise:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });
