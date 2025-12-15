/**
 * Topic Extractor Module v2 - HIERÁRQUICO
 * 
 * Responsável por:
 * 1. Extrair tópicos MACRO (seções principais) + SUB-TÓPICOS (conceitos específicos)
 * 2. Calcular distribuição de questões/flashcards por tópico
 * 3. Deduplicar tópicos de múltiplos sources
 * 
 * NOVA ARQUITETURA:
 * - Tópicos macro: "Patologias do Fígado" (como seções de um resumo)
 * - Sub-tópicos: "Carcinoma Hepatocelular", "Hemangioma", etc.
 */

import { callGeminiWithUsage, parseJsonFromResponse } from "./gemini";

// =====================
// INTERFACES
// =====================

export interface Topic {
    name: string;
    relevance: 'high' | 'medium' | 'low';
    subtopics?: string[];  // 🆕 Sub-tópicos específicos
    mention_count?: number;
}

export interface TopicDistribution {
    topic: string;
    quota: number;
}

// =====================
// EXTRAÇÃO DE TÓPICOS (HIERÁRQUICA)
// =====================

/**
 * Extrai tópicos hierárquicos do conteúdo usando IA
 * 
 * @param content - Texto extraído do documento
 * @param modelName - Nome do modelo Gemini a usar
 * @returns Lista de tópicos com sub-tópicos
 */
export async function extractTopicsFromContent(
    content: string,
    modelName: string
): Promise<Topic[]> {
    // ESTRATÉGIA DE AMOSTRAGEM INTELIGENTE
    let sampledContent: string;
    const MAX_CHARS = 120000; // ~30k tokens

    if (content.length <= MAX_CHARS) {
        sampledContent = content;
    } else {
        // Documento grande: amostragem estratificada
        const startSize = Math.floor(MAX_CHARS * 0.4);
        const midSize = Math.floor(MAX_CHARS * 0.2 / 3);
        const endSize = Math.floor(MAX_CHARS * 0.4);

        const start = content.substring(0, startSize);
        const end = content.substring(content.length - endSize);

        const third = Math.floor(content.length / 3);
        const mid1 = content.substring(third - midSize / 2, third + midSize / 2);
        const mid2 = content.substring(third * 2 - midSize / 2, third * 2 + midSize / 2);
        const mid3 = content.substring(third * 1.5 - midSize / 2, third * 1.5 + midSize / 2);

        sampledContent = `${start}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 1...]\n${mid1}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 2...]\n${mid2}\n\n[...MEIO DO DOCUMENTO - AMOSTRA 3...]\n${mid3}\n\n[...FIM DO DOCUMENTO...]\n${end}`;

        console.log(`📊 Document too large (${content.length} chars). Using stratified sampling: ${sampledContent.length} chars`);
    }

    // 🆕 PROMPT HIERÁRQUICO - Mais conciso para evitar truncamento
    const prompt = `
Analise o texto acadêmico e extraia a ESTRUTURA de tópicos:

REGRAS:
1. Máximo 15 tópicos PRINCIPAIS (grandes seções do documento)
2. Para cada tópico, liste até 10 sub-tópicos específicos
3. Relevância: high (>15%), medium (5-15%), low (<5%)
4. Cubra TODO o documento - início, meio e fim

CONTEÚDO:
${sampledContent}

JSON:
{"topics":[{"name":"Tópico","relevance":"high","subtopics":["sub1","sub2"]}]}
`;

    const MAX_RETRIES = 2;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`📋 Hierarchical topic extraction attempt ${attempt}/${MAX_RETRIES}...`);

            const result = await callGeminiWithUsage(prompt, modelName, 32768, true);

            if (!result.text || result.text.trim().length === 0) {
                console.warn(`⚠️ Attempt ${attempt}: Empty response from AI`);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                return [];
            }

            const parsed = parseJsonFromResponse(result.text);

            // Aceitar tanto {topics: [...]} quanto array direto [...]
            let rawTopics: any[];
            if (Array.isArray(parsed)) {
                rawTopics = parsed;
            } else if (parsed.topics && Array.isArray(parsed.topics)) {
                rawTopics = parsed.topics;
            } else {
                console.warn('⚠️ Topic extraction returned invalid format. Using empty array.');
                return [];
            }

            // Validar e limpar tópicos
            const validTopics: Topic[] = rawTopics
                .filter((t: any) => t.name && typeof t.name === 'string')
                .map((t: any) => {
                    const topic: Topic = {
                        name: t.name.trim(),
                        relevance: ['high', 'medium', 'low'].includes(t.relevance) ? t.relevance : 'medium'
                    };

                    // 🆕 Processar sub-tópicos
                    if (t.subtopics && Array.isArray(t.subtopics)) {
                        topic.subtopics = t.subtopics
                            .filter((st: any) => typeof st === 'string' && st.trim())
                            .map((st: string) => st.trim());
                    }

                    if (typeof t.mention_count === 'number' && t.mention_count > 0) {
                        topic.mention_count = t.mention_count;
                    }
                    return topic;
                });

            // Contar totais
            const totalSubtopics = validTopics.reduce((sum, t) => sum + (t.subtopics?.length || 0), 0);
            console.log(`✅ Extracted ${validTopics.length} main topics with ${totalSubtopics} subtopics`);

            return validTopics;

        } catch (error: any) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
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
 * Agora considera sub-tópicos para distribuição mais granular
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
 * Agora também mescla sub-tópicos de tópicos com mesmo nome
 */
export function deduplicateTopics(topics: Topic[]): Topic[] {
    const map = new Map<string, Topic>();

    for (const topic of topics) {
        const normalized = normalizeTopicName(topic.name);
        const existing = map.get(normalized);

        if (!existing) {
            map.set(normalized, { ...topic });
        } else {
            // Mantém a maior relevância
            if (getRelevanceScore(topic.relevance) > getRelevanceScore(existing.relevance)) {
                existing.relevance = topic.relevance;
            }

            // 🆕 Mescla sub-tópicos únicos
            if (topic.subtopics && topic.subtopics.length > 0) {
                const existingSubtopics = new Set(existing.subtopics || []);
                topic.subtopics.forEach(st => existingSubtopics.add(st));
                existing.subtopics = Array.from(existingSubtopics);
            }
        }
    }

    return Array.from(map.values());
}

function normalizeTopicName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, ' ');
}

function getRelevanceScore(relevance: string): number {
    const scores: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return scores[relevance] || 0;
}

// =====================
// AGREGAÇÃO
// =====================

/**
 * Agrega tópicos de múltiplos sources
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
 * Agora inclui dicas sobre sub-tópicos disponíveis
 */
export function formatDistributionForPrompt(distribution: TopicDistribution[], topics?: Topic[]): string {
    if (distribution.length === 0) {
        return "Distribua as questões de forma equilibrada entre os tópicos identificados no conteúdo.";
    }

    const lines = distribution.map(d => {
        const topic = topics?.find(t => t.name === d.topic);
        const subtopicsHint = topic?.subtopics?.length
            ? ` (inclui: ${topic.subtopics.slice(0, 3).join(', ')}${topic.subtopics.length > 3 ? '...' : ''})`
            : '';
        return `• ${d.topic}${subtopicsHint}: ${d.quota} questão(ões)`;
    });

    return `📋 DISTRIBUIÇÃO OBRIGATÓRIA (NÃO ALTERE):
${lines.join('\n')}

🚨 REGRA CRÍTICA: Gere EXATAMENTE o número de questões especificado para cada tópico.
Se um tópico tem quota de 2, você DEVE gerar exatamente 2 questões sobre ele.
Marque cada questão com seu tópico correspondente no campo "topico".`;
}

// =====================
// UTILITÁRIOS
// =====================

/**
 * Flatten topics - Expande tópicos hierárquicos em lista plana
 * Útil para busca e filtros
 */
export function flattenTopics(topics: Topic[]): string[] {
    const flat: string[] = [];

    for (const topic of topics) {
        flat.push(topic.name);
        if (topic.subtopics) {
            flat.push(...topic.subtopics);
        }
    }

    return [...new Set(flat)]; // Remove duplicatas
}

/**
 * Conta total de tópicos incluindo sub-tópicos
 */
export function countAllTopics(topics: Topic[]): { main: number; sub: number; total: number } {
    const main = topics.length;
    const sub = topics.reduce((sum, t) => sum + (t.subtopics?.length || 0), 0);
    return { main, sub, total: main + sub };
}
