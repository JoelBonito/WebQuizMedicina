// PHASE 1: Output token limits and batch processing utilities
// This module prevents response truncation by validating and batching AI generation requests

/**
 * Token estimation for each output type
 * Based on empirical testing with Gemini 2.5 Flash
 * Includes JSON overhead (~15% extra)
 */
export const OUTPUT_LIMITS = {
  // Flashcards: ~250-350 tokens + JSON overhead
  // Increased from 290 to 350 to account for detailed explanations and prevent truncation
  FLASHCARD: {
    TOKENS_PER_ITEM: 350,
    DESCRIPTION: 'flashcard com frente, verso, tópico, dificuldade',
  },

  // Quiz - Multiple Choice: ~400-500 tokens + JSON overhead
  // Increased from 400 to 500 to account for verbose justifications and prevent truncation
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
    MAX_TOKENS_SINGLE: 6000,
  },
} as const;

/**
 * Safe output limit: 75% of Gemini's 16k token limit
 * Leaves buffer for:
 * - JSON formatting variations
 * - Gemini's conservative token counting
 * - Unexpected verbosity
 * - Large input contexts
 *
 * Increased from 8000 to 12000 to handle extensive medical content summaries.
 * With proper chunking (12k chars/section), this allows comprehensive summaries
 * without truncation while maintaining a safe margin.
 */
export const SAFE_OUTPUT_LIMIT = 12000;

/**
 * Maximum output tokens Gemini 2.5 can generate
 * Updated to 16k as Gemini 2.5 Flash supports up to 16,384 output tokens
 */
export const GEMINI_MAX_OUTPUT = 16384;

/**
 * Validates if a generation request fits within safe token limits
 *
 * @param itemType - Type of item being generated
 * @param count - Number of items requested
 * @returns Validation result with warnings and recommendations
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
    // Summaries are validated differently (input-based)
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

  // Calculate how many items fit in one safe batch
  const itemsPerBatch = Math.floor(SAFE_OUTPUT_LIMIT / config.TOKENS_PER_ITEM);

  return {
    isValid: false,
    estimatedTokens,
    needsBatching: true,
    recommendedBatchSize: itemsPerBatch,
    warning: `Solicitação de ${count} itens (${estimatedTokens} tokens) excede limite seguro. Recomendado: processar em lotes de ${itemsPerBatch} itens.`,
  };
}

/**
 * Calculates how many batches are needed for a request
 *
 * @param itemType - Type of item being generated
 * @param totalCount - Total number of items requested
 * @returns Number of batches needed
 */
export function calculateBatches(
  itemType: keyof typeof OUTPUT_LIMITS,
  totalCount: number
): number {
  const validation = validateOutputRequest(itemType, totalCount);

  if (!validation.needsBatching) {
    return 1;
  }

  const batchSize = validation.recommendedBatchSize!;
  return Math.ceil(totalCount / batchSize);
}

/**
 * Splits a total count into batch sizes
 *
 * @param itemType - Type of item being generated
 * @param totalCount - Total number of items requested
 * @returns Array of batch sizes (e.g., [10, 10, 5] for 25 items with batch size 10)
 */
export function calculateBatchSizes(
  itemType: keyof typeof OUTPUT_LIMITS,
  totalCount: number
): number[] {
  const validation = validateOutputRequest(itemType, totalCount);

  if (!validation.needsBatching) {
    return [totalCount];
  }

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
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Determines the best summary generation strategy based on input size
 *
 * Strategies (optimized for 60s Edge Function timeout, quality, and completeness):
 * - SINGLE: Generate complete summary in one request (< 300k chars / ~75k tokens, ~25-35s)
 * - BATCHED: Generate summary in parallel sections, then combine (>= 300k chars, ~35-50s)
 *
 * CRITICAL CHANGE: No longer uses embeddings/semantic search for summaries
 * - Summaries now use 100% of extracted_content (no data loss)
 * - Medical content requires complete coverage (contraindicações, dosagens, etc)
 *
 * BATCHED strategy with parallelism (Promise.all):
 * - Chunks: 100k chars each (~25k tokens input)
 * - Section output: ~8k tokens each
 * - Combination output: ~14k tokens final
 * - Parallel processing: time = max(chunk_time), not sum
 * - Example: 3 chunks × 30s (parallel) + 1 combine × 20s = ~50s total ✅
 *
 * Gemini Flash capacity:
 * - Input: 1M tokens (we use max ~75k = 7.5% capacity)
 * - Output: 16k tokens (we use 14k = 87.5% capacity with safety margin)
 *
 * @param inputText - Combined source text (full extracted_content, not filtered)
 * @returns Strategy recommendation
 */
export function calculateSummaryStrategy(inputText: string): {
  strategy: 'SINGLE' | 'BATCHED';
  estimatedOutputTokens: number;
  explanation: string;
} {
  const inputTokens = estimateTokens(inputText);
  const chars = inputText.length;

  // Strategy 1: Single complete summary (~25-35s)
  // Gemini Flash handles up to 300k chars (~75k tokens) easily in one request
  // Output: 14k tokens (~15-20 pages) - ideal for student study material
  if (chars < 300000) {
    const estimatedOutput = 14000; // Fixed output for comprehensive summary

    return {
      strategy: 'SINGLE',
      estimatedOutputTokens: estimatedOutput,
      explanation: `Conteúdo de ${chars} chars (~${inputTokens} tokens). Gerando resumo completo em uma única requisição (15-20 páginas, ~14k tokens, cobertura 100%).`,
    };
  }

  // Strategy 2: Batched sections with parallel processing (for content >= 300k chars)
  // Chunks: 100k chars each (larger chunks = fewer sections = faster)
  // Parallelism: Promise.all reduces time from sum to max
  // Example: 400k chars = 4 chunks
  //   - Without parallelism: 4 × 30s = 120s ❌ (timeout)
  //   - With parallelism: max(30s, 30s, 30s, 30s) + 20s combine = ~50s ✅
  const estimatedOutput = 14000; // Final combined output

  return {
    strategy: 'BATCHED',
    estimatedOutputTokens: estimatedOutput,
    explanation: `Conteúdo muito grande (${chars} chars, ~${inputTokens} tokens). Processando em seções paralelas (chunks de 100k chars) e consolidando tópicos duplicados (output final: 14k tokens).`,
  };
}

/**
 * Format batch progress message for logs
 */
export function formatBatchProgress(currentBatch: number, totalBatches: number): string {
  return `[Lote ${currentBatch}/${totalBatches}]`;
}

/**
 * Calculate total estimated time for batch processing
 * Assumes ~3 seconds per Gemini API call
 */
export function estimateBatchTime(batchCount: number): number {
  const SECONDS_PER_BATCH = 3;
  return batchCount * SECONDS_PER_BATCH;
}
