// Output token limits and batch processing utilities for Vercel Functions
// Based on Gemini 2.5 Flash actual capabilities (not conservative estimates)

/**
 * GEMINI 2.5 FLASH ACTUAL LIMITS (from official documentation)
 * - Max Input: 1,048,576 tokens
 * - Max Output: 65,535 tokens (default)
 * - RPM: 1,000 requests/min
 * - TPM: 1,000,000 tokens/min
 * - RPD: 10,000 requests/day
 */

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
    MAX_TOKENS_SINGLE: 16384, // Use full capability for summaries
  },
} as const;

/**
 * Maximum output tokens Gemini 2.5 Flash can generate
 * Official limit: 65,535 tokens
 */
export const GEMINI_MAX_OUTPUT = 65535;

/**
 * Maximum input tokens Gemini 2.5 Flash accepts
 * Official limit: 1,048,576 tokens
 */
export const GEMINI_MAX_INPUT = 1048576;

/**
 * Recommended safe output limit for medical content generation
 * Using 16k tokens as a practical limit for most requests
 * Can be increased up to 65k for very detailed content
 */
export const SAFE_OUTPUT_LIMIT = 16384;

/**
 * Safety margin for token calculations
 * Accounts for JSON mode overhead and token counting variations
 */
export const SAFETY_MARGIN = 2000;

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
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculates safe maxOutputTokens based on desired output
 * With Gemini 2.5 Flash, there's no artificial "combined limit"
 * Input and output are independent up to their individual limits
 *
 * @param desiredOutputTokens - Desired output token count (default: 16384)
 * @returns Safe output token count (capped at GEMINI_MAX_OUTPUT)
 */
export function calculateSafeOutputTokens(
  desiredOutputTokens: number = 16384
): number {
  // Simply cap at the actual Gemini max output
  const safeOutput = Math.min(desiredOutputTokens, GEMINI_MAX_OUTPUT);

  console.log(`📊 [Output Calculation] Desired: ${desiredOutputTokens}, Safe: ${safeOutput}`);

  return safeOutput;
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
