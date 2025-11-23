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
 * Gemini combined context limit (input + output)
 * Discovered empirically: Despite documentation saying 1M input + 16k output,
 * there's a practical combined limit of ~30k tokens when using JSON mode.
 * This prevents MAX_TOKENS errors without content generation.
 */
export const GEMINI_CONTEXT_LIMIT = 30000;

/**
 * Safety margin for token calculations
 * Accounts for:
 * - JSON mode overhead
 * - Token counting variations
 * - API response headers
 */
export const SAFETY_MARGIN = 2000;

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
 * Calculates safe maxOutputTokens based on input size
 * Ensures that input + output doesn't exceed Gemini's combined context limit
 *
 * @param inputText - The input text/prompt that will be sent to Gemini
 * @param desiredOutputTokens - Desired output token count (default: 14000)
 * @returns Safe output token count that respects the combined limit
 */
export function calculateSafeOutputTokens(
  inputText: string,
  desiredOutputTokens: number = 14000
): number {
  const estimatedInputTokens = estimateTokens(inputText);

  // Calculate maximum possible output given the current input
  const maxPossibleOutput = GEMINI_CONTEXT_LIMIT - estimatedInputTokens - SAFETY_MARGIN;

  // Return the smaller of desired and possible
  const safeOutput = Math.min(desiredOutputTokens, maxPossibleOutput);

  console.log(`📊 [Output Calculation] Input: ~${estimatedInputTokens} tokens, Desired: ${desiredOutputTokens}, Safe: ${safeOutput}`);

  if (safeOutput < desiredOutputTokens) {
    console.warn(`⚠️ [Output Limit] Reducing from ${desiredOutputTokens} to ${safeOutput} tokens due to large input (${estimatedInputTokens} tokens)`);
  }

  // Ensure minimum output of 2k tokens for useful content
  const finalOutput = Math.max(safeOutput, 2000);

  if (finalOutput !== safeOutput) {
    console.warn(`⚠️ [Output Limit] Input too large! Using minimum ${finalOutput} tokens (input: ${estimatedInputTokens})`);
  }

  return finalOutput;
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
 * - Chunks: 50k chars each (~12.5k tokens input)
 * - Section output: ~6k tokens each (dynamically calculated to respect 30k limit)
 * - Combination output: dynamically calculated based on sections size
 * - Parallel processing: time = max(chunk_time), not sum
 * - Example: 6 chunks × 25s (parallel) + 1 combine × 15s = ~40s total ✅
 *
 * Gemini Flash capacity:
 * - Input: 1M tokens (we use max ~75k = 7.5% capacity)
 * - Output: 16k tokens (we use up to 14k = 87.5% capacity, adjusted for input size)
 *
 * @param inputText - Combined source text (full extracted_content, not filtered)
 * @returns Strategy recommendation with dynamic maxOutputTokens
 */
export function calculateSummaryStrategy(inputText: string): {
  strategy: 'SINGLE' | 'BATCHED';
  estimatedOutputTokens: number;
  maxOutputTokens: number;
  explanation: string;
} {
  const inputTokens = estimateTokens(inputText);
  const chars = inputText.length;

  // Strategy 1: Single complete summary (~25-35s)
  // Gemini Flash handles up to 300k chars (~75k tokens) easily in one request
  // Output: up to 14k tokens (adjusted for input size to respect combined limit)
  if (chars < 300000) {
    const desiredOutput = 14000;
    const safeOutput = calculateSafeOutputTokens(inputText, desiredOutput);

    // If safe output is too small (<6k), switch to BATCHED strategy
    if (safeOutput < 6000) {
      console.warn(`⚠️ [Strategy] Input too large for SINGLE strategy (would allow only ${safeOutput} output tokens). Switching to BATCHED.`);

      const batchedOutput = 14000; // BATCHED combines smaller chunks, so can use full 14k
      const safeBatchedOutput = calculateSafeOutputTokens('', batchedOutput); // Empty input for combine phase

      return {
        strategy: 'BATCHED',
        estimatedOutputTokens: safeBatchedOutput,
        maxOutputTokens: safeBatchedOutput,
        explanation: `Conteúdo grande (${chars} chars, ~${inputTokens} tokens). Usando estratégia BATCHED para permitir output completo de ${safeBatchedOutput} tokens.`,
      };
    }

    return {
      strategy: 'SINGLE',
      estimatedOutputTokens: safeOutput,
      maxOutputTokens: safeOutput,
      explanation: `Conteúdo de ${chars} chars (~${inputTokens} tokens). Gerando resumo completo (output: ${safeOutput} tokens, cobertura 100%).`,
    };
  }

  // Strategy 2: Batched sections with parallel processing (for content >= 300k chars)
  // Chunks: 100k chars each (larger chunks = fewer sections = faster)
  // Parallelism: Promise.all reduces time from sum to max
  // Example: 400k chars = 4 chunks
  //   - Without parallelism: 4 × 30s = 120s ❌ (timeout)
  //   - With parallelism: max(30s, 30s, 30s, 30s) + 20s combine = ~50s ✅
  const desiredOutput = 14000;
  const safeOutput = calculateSafeOutputTokens('', desiredOutput); // Combine phase has minimal input

  return {
    strategy: 'BATCHED',
    estimatedOutputTokens: safeOutput,
    maxOutputTokens: safeOutput,
    explanation: `Conteúdo muito grande (${chars} chars, ~${inputTokens} tokens). Processando em seções paralelas (chunks de 100k chars) e consolidando tópicos duplicados (output final: ${safeOutput} tokens).`,
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
