// Token Usage Logger - Tracks AI API usage for admin dashboard analytics
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Gemini 2.5 Flash Pricing (as of January 2025)
 * Source: https://ai.google.dev/pricing
 *
 * Standard (no caching):
 * - Input: $0.075 per 1M tokens
 * - Output: $0.30 per 1M tokens
 *
 * With Context Caching:
 * - Cached input: $0.01875 per 1M tokens (75% discount)
 * - Regular input: $0.075 per 1M tokens
 * - Output: $0.30 per 1M tokens
 */

// Pricing constants (USD per 1M tokens)
const GEMINI_PRICING = {
  'gemini-2.5-flash': {
    input: 0.075 / 1_000_000,
    output: 0.30 / 1_000_000,
    cached_input: 0.01875 / 1_000_000, // 75% discount
  },
  'gemini-2.5-pro': {
    input: 1.25 / 1_000_000,
    output: 5.00 / 1_000_000,
    cached_input: 0.3125 / 1_000_000, // 75% discount
  },
  'gemini-2.5-flash-lite': {
    input: 0.075 / 1_000_000, // Same as flash for now
    output: 0.30 / 1_000_000,
    cached_input: 0.01875 / 1_000_000,
  },
};

// USD to BRL conversion rate (approximate - could be fetched from API)
const USD_TO_BRL = 5.50;

export interface TokenUsageMetadata {
  model?: string;
  source_id?: string;
  session_id?: string;
  cached_tokens?: number;
  [key: string]: any;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number; // Tokens served from cache (if using context caching)
}

/**
 * Calculate cost in USD based on token usage
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite',
  cachedTokens: number = 0
): number {
  const pricing = GEMINI_PRICING[model];

  // Calculate regular input tokens (non-cached)
  const regularInputTokens = Math.max(0, inputTokens - cachedTokens);

  // Calculate costs
  const cachedCost = cachedTokens * pricing.cached_input;
  const regularInputCost = regularInputTokens * pricing.input;
  const outputCost = outputTokens * pricing.output;

  const totalCost = cachedCost + regularInputCost + outputCost;

  console.log(`💰 [Cost Calculation] Model: ${model}`);
  console.log(`   Input tokens: ${regularInputTokens} @ $${pricing.input * 1_000_000}/1M = $${regularInputCost.toFixed(6)}`);
  if (cachedTokens > 0) {
    console.log(`   Cached tokens: ${cachedTokens} @ $${pricing.cached_input * 1_000_000}/1M = $${cachedCost.toFixed(6)} (75% discount)`);
  }
  console.log(`   Output tokens: ${outputTokens} @ $${pricing.output * 1_000_000}/1M = $${outputCost.toFixed(6)}`);
  console.log(`   Total cost: $${totalCost.toFixed(6)} (R$ ${(totalCost * USD_TO_BRL).toFixed(4)})`);

  return totalCost;
}

/**
 * Log token usage to database for admin analytics
 */
export async function logTokenUsage(
  supabaseClient: SupabaseClient,
  userId: string,
  projectId: string | null,
  operationType: 'embedding' | 'chat' | 'quiz' | 'flashcard' | 'summary',
  usage: TokenUsage,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  metadata: TokenUsageMetadata = {}
): Promise<void> {
  try {
    const costUsd = calculateCost(
      usage.inputTokens,
      usage.outputTokens,
      model,
      usage.cachedTokens || 0
    );

    // Add model and cached tokens to metadata
    const enrichedMetadata = {
      ...metadata,
      model,
      cached_tokens: usage.cachedTokens || 0,
      cost_brl: costUsd * USD_TO_BRL,
    };

    const { error } = await supabaseClient
      .from('token_usage_logs')
      .insert({
        user_id: userId,
        project_id: projectId,
        operation_type: operationType,
        tokens_input: usage.inputTokens,
        tokens_output: usage.outputTokens,
        cost_usd: costUsd,
        metadata: enrichedMetadata,
      });

    if (error) {
      console.error('❌ [Token Logger] Failed to log token usage:', error);
      // Don't throw - logging failure should not break the main operation
    } else {
      console.log(`✅ [Token Logger] Logged ${usage.inputTokens + usage.outputTokens} tokens ($${costUsd.toFixed(6)}) for ${operationType}`);
    }
  } catch (err) {
    console.error('❌ [Token Logger] Exception while logging:', err);
    // Don't throw - logging failure should not break the main operation
  }
}

/**
 * Estimate token count from text (rough approximation)
 * Used for operations where actual token count is not available
 * Rule of thumb: 1 token ≈ 4 characters for English, ~3 for Portuguese
 */
export function estimateTokenCount(text: string, language: 'en' | 'pt' = 'pt'): number {
  const charsPerToken = language === 'pt' ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}
