"use strict";
/**
 * Recovery Mode Strategy Module (Phase 4)
 *
 * Defines intelligent strategies for generating recovery content
 * based on the number and type of student difficulties.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDifficultiesForLog = exports.estimateTokens = exports.calculateRecoveryStrategyForFlashcards = exports.calculateRecoveryStrategy = void 0;
/**
 * Calculate the optimal recovery strategy based on student difficulties
 *
 * Strategy Rules:
 * - 0 difficulties: MASTERY mode (advanced content for students who mastered basics)
 * - 1-2 difficulties: HYBRID mode (40% focused + 60% general to avoid saturation)
 * - 3+ difficulties: FOCUSED mode (100% distributed across all difficulty topics)
 *
 * @param difficulties - Array of unresolved student difficulties
 * @param projectName - Name of the project (for context in general queries)
 * @returns RecoveryStrategy object with queries and instructions
 */
function calculateRecoveryStrategy(difficulties, projectName) {
    var _a;
    if (!difficulties || difficulties.length === 0) {
        // ========================================
        // CASE 0: NO DIFFICULTIES (MASTERY MODE)
        // ========================================
        console.log(`✅ [Recovery] No difficulties found - activating MASTERY mode`);
        return {
            searchQueries: [
                `conceitos avançados de ${projectName}`,
                `casos clínicos complexos`,
                `diagnóstico diferencial`
            ],
            systemInstruction: `
O aluno NÃO TEM dificuldades registradas neste projeto.
Isso indica DOMÍNIO do conteúdo básico e intermediário.

MODO: MASTERY (Desafio Avançado)

REGRAS DE GERAÇÃO:
- Gere questões de ALTA COMPLEXIDADE
- Priorize: casos clínicos, diagnóstico diferencial, situações atípicas
- Foque em raciocínio crítico sobre memorização
- Explore correlações entre múltiplos conceitos
- Inclua "pegadinhas" comuns em provas de residência

OBJETIVO: Levar o aluno ao próximo nível de expertise.
      `.trim(),
            focusPercentage: 0,
            strategyType: 'mastery'
        };
    }
    else if (difficulties.length <= 2) {
        // ========================================
        // CASE 1-2: HYBRID MODE (AVOID SATURATION)
        // ========================================
        const primaryTopic = difficulties[0].topico;
        const secondaryTopic = ((_a = difficulties[1]) === null || _a === void 0 ? void 0 : _a.topico) || null;
        console.log(`🔄 [Recovery] HYBRID Strategy activated`);
        console.log(`   Primary difficulty: "${primaryTopic}" (nivel: ${difficulties[0].nivel})`);
        if (secondaryTopic) {
            console.log(`   Secondary difficulty: "${secondaryTopic}" (nivel: ${difficulties[1].nivel})`);
        }
        // Build search queries
        const queries = [
            primaryTopic,
            secondaryTopic,
            `conceitos relacionados a ${primaryTopic}`,
            `fisiopatologia de ${primaryTopic}`,
            `aplicações clínicas em ${projectName}`
        ].filter(Boolean); // Remove null values
        return {
            searchQueries: queries,
            systemInstruction: `
O aluno demonstrou dificuldade específica em: "${primaryTopic}"${secondaryTopic ? ` e "${secondaryTopic}"` : ''}.

MODO: HYBRID (Recuperação Balanceada)

REGRAS DE GERAÇÃO:
- 40% das questões devem focar ESPECIFICAMENTE em "${primaryTopic}"
  * Varie os ângulos: mecanismo de ação, diagnóstico, tratamento, contraindicação
  * Inclua casos clínicos práticos sobre ${primaryTopic}
${secondaryTopic ? `- 20% das questões sobre "${secondaryTopic}"
  * Explore aspectos que o aluno pode ter confundido` : ''}
- ${secondaryTopic ? '40%' : '60%'} das questões sobre temas CORRELATOS ou contexto geral
  * Ajude o aluno a ver ${primaryTopic} no contexto maior
  * Reforce pré-requisitos necessários

IMPORTANTE:
- Não repita a mesma pergunta reformulada
- Cada questão deve abordar um aspecto DIFERENTE
- Nas justificativas, explique POR QUE o conceito é importante clinicamente

OBJETIVO: Corrigir a lacuna sem causar fadiga por repetição.
      `.trim(),
            focusPercentage: 40,
            strategyType: 'hybrid'
        };
    }
    else {
        // ========================================
        // CASE 3+: FOCUSED MODE (INTENSIVE REVIEW)
        // ========================================
        const topicList = difficulties.map(d => d.topico);
        const topicCount = topicList.length;
        console.log(`🎯 [Recovery] FOCUSED Strategy activated`);
        console.log(`   Difficulties: ${topicList.join(', ')}`);
        console.log(`   Total topics: ${topicCount}`);
        return {
            searchQueries: topicList,
            systemInstruction: `
O aluno precisa URGENTEMENTE revisar os seguintes ${topicCount} tópicos:
${topicList.map((topic, idx) => `${idx + 1}. ${topic}`).join('\n')}

MODO: FOCUSED (Revisão Intensiva)

REGRAS DE GERAÇÃO:
- Distribua as questões EQUITATIVAMENTE entre os ${topicCount} tópicos
- Cada tópico deve ter múltiplas questões cobrindo diferentes aspectos:
  * Definição/Conceito básico
  * Aplicação clínica
  * Diagnóstico diferencial
  * Tratamento/Conduta
- Quando possível, crie questões que CONECTEM múltiplos tópicos da lista
  * Exemplo: "Paciente com [tópico 1] desenvolveu [tópico 2]. Qual a conduta?"

IMPORTANTE:
- Este é um Quiz de RECUPERAÇÃO, não um teste diagnóstico
- Seja EDUCATIVO nas justificativas
- Explique não apenas o "quê", mas o "porquê" e "como aplicar"
- Corrija conceitos errados que o aluno possa ter desenvolvido

OBJETIVO: Fechar múltiplas lacunas de forma eficiente e interconectada.
      `.trim(),
            focusPercentage: 100,
            strategyType: 'focused'
        };
    }
}
exports.calculateRecoveryStrategy = calculateRecoveryStrategy;
/**
 * Calculate recovery strategy specifically for FLASHCARDS
 *
 * Flashcards tolerate repetition better than quizzes because:
 * - They are atomic (1 card = 1 fact)
 * - Different angles on same topic don't feel repetitive
 * - Memorization benefits from multiple exposures
 *
 * Strategy Rules:
 * - 0 difficulties: MASTERY mode (advanced terminology and mechanisms)
 * - 1+ difficulties: FOCUSED mode (100% on difficulties, atomized into facts)
 *
 * @param difficulties - Array of unresolved student difficulties
 * @param projectName - Name of the project
 * @returns RecoveryStrategy object optimized for flashcard generation
 */
function calculateRecoveryStrategyForFlashcards(difficulties, projectName) {
    if (!difficulties || difficulties.length === 0) {
        // ========================================
        // CASE 0: NO DIFFICULTIES (MASTERY MODE)
        // ========================================
        console.log(`✅ [Recovery Flashcards] No difficulties - activating MASTERY mode`);
        return {
            searchQueries: [
                `terminologia médica avançada de ${projectName}`,
                `mecanismos moleculares`,
                `valores de referência e diagnóstico`
            ],
            systemInstruction: `
O aluno NÃO TEM dificuldades registradas neste projeto.
Isso indica domínio dos conceitos básicos.

MODO: MASTERY (Memorização Avançada)

REGRAS PARA FLASHCARDS:
- Foque em terminologia AVANÇADA e específica
- Mecanismos moleculares e fisiopatológicos detalhados
- Valores de referência precisos e critérios diagnósticos
- Associações e correlações entre conceitos
- Mnemonics e truques de memorização para residência

FORMATO:
- Front: Pergunta direta e objetiva
- Back: Resposta concisa (1-3 frases máximo)
- Tags: Categorização por especialidade e sistema

OBJETIVO: Consolidar conhecimento avançado através de memorização ativa.
      `.trim(),
            focusPercentage: 0,
            strategyType: 'mastery'
        };
    }
    else {
        // ========================================
        // CASE 1+: FOCUSED MODE (FLASHCARDS TOLERATE REPETITION)
        // ========================================
        // Unlike quizzes, flashcards can be 100% focused even with 1-2 topics
        const topicList = difficulties.map(d => d.topico);
        const topicCount = topicList.length;
        console.log(`🎯 [Recovery Flashcards] FOCUSED Strategy activated`);
        console.log(`   Difficulties: ${topicList.join(', ')}`);
        console.log(`   Total topics: ${topicCount}`);
        console.log(`   Note: Flashcards tolerate 100% focus (atomic nature)`);
        return {
            searchQueries: topicList,
            systemInstruction: `
O aluno demonstrou dificuldade em: ${topicList.join(', ')}.

MODO: FOCUSED (Memorização Intensiva)

REGRAS PARA FLASHCARDS DE RECUPERAÇÃO:
- ATOMIZE o conhecimento: 1 flashcard = 1 fato/conceito isolado
- Para cada tópico "${topicList[0]}", crie flashcards sobre ÂNGULOS DIFERENTES:
  * Definição (O que é?)
  * Valor de referência (Quando aplicável)
  * Sintoma/sinal principal
  * Fisiopatologia (Mecanismo básico)
  * Tratamento de primeira linha
  * Contraindicação mais importante
  * Diagnóstico diferencial principal

${topicCount > 1 ? `- Distribua EQUITATIVAMENTE entre os ${topicCount} tópicos` : ''}
- Cada flashcard deve ser AUTOCONTIDO (não depender de outro card)
- Use linguagem OBJETIVA e PRECISA

IMPORTANTE - Flashcards são para MEMORIZAÇÃO, não raciocínio:
- Evite casos clínicos complexos (use perguntas diretas)
- Prefira "Qual é..." sobre "Por que..."
- Resposta back deve ser memorável e concisa (máximo 3 frases)
- Se o conceito é complexo, quebre em múltiplos flashcards simples

FORMATO:
- Front: Pergunta direta e objetiva (sem contexto longo)
- Back: Resposta concisa e memorável
- Tags: Incluir o tópico de dificuldade + categoria geral

OBJETIVO: Fechar lacunas através de memorização ativa e repetição espaçada.
      `.trim(),
            focusPercentage: 100,
            strategyType: 'focused'
        };
    }
}
exports.calculateRecoveryStrategyForFlashcards = calculateRecoveryStrategyForFlashcards;
/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for Portuguese/English
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
exports.estimateTokens = estimateTokens;
/**
 * Format difficulty topics for logging
 */
function formatDifficultiesForLog(difficulties) {
    if (!difficulties || difficulties.length === 0) {
        return 'None';
    }
    return difficulties
        .map(d => `${d.topico} (nivel: ${d.nivel})`)
        .join(', ');
}
exports.formatDifficultiesForLog = formatDifficultiesForLog;
//# sourceMappingURL=recovery_strategies.js.map