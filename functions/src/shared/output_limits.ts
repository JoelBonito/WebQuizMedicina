// PHASE 1: Output token limits and batch processing utilities
// This module prevents response truncation by validating and batching AI generation requests

/**
 * Token estimation for each output type
 * Based on empirical testing with Gemini 2.5 Flash
 * Includes JSON overhead (~15% extra)
 */
export const OUTPUT_LIMITS = {
    // Flashcards: ~250-350 tokens + JSON overhead
    FLASHCARD: {
        TOKENS_PER_ITEM: 350,
        DESCRIPTION: 'flashcard com frente, verso, tópico, dificuldade',
    },

    // Quiz - Multiple Choice: ~400-500 tokens + JSON overhead
    QUIZ_MULTIPLE_CHOICE: {
        TOKENS_PER_ITEM: 500,
        DESCRIPTION: 'questão múltipla escolha com 4 alternativas, justificativa, dica',
    },

    // Quiz - True/False: ~260 tokens + JSON overhead
    QUIZ_TRUE_FALSE: {
        TOKENS_PER_ITEM: 300,
        DESCRIPTION: 'questão verdadeiro/falso com justificativa',
    },

    // Quiz - Clinical Case: ~600 tokens + JSON overhead
    QUIZ_CLINICAL_CASE: {
        TOKENS_PER_ITEM: 700,
        DESCRIPTION: 'caso clínico com história, questões e discussão',
    },

    // Summary: Variable based on input size
    SUMMARY: {
        TOKENS_PER_1K_INPUT: 100, // ~10% compression ratio
        MIN_TOKENS: 500,
        // Increased max output for single summaries since Gemini 2.5 allows 65k output
        MAX_TOKENS_SINGLE: 30000,
    },
} as const;

/**
 * Safe output limit for standard tasks
 * Increased to utilize Gemini 2.5 capability
 */
export const SAFE_OUTPUT_LIMIT = 30000;

/**
 * Maximum output tokens Gemini 2.5 can generate
 * Updated per Gemini 2.5 Flash specs (65,535 tokens)
 */
export const GEMINI_MAX_OUTPUT = 65535;

/**
 * Gemini combined context limit (input + output)
 * Gemini 2.5 Flash supports ~1 Million tokens input.
 * We set a safe operational limit of 1M.
 */
export const GEMINI_CONTEXT_LIMIT = 1000000;

/**
 * Safety margin for token calculations
 * Large margin to account for estimation errors in very large contexts
 */
export const SAFETY_MARGIN = 5000;

/**
 * Validates if a generation request fits within safe token limits
 */
export function validateOutputRequest(
    itemType: keyof typeof OUTPUT_LIMITS,
    count: number
): {
    isValid: boolean;
    estimatedTokens: number;
    needsBatching: boolean;
    recommendedBatchSize?: number;
    warning?: string;
} {
    if (itemType === 'SUMMARY') {
        return {
            isValid: true,
            estimatedTokens: 0,
            needsBatching: false,
        };
    }

    const config = OUTPUT_LIMITS[itemType];
    const estimatedTokens = config.TOKENS_PER_ITEM * count;

    if (estimatedTokens <= SAFE_OUTPUT_LIMIT) {
        return {
            isValid: true,
            estimatedTokens,
            needsBatching: false,
        };
    }

    const itemsPerBatch = Math.floor(SAFE_OUTPUT_LIMIT / config.TOKENS_PER_ITEM);

    return {
        isValid: false,
        estimatedTokens,
        needsBatching: true,
        recommendedBatchSize: itemsPerBatch,
        warning: `Solicitação de ${count} itens (${estimatedTokens} tokens) excede limite seguro. Recomendado: processar em lotes de ${itemsPerBatch} itens.`,
    };
}

export function calculateBatches(
    itemType: keyof typeof OUTPUT_LIMITS,
    totalCount: number
): number {
    const validation = validateOutputRequest(itemType, totalCount);
    if (!validation.needsBatching) return 1;
    return Math.ceil(totalCount / validation.recommendedBatchSize!);
}

export function calculateBatchSizes(
    itemType: keyof typeof OUTPUT_LIMITS,
    totalCount: number
): number[] {
    const validation = validateOutputRequest(itemType, totalCount);
    if (!validation.needsBatching) return [totalCount];

    const batchSize = validation.recommendedBatchSize!;
    const batches: number[] = [];
    let remaining = totalCount;

    while (remaining > 0) {
        const currentBatch = Math.min(remaining, batchSize);
        batches.push(currentBatch);
        remaining -= currentBatch;
    }

    return batches;
}

/**
 * Estimates token usage for a given text
 * Simple heuristic: ~4 characters per token for Portuguese
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Calculates safe maxOutputTokens based on input size
 * Ensures that input + output doesn't exceed Gemini's combined context limit
 */
export function calculateSafeOutputTokens(
    inputText: string,
    desiredOutputTokens: number = 20000
): number {
    const estimatedInputTokens = estimateTokens(inputText);

    // Calculate maximum possible output given the current input
    // 1,000,000 - Input - Margin
    const maxPossibleOutput = GEMINI_CONTEXT_LIMIT - estimatedInputTokens - SAFETY_MARGIN;

    // Cap at Gemini's hard limit (65,535)
    const absoluteMaxOutput = Math.min(maxPossibleOutput, GEMINI_MAX_OUTPUT);

    // Return the smaller of desired and possible
    const safeOutput = Math.min(desiredOutputTokens, absoluteMaxOutput);

    // Ensure minimum output of 4k tokens for useful content, unless context is absolutely full
    if (safeOutput < 4000 && maxPossibleOutput > 4000) {
        return 4000;
    }

    return Math.max(safeOutput, 0);
}

/**
 * Determines the best summary generation strategy based on input size
 */
export function calculateSummaryStrategy(inputText: string): {
    strategy: 'SINGLE' | 'BATCHED';
    estimatedOutputTokens: number;
    maxOutputTokens: number;
    explanation: string;
} {
    const inputTokens = estimateTokens(inputText);
    const chars = inputText.length;

    // Strategy 1: Single complete summary
    // Gemini 2.5 Flash has huge context. We can handle very large inputs in a single pass.
    // 1M tokens is approx 4 million chars.
    // We set a safe threshold of ~600k chars (~150k tokens) for SINGLE strategy to ensure speed.
    if (chars < 600000) {
        const desiredOutput = 30000; // Allow for very detailed summary (up to ~30k tokens)
        const safeOutput = calculateSafeOutputTokens(inputText, desiredOutput);

        return {
            strategy: 'SINGLE',
            estimatedOutputTokens: safeOutput,
            maxOutputTokens: safeOutput,
            explanation: `Conteúdo de ${chars} chars (~${inputTokens} tokens). Gerando resumo completo.`,
        };
    }

    // Strategy 2: Batched sections
    // Only for EXTREMELY large content (> 600k chars)
    const desiredOutput = 30000;
    const safeOutput = calculateSafeOutputTokens('', desiredOutput);

    return {
        strategy: 'BATCHED',
        estimatedOutputTokens: safeOutput,
        maxOutputTokens: safeOutput,
        explanation: `Conteúdo massivo (${chars} chars). Processando em seções paralelas.`,
    };
}

export function formatBatchProgress(currentBatch: number, totalBatches: number): string {
    return `[Lote ${currentBatch}/${totalBatches}]`;
}

export function estimateBatchTime(batchCount: number): number {
    const SECONDS_PER_BATCH = 5; // Slightly increased for larger contexts
    return batchCount * SECONDS_PER_BATCH;
}
