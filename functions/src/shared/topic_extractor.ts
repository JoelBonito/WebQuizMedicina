/**
 * Topic Extractor Module
 * 
 * Responsável por:
 * 1. Extrair tópicos do conteúdo usando IA (durante processamento de upload)
 * 2. Calcular distribuição de questões/flashcards por tópico
 * 3. Deduplicar tópicos de múltiplos sources
 */

import { callGeminiWithUsage, parseJsonFromResponse } from "./gemini";

// =====================
// INTERFACES
// =====================

export interface Topic {
    name: string;
    relevance: 'high' | 'medium' | 'low';
    mention_count?: number;
}

export interface TopicDistribution {
    topic: string;
    quota: number;
}

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
export async function extractTopicsFromContent(
    content: string,
    modelName: string
): Promise<Topic[]> {
    // 🆕 ESTRATÉGIA DE AMOSTRAGEM INTELIGENTE
    // Para garantir cobertura completa do documento (incluindo tópicos do meio/fim)
    // usamos amostragem estratificada ao invés de truncamento simples

    let sampledContent: string;
    const MAX_CHARS = 120000; // ~30k tokens (aumentado para cobrir mais conteúdo)

    if (content.length <= MAX_CHARS) {
        // Documento pequeno: usa completo
        sampledContent = content;
    } else {
        // Documento grande: amostragem estratificada
        // 40% início + 20% meio (3 amostras) + 40% fim
        const startSize = Math.floor(MAX_CHARS * 0.4);
        const midSize = Math.floor(MAX_CHARS * 0.2 / 3);
        const endSize = Math.floor(MAX_CHARS * 0.4);

        const start = content.substring(0, startSize);
        const end = content.substring(content.length - endSize);

        // Pegar 3 amostras do meio
        const third = Math.floor(content.length / 3);
        const mid1 = content.substring(third - midSize / 2, third + midSize / 2);
        const mid2 = content.substring(third * 2 - midSize / 2, third * 2 + midSize / 2);
        const mid3 = content.substring(third * 1.5 - midSize / 2, third * 1.5 + midSize / 2);

        sampledContent = `${start}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 1...]\n${mid1}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 2...]\n${mid2}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 3...]\n${mid3}\n\n[...FIM DO DOCUMENTO...]\n${end}`;

        console.log(`📊 Document too large (${content.length} chars). Using stratified sampling: ${sampledContent.length} chars`);
    }

    const prompt = `
Você é um especialista em análise de conteúdo acadêmico/médico.
Analise o texto abaixo e identifique os tópicos distintos presentes.

REGRAS:
1. Liste tópicos ESPECÍFICOS (ex: "Hepatite B", "Insuficiência Renal Aguda").
2. Classifique a relevância: high (>20%), medium (5-20%), low (<5%).
3. Máximo de 15 tópicos.

CONTEÚDO:
${sampledContent}

FORMATO JSON (obrigatório):
{"topics":[{"name":"Tópico","relevance":"high"}]}
`;

    // Implementar retry para lidar com respostas vazias
    const MAX_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`📋 Topic extraction attempt ${attempt}/${MAX_RETRIES}...`);

            // Aumentado limite de tokens para 8192 e usando jsonMode
            const result = await callGeminiWithUsage(prompt, modelName, 8192, true);

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

            const parsed = parseJsonFromResponse(result.text);

            if (!parsed.topics || !Array.isArray(parsed.topics)) {
                console.warn('⚠️ Topic extraction returned invalid format. Using empty array.');
                return [];
            }

            // Validar e limpar tópicos
            const validTopics: Topic[] = parsed.topics
                .filter((t: any) => t.name && typeof t.name === 'string')
                .map((t: any) => {
                    const topic: Topic = {
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

        } catch (error: any) {
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
export function calculateDistribution(
    topics: Topic[],
    totalCount: number
): TopicDistribution[] {
    if (topics.length === 0) {
        return [];
    }

    // Ordenar por relevância (high > medium > low)
    const sorted = [...topics].sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
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
export function deduplicateTopics(topics: Topic[]): Topic[] {
    const map = new Map<string, Topic>();

    for (const topic of topics) {
        // Normaliza nome para comparação (lowercase, trim, remove acentos básicos)
        const normalized = normalizeTopicName(topic.name);
        const existing = map.get(normalized);

        if (!existing) {
            map.set(normalized, topic);
        } else {
            // Mantém a maior relevância
            if (getRelevanceScore(topic.relevance) > getRelevanceScore(existing.relevance)) {
                map.set(normalized, topic);
            }
        }
    }

    return Array.from(map.values());
}

/**
 * Normaliza nome de tópico para comparação
 */
function normalizeTopicName(name: string): string {
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
function getRelevanceScore(relevance: string): number {
    const scores: Record<string, number> = { high: 3, medium: 2, low: 1 };
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
export function aggregateTopicsFromSources(sources: any[]): Topic[] {
    const allTopics: Topic[] = [];

    for (const source of sources) {
        if (source.topics && Array.isArray(source.topics)) {
            allTopics.push(...source.topics);
        }
    }

    return deduplicateTopics(allTopics);
}

// =====================
// FORMATAÇÃO DE PROMPT
// =====================

/**
 * Formata a distribuição de tópicos para incluir no prompt de geração
 * 
 * @param distribution - Distribuição calculada
 * @returns String formatada para o prompt
 */
export function formatDistributionForPrompt(distribution: TopicDistribution[]): string {
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
