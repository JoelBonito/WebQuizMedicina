"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopicHistory = getTopicHistory;
exports.adjustDistributionByHistory = adjustDistributionByHistory;
exports.calculateAdaptiveQuestionCount = calculateAdaptiveQuestionCount;
exports.getUncoveredTopics = getUncoveredTopics;
exports.estimateQuizzesForFullCoverage = estimateQuizzesForFullCoverage;
/**
 * Busca o histórico de tópicos abordados nos últimos N quizzes do projeto
 * @param db - Instância do Firestore
 * @param projectId - ID do projeto
 * @param lastNQuizzes - Número de quizzes anteriores para analisar (padrão: 3)
 * @returns Mapa com contagem de perguntas por tópico
 */
async function getTopicHistory(db, projectId, lastNQuizzes = 3) {
    const topicCount = new Map();
    try {
        // Buscar as últimas N sessões (quizzes) do projeto
        const questionsSnapshot = await db.collection('questions')
            .where('project_id', '==', projectId)
            .orderBy('created_at', 'desc')
            .limit(lastNQuizzes * 50) // Assumindo ~20-50 perguntas por quiz
            .get();
        if (questionsSnapshot.empty) {
            console.log('📊 Nenhum histórico de quiz encontrado. Primeira geração.');
            return topicCount;
        }
        // Agrupar por session_id para pegar apenas os últimos N quizzes
        const sessionMap = new Map();
        questionsSnapshot.forEach(doc => {
            const data = doc.data();
            const sessionId = data.session_id;
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, []);
            }
            sessionMap.get(sessionId).push({
                topico: data.topico,
                created_at: data.created_at
            });
        });
        // Ordenar sessões por data e pegar apenas as últimas N
        const recentSessions = Array.from(sessionMap.entries())
            .sort((a, b) => {
            var _a, _b, _c, _d;
            const aTime = ((_b = (_a = a[1][0]) === null || _a === void 0 ? void 0 : _a.created_at) === null || _b === void 0 ? void 0 : _b.toMillis()) || 0;
            const bTime = ((_d = (_c = b[1][0]) === null || _c === void 0 ? void 0 : _c.created_at) === null || _d === void 0 ? void 0 : _d.toMillis()) || 0;
            return bTime - aTime;
        })
            .slice(0, lastNQuizzes);
        console.log(`📊 Analisando histórico dos últimos ${recentSessions.length} quizzes...`);
        // Contar tópicos das sessões recentes
        recentSessions.forEach(([sessionId, questions]) => {
            questions.forEach(q => {
                const topic = q.topico || 'Geral';
                topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
            });
        });
        console.log(`📊 Tópicos no histórico: ${Array.from(topicCount.entries()).map(([t, c]) => `${t}:${c}`).join(', ')}`);
    }
    catch (error) {
        console.error('⚠️ Erro ao buscar histórico de tópicos:', error);
    }
    return topicCount;
}
/**
 * Ajusta a distribuição de tópicos baseado no histórico
 * Prioriza tópicos que foram menos explorados nos quizzes anteriores
 *
 * @param allTopics - Lista completa de tópicos disponíveis
 * @param topicHistory - Mapa com contagem de perguntas anteriores por tópico
 * @param totalCount - Número total de perguntas a gerar
 * @returns Distribuição ajustada com quotas
 */
function adjustDistributionByHistory(allTopics, topicHistory, totalCount) {
    if (topicHistory.size === 0) {
        // Sem histórico: distribuição uniforme
        const quotaPerTopic = Math.floor(totalCount / allTopics.length);
        const remainder = totalCount % allTopics.length;
        return allTopics.map((topic, i) => ({
            topic,
            quota: quotaPerTopic + (i < remainder ? 1 : 0)
        }));
    }
    // Calcular "déficit" de cada tópico
    // Tópicos nunca abordados têm prioridade máxima
    const topicScores = allTopics.map(topic => {
        const previousCount = topicHistory.get(topic) || 0;
        const deficit = previousCount === 0 ? 999 : 1 / (previousCount + 1);
        return {
            topic,
            previousCount,
            deficit
        };
    });
    // Ordenar por déficit (maior déficit = maior prioridade)
    topicScores.sort((a, b) => b.deficit - a.deficit);
    console.log(`📊 Priorização por déficit (top 5): ${topicScores.slice(0, 5).map(t => `${t.topic}[${t.previousCount}]`).join(', ')}`);
    // Distribuir quotas proporcionalmente ao déficit
    const totalDeficit = topicScores.reduce((sum, t) => sum + t.deficit, 0);
    const distribution = topicScores.map(t => {
        const proportionalQuota = (t.deficit / totalDeficit) * totalCount;
        return {
            topic: t.topic,
            quota: Math.max(1, Math.round(proportionalQuota)) // Mínimo 1 pergunta
        };
    });
    // Ajustar para totalizar exatamente totalCount
    let currentTotal = distribution.reduce((sum, d) => sum + d.quota, 0);
    // Se passou do total, subtrair dos menos prioritários
    while (currentTotal > totalCount) {
        const lastWithMore = distribution.reverse().find(d => d.quota > 1);
        if (lastWithMore) {
            lastWithMore.quota--;
            currentTotal--;
        }
        else {
            break;
        }
        distribution.reverse();
    }
    // Se falta, adicionar aos mais prioritários
    while (currentTotal < totalCount) {
        distribution[currentTotal % distribution.length].quota++;
        currentTotal++;
    }
    return distribution.filter(d => d.quota > 0);
}
// =====================
// QUANTIDADE ADAPTATIVA DE PERGUNTAS
// =====================
/**
 * Calcula a quantidade ideal de perguntas baseada no número de tópicos
 *
 * REGRAS:
 * - Mínimo: 20 perguntas
 * - Máximo: 40 perguntas
 * - Se totalTopics <= 20: usa 20 perguntas
 * - Se totalTopics > 20 e <= 40: usa totalTopics (1 pergunta por tópico)
 * - Se totalTopics > 40: usa 40 perguntas
 *
 * @param totalTopics - Número total de tópicos disponíveis
 * @param userRequestedCount - Quantidade solicitada pelo usuário (opcional)
 * @returns Quantidade ideal de perguntas
 */
function calculateAdaptiveQuestionCount(totalTopics, userRequestedCount) {
    const MIN_QUESTIONS = 20;
    const MAX_QUESTIONS = 40;
    // Se o usuário especificou uma quantidade, respeitar (dentro dos limites)
    if (userRequestedCount) {
        const clamped = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, userRequestedCount));
        return {
            count: clamped,
            reason: `Usuário solicitou ${userRequestedCount} (ajustado para ${clamped})`
        };
    }
    // Cálculo adaptativo baseado em tópicos
    if (totalTopics <= MIN_QUESTIONS) {
        return {
            count: MIN_QUESTIONS,
            reason: `Poucos tópicos (${totalTopics}): usando mínimo de ${MIN_QUESTIONS} perguntas`
        };
    }
    else if (totalTopics <= MAX_QUESTIONS) {
        return {
            count: totalTopics,
            reason: `Quantidade ideal: ${totalTopics} perguntas (1 por tópico)`
        };
    }
    else {
        return {
            count: MAX_QUESTIONS,
            reason: `Muitos tópicos (${totalTopics}): usando máximo de ${MAX_QUESTIONS} perguntas`
        };
    }
}
/**
 * Verifica quais tópicos estão descobertos (não foram cobertos nos últimos quizzes)
 * Útil para feedback ao usuário
 */
function getUncoveredTopics(allTopics, topicHistory) {
    return allTopics.filter(topic => !topicHistory.has(topic) || topicHistory.get(topic) === 0);
}
/**
 * Estima quantos quizzes são necessários para cobrir todos os tópicos
 */
function estimateQuizzesForFullCoverage(totalTopics, questionsPerQuiz = 20) {
    return Math.ceil(totalTopics / questionsPerQuiz);
}
//# sourceMappingURL=topic_balancer.js.map