// Gemini API client for Vercel Serverless Functions
// Ported from Supabase Edge Functions to run on Vercel (Node.js runtime)

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
    finishReason?: string; // COMPLETE, MAX_TOKENS, SAFETY, RECITATION, OTHER
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    cachedContentTokenCount?: number;
  };
}

export interface GeminiResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
  };
}

/**
 * Call Gemini API and return text + usage metadata
 */
export async function callGeminiWithUsage(
  prompt: string,
  apiKey: string,
  model: 'gemini-2.5-flash' | 'gemini-2.0-flash-exp' = 'gemini-2.5-flash', // Default Updated
  maxOutputTokens: number = 65535, // Default Updated to Gemini 2.5 max
  jsonMode: boolean = false,
  cacheName?: string
): Promise<GeminiResult> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Log prompt size for debugging
  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 4);

  if (cacheName) {
    console.log(`📊 [Gemini] Using cached content: ${cacheName}`);
    console.log(`📊 [Gemini] Prompt only: ${promptChars} chars (~${estimatedTokens} tokens)`);
  } else {
    console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);
    
    // Warn only if approaching the real 1M limit (e.g., > 900k)
    if (estimatedTokens + maxOutputTokens > 900000) {
      console.warn(`⚠️ [Gemini] Total context (~${estimatedTokens + maxOutputTokens}) is approaching the 1M token limit.`);
    }
  }

  // Build generation config with optional JSON mode
  const generationConfig: any = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
    console.log('🔧 [Gemini] JSON mode enabled - native JSON output guaranteed');
  }

  // Build request body
  const requestBody: any = {
    generationConfig,
  };

  // Use cached content if provided, otherwise send full prompt
  if (cacheName) {
    requestBody.cachedContent = cacheName;
    requestBody.contents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
        ],
      },
    ];
  } else {
    requestBody.contents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
        ],
      },
    ];
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: GeminiResponse = await response.json();

  // Validate response structure
  if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
    console.error('❌ Invalid Gemini response structure:', JSON.stringify(data, null, 2));
    throw new Error(
      `Gemini returned invalid response. Response: ${JSON.stringify(data).substring(0, 500)}`
    );
  }

  const candidate = data.candidates[0];
  const finishReason = candidate.finishReason;

  if (finishReason === 'SAFETY') {
    throw new Error('Response blocked by safety filters. Content may contain sensitive medical information.');
  }

  if (finishReason === 'MAX_TOKENS') {
    console.error('❌ Gemini response was truncated due to MAX_TOKENS limit');
    console.error(`📊 Input tokens: ${data.usageMetadata?.promptTokenCount || estimatedTokens}, Output limit: ${maxOutputTokens}`);

    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const partialText = candidate.content.parts[0].text;
      console.warn(`⚠️ MAX_TOKENS hit, but recovered ${partialText.length} characters of partial content`);
      
      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount || estimatedTokens,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        cachedTokens: data.usageMetadata?.cachedContentTokenCount || 0,
      };
      return { text: partialText, usage };
    }

    throw new Error('Resposta truncada: O modelo atingiu o limite de tokens antes de completar.');
  }

  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    console.error('❌ Invalid candidate structure:', JSON.stringify(candidate, null, 2));
    throw new Error(`Gemini candidate has no content.`);
  }

  const usage = {
    inputTokens: data.usageMetadata?.promptTokenCount || estimatedTokens,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    cachedTokens: data.usageMetadata?.cachedContentTokenCount || 0,
  };

  console.log(`📊 [Gemini Usage] Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Total: ${usage.inputTokens + usage.outputTokens}`);
  if (usage.cachedTokens > 0) {
    console.log(`💰 [Gemini Cache] Cached tokens: ${usage.cachedTokens} (75% discount)`);
  }

  return {
    text: candidate.content.parts[0].text,
    usage,
  };
}

// NOTE: estimateTokens and calculateSafeOutputTokens REMOVED from here
// to avoid duplication. They must be imported from './output-limits'.

export function parseJsonFromResponse(text: string): any {
  // Remove leading/trailing whitespace
  let cleaned = text.trim();

  // Try to extract JSON from markdown code blocks first
  const jsonMatch = cleaned.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  // Try to extract JSON from plain code blocks
  const codeMatch = cleaned.match(/```\s*\n([\s\S]*?)\n```/);
  if (codeMatch) {
    cleaned = codeMatch[1].trim();
  }

  // Remove any text before the first { or [
  const startMatch = cleaned.match(/^[^{[]*([{[])/);
  if (startMatch) {
    cleaned = cleaned.substring(cleaned.indexOf(startMatch[1]));
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError: any) {
    console.warn(`⚠️ Initial JSON parse failed: ${firstError.message}`);
    // Simplified parse logic - assuming user handles partials if needed via prompt instruction
    throw new Error(`Could not parse JSON from response. Error: ${firstError.message}`);
  }
}
