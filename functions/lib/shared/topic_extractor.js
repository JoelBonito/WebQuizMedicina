"use strict";
/**
 * Topic Extractor Module
 *
 * Responsável por:
 * 1. Extrair tópicos do conteúdo usando IA (durante processamento de upload)
 * 2. Calcular distribuição de questões/flashcards por tópico
 * 3. Deduplicar tópicos de múltiplos sources
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDistributionForPrompt = exports.aggregateTopicsFromSources = exports.deduplicateTopics = exports.calculateDistribution = exports.extractTopicsFromContent = void 0;
const gemini_1 = require("./gemini");
// =====================
// EXTRAÇÃO DE TÓPICOS
// =====================
/**
 * Extrai tópicos do conteúdo usando IA
 * Chamado durante o processamento de upload (process_embeddings_queue)
 *
 * @param content - Texto extraído do documento
 * @param modelName - Nome do modelo Gemini a usar
 * @returns Lista de tópicos identificados
 */
async function extractTopicsFromContent(content, modelName) {
    // Limitar conteúdo para não estourar contexto
    const truncatedContent = content.substring(0, 80000); // ~20k tokens (reduzido para evitar truncamento de saída)
    const prompt = `
Você é um especialista em análise de conteúdo acadêmico/médico.
Analise o texto abaixo e identifique os tópicos distintos presentes.

REGRAS:
1. Liste tópicos ESPECÍFICOS (ex: "Hepatite B", "Insuficiência Renal Aguda").
2. Classifique a relevância: high (>20%), medium (5-20%), low (<5%).
3. Máximo de 15 tópicos.

CONTEÚDO:
${truncatedContent}

FORMATO JSON (obrigatório):
{"topics":[{"name":"Tópico","relevance":"high"}]}
`;
    // Implementar retry para lidar com respostas vazias
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`📋 Topic extraction attempt ${attempt}/${MAX_RETRIES}...`);
            // Aumentado limite de tokens para 8192 e usando jsonMode
            const result = await (0, gemini_1.callGeminiWithUsage)(prompt, modelName, 8192, true);
            // Verificar se resposta está vazia
            if (!result.text || result.text.trim().length === 0) {
                console.warn(`⚠️ Attempt ${attempt}: Empty response from AI`);
                if (attempt < MAX_RETRIES) {
                    // Esperar antes de retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                return [];
            }
            const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            if (!parsed.topics || !Array.isArray(parsed.topics)) {
                console.warn('⚠️ Topic extraction returned invalid format. Using empty array.');
                return [];
            }
            // Validar e limpar tópicos
            const validTopics = parsed.topics
                .filter((t) => t.name && typeof t.name === 'string')
                .map((t) => {
                const topic = {
                    name: t.name.trim(),
                    relevance: ['high', 'medium', 'low'].includes(t.relevance) ? t.relevance : 'medium'
                };
                // Só adiciona mention_count se for um número válido (evita undefined)
                if (typeof t.mention_count === 'number' && t.mention_count > 0) {
                    topic.mention_count = t.mention_count;
                }
                return topic;
            });
            console.log(`✅ Extracted ${validTopics.length} topics successfully`);
            return validTopics;
        }
        catch (error) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
            // Em caso de erro final, retorna array vazio (não bloqueia o processamento)
            return [];
        }
    }
    return [];
}
exports.extractTopicsFromContent = extractTopicsFromContent;
// =====================
// DISTRIBUIÇÃO DE QUESTÕES
// =====================
/**
 * Calcula distribuição de questões/flashcards por tópico
 *
 * REGRAS:
 * - Se topics <= count: Distribui igualmente com resto distribuído aos mais relevantes
 * - Se topics > count: Prioriza por relevância, 1 questão cada para os mais importantes
 *
 * @param topics - Lista de tópicos (de um ou mais sources)
 * @param totalCount - Número total de questões/flashcards a gerar
 * @returns Distribuição com quota por tópico
 */
function calculateDistribution(topics, totalCount) {
    if (topics.length === 0) {
        return [];
    }
    // Ordenar por relevância (high > medium > low)
    const sorted = [...topics].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.relevance] - order[b.relevance];
    });
    // Caso 1: Mais tópicos que questões → Prioriza os mais relevantes
    if (topics.length > totalCount) {
        console.log(`📊 Mais tópicos (${topics.length}) que questões (${totalCount}). Priorizando por relevância.`);
        return sorted.slice(0, totalCount).map(t => ({
            topic: t.name,
            quota: 1
        }));
    }
    // Caso 2: Menos ou igual tópicos que questões → Distribui igualmente
    const baseQuota = Math.floor(totalCount / topics.length);
    const remainder = totalCount % topics.length;
    return sorted.map((t, i) => ({
        topic: t.name,
        quota: baseQuota + (i < remainder ? 1 : 0)
    }));
}
exports.calculateDistribution = calculateDistribution;
// =====================
// DEDUPLICAÇÃO
// =====================
/**
 * Remove tópicos duplicados de múltiplos sources
 * Mantém a maior relevância em caso de duplicata
 *
 * @param topics - Array de tópicos (pode ter duplicatas de diferentes sources)
 * @returns Array de tópicos únicos
 */
function deduplicateTopics(topics) {
    const map = new Map();
    for (const topic of topics) {
        // Normaliza nome para comparação (lowercase, trim, remove acentos básicos)
        const normalized = normalizeTopicName(topic.name);
        const existing = map.get(normalized);
        if (!existing) {
            map.set(normalized, topic);
        }
        else {
            // Mantém a maior relevância
            if (getRelevanceScore(topic.relevance) > getRelevanceScore(existing.relevance)) {
                map.set(normalized, topic);
            }
        }
    }
    return Array.from(map.values());
}
exports.deduplicateTopics = deduplicateTopics;
/**
 * Normaliza nome de tópico para comparação
 */
function normalizeTopicName(name) {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, ' '); // Normaliza espaços
}
/**
 * Converte relevância para score numérico
 */
function getRelevanceScore(relevance) {
    const scores = { high: 3, medium: 2, low: 1 };
    return scores[relevance] || 0;
}
// =====================
// AGREGAÇÃO
// =====================
/**
 * Agrega tópicos de múltiplos sources
 * Útil quando gerando quiz/flashcard de várias fontes selecionadas
 *
 * @param sources - Array de sources com campo topics
 * @returns Array de tópicos únicos agregados
 */
function aggregateTopicsFromSources(sources) {
    const allTopics = [];
    for (const source of sources) {
        if (source.topics && Array.isArray(source.topics)) {
            allTopics.push(...source.topics);
        }
    }
    return deduplicateTopics(allTopics);
}
exports.aggregateTopicsFromSources = aggregateTopicsFromSources;
// =====================
// FORMATAÇÃO DE PROMPT
// =====================
/**
 * Formata a distribuição de tópicos para incluir no prompt de geração
 *
 * @param distribution - Distribuição calculada
 * @returns String formatada para o prompt
 */
function formatDistributionForPrompt(distribution) {
    if (distribution.length === 0) {
        return "Distribua as questões de forma equilibrada entre os tópicos identificados no conteúdo.";
    }
    const lines = distribution.map(d => `• ${d.topic}: ${d.quota} questão(ões)`);
    return `📋 DISTRIBUIÇÃO OBRIGATÓRIA (NÃO ALTERE):
${lines.join('\n')}

🚨 REGRA CRÍTICA: Gere EXATAMENTE o número de questões especificado para cada tópico.
Se um tópico tem quota de 2, você DEVE gerar exatamente 2 questões sobre ele.
Marque cada questão com seu tópico correspondente no campo "topico".`;
}
exports.formatDistributionForPrompt = formatDistributionForPrompt;
//# sourceMappingURL=topic_extractor.js.map