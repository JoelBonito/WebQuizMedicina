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
  model: 'gemini-2.0-flash-exp' | 'gemini-1.5-flash' | 'gemini-1.5-pro' = 'gemini-2.0-flash-exp',
  maxOutputTokens: number = 16384,
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
    console.log(`💰 [Gemini] Cache reduces input token cost by ~95%`);
  } else {
    console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);
    console.log(`📊 [Gemini] Estimated total context: ~${estimatedTokens + maxOutputTokens} tokens (input + output)`);

    if (estimatedTokens + maxOutputTokens > 30000) {
      console.warn(`⚠️ [Gemini] Total context (~${estimatedTokens + maxOutputTokens}) exceeds safe limit (30k)! May cause MAX_TOKENS error.`);
    } else if (estimatedTokens + maxOutputTokens > 28000) {
      console.warn(`⚠️ [Gemini] Total context (~${estimatedTokens + maxOutputTokens}) near limit. Consider reducing input or output.`);
    }

    if (estimatedTokens > 30000) {
      console.warn(`⚠️ [Gemini] Very large prompt detected! This may cause API errors. Consider reducing content.`);
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
          {
            text: prompt,
          },
        ],
      },
    ];
  } else {
    requestBody.contents = [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
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
      `Gemini returned invalid response. This may be due to:\n` +
      `- Prompt too large (try reducing content or number of items)\n` +
      `- Content safety filters triggered\n` +
      `- API quota exceeded\n` +
      `Response: ${JSON.stringify(data).substring(0, 500)}`
    );
  }

  const candidate = data.candidates[0];
  const finishReason = candidate.finishReason;

  // Check for problematic finish reasons
  if (finishReason === 'SAFETY') {
    throw new Error('Response blocked by safety filters. Content may contain sensitive medical information.');
  }

  if (finishReason === 'MAX_TOKENS') {
    console.error('❌ Gemini response was truncated due to MAX_TOKENS limit');
    console.error('Candidate:', JSON.stringify(candidate, null, 2));
    console.error(`📊 Input tokens: ${data.usageMetadata?.promptTokenCount || estimatedTokens}, Output limit: ${maxOutputTokens}`);

    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const partialText = candidate.content.parts[0].text;
      console.warn(`⚠️ MAX_TOKENS hit, but recovered ${partialText.length} characters of partial content`);
      console.warn('This will likely cause JSON parsing errors. Consider:');
      console.warn('  1. Reducing the number of items requested');
      console.warn('  2. Increasing maxOutputTokens parameter');
      console.warn('  3. Using batched processing for large requests');
      // Still return partial content with usage metadata
      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount || estimatedTokens,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        cachedTokens: data.usageMetadata?.cachedContentTokenCount || 0,
      };
      return { text: partialText, usage };
    }

    throw new Error(
      'Resposta truncada: O modelo atingiu o limite de tokens antes de completar. ' +
      'Por favor, tente:\n' +
      '  • Reduzir o número de questões solicitadas\n' +
      '  • Selecionar menos conteúdo/fontes\n' +
      'Candidato: ' + JSON.stringify(candidate).substring(0, 200)
    );
  }

  if (finishReason === 'RECITATION') {
    console.warn('⚠️ Response flagged for recitation. Content may be too similar to training data.');
  }

  // Validate content structure
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    console.error('❌ Invalid candidate structure:', JSON.stringify(candidate, null, 2));
    throw new Error(`Gemini candidate has no content. Response: ${JSON.stringify(candidate).substring(0, 500)}`);
  }

  // Extract usage metadata
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

/**
 * Attempts to recover valid items from a truncated JSON array
 */
function recoverItemsFromTruncatedJson(text: string, arrayKey?: string): any[] {
  console.warn('🔧 Attempting to recover valid items from truncated JSON...');

  const items: any[] = [];

  // Auto-detect array key if not provided
  let detectedKey = arrayKey;
  if (!detectedKey) {
    const commonKeys = ['perguntas', 'flashcards', 'topicos', 'items', 'data', 'results'];
    for (const key of commonKeys) {
      if (text.indexOf(`"${key}"`) !== -1) {
        detectedKey = key;
        console.log(`✅ Auto-detected array key: "${key}"`);
        break;
      }
    }

    if (!detectedKey) {
      console.error(`❌ Could not auto-detect array key in response`);
      return items;
    }
  }

  // Try to find the start of the array
  const arrayStart = text.indexOf(`"${detectedKey}"`);
  if (arrayStart === -1) {
    console.error(`❌ Could not find "${detectedKey}" array in response`);
    return items;
  }

  // Find the opening bracket
  const bracketStart = text.indexOf('[', arrayStart);
  if (bracketStart === -1) {
    return items;
  }

  // Extract everything after the opening bracket
  const arrayContent = text.substring(bracketStart + 1);

  // Use a simple state machine to extract complete objects
  let depth = 0;
  let currentObject = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < arrayContent.length; i++) {
    const char = arrayContent[i];

    if (escapeNext) {
      currentObject += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      currentObject += char;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }

    currentObject += char;

    // Found a complete object
    if (depth === 0 && char === '}') {
      try {
        const obj = JSON.parse(currentObject.trim());
        items.push(obj);
        console.log(`✅ Recovered item ${items.length}`);
        currentObject = '';
      } catch (e) {
        console.warn(`⚠️ Failed to parse recovered object: ${e}`);
      }

      // Skip commas and whitespace
      while (i + 1 < arrayContent.length && (arrayContent[i + 1] === ',' || arrayContent[i + 1].match(/\s/))) {
        i++;
      }
    }
  }

  console.log(`✅ Recovered ${items.length} valid items from truncated JSON`);
  return items;
}

/**
 * Attempts to recover a partial object from truncated JSON
 */
function recoverPartialObject(text: string): any | null {
  console.warn('🔧 Attempting to recover partial object from truncated JSON...');

  const recovered: any = {};

  // Find all complete string fields
  const stringFieldPattern = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;

  while ((match = stringFieldPattern.exec(text)) !== null) {
    const key = match[1];
    const value = match[2];

    try {
      recovered[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      console.log(`✅ Recovered field: "${key}" (${value.length} chars)`);
    } catch (e: any) {
      console.warn(`⚠️ Failed to unescape field "${key}": ${e.message}`);
    }
  }

  // Try to recover truncated string fields
  if (Object.keys(recovered).length === 0 || !recovered.conteudo_html) {
    const truncatedStringPattern = /"([^"]+)"\s*:\s*"([^"]*?)$/;
    const truncMatch = text.match(truncatedStringPattern);
    if (truncMatch) {
      const key = truncMatch[1];
      let value = truncMatch[2];

      const fieldStart = text.lastIndexOf(`"${key}"`);
      if (fieldStart !== -1) {
        const colonPos = text.indexOf(':', fieldStart);
        const quotePos = text.indexOf('"', colonPos + 1);
        if (quotePos !== -1) {
          value = text.substring(quotePos + 1);
          value = value.replace(/\\+$/, '');
        }
      }

      if (value.length > 10) {
        recovered[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        console.log(`✅ Recovered TRUNCATED field: "${key}" (${value.length} chars, incomplete)`);
      }
    }
  }

  const fieldCount = Object.keys(recovered).length;
  if (fieldCount > 0) {
    console.log(`✅ Recovered ${fieldCount} complete fields from partial object`);
    return recovered;
  }

  console.warn('⚠️ Could not recover any complete fields from partial object');
  return null;
}

/**
 * Parse JSON from Gemini response with recovery for truncated responses
 */
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

  // Check for obvious truncation signs
  const isTruncated = cleaned.length > 100 && !cleaned.slice(-50).match(/[}\]]\s*$/);
  if (isTruncated) {
    console.warn('⚠️ JSON appears to be truncated - does not end with } or ]');
  }

  // Try to parse directly
  try {
    return JSON.parse(cleaned);
  } catch (firstError: any) {
    console.warn(`⚠️ Initial JSON parse failed: ${firstError.message}`);

    // Check if error is due to unterminated string or unexpected end
    if (firstError.message.includes('Unterminated string') ||
        firstError.message.includes('Unexpected end of JSON') ||
        firstError.message.includes('Expected') && isTruncated) {
      console.warn('🔧 JSON truncated by token limit. Attempting recovery...');

      // Try to recover partial items
      const recoveredItems = recoverItemsFromTruncatedJson(cleaned);
      if (recoveredItems.length > 0) {
        const arrayKey = cleaned.indexOf('"flashcards"') !== -1 ? 'flashcards' : 'perguntas';
        console.log(`✅ Recovered ${recoveredItems.length} complete items from truncated response`);
        return { [arrayKey]: recoveredItems };
      }

      // Try to recover partial object
      const partialObject = recoverPartialObject(cleaned);
      if (partialObject && Object.keys(partialObject).length > 0) {
        console.log(`✅ Recovered partial object with ${Object.keys(partialObject).length} fields`);
        return partialObject;
      }

      throw new Error(`Response was truncated at ${cleaned.length} characters. Could not recover sufficient data. Please try again.`);
    }

    throw new Error(`Could not parse JSON from response. Error: ${firstError.message}`);
  }
}

/**
 * Estimate token count from text (4 chars ≈ 1 token for Portuguese)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate safe output tokens based on input size and Gemini's context limit
 */
export function calculateSafeOutputTokens(
  inputText: string,
  desiredOutputTokens: number = 14000
): number {
  const GEMINI_CONTEXT_LIMIT = 30000;
  const SAFETY_MARGIN = 2000;

  const estimatedInputTokens = estimateTokens(inputText);
  const maxPossibleOutput = GEMINI_CONTEXT_LIMIT - estimatedInputTokens - SAFETY_MARGIN;
  const safeOutput = Math.min(desiredOutputTokens, maxPossibleOutput);

  console.log(`📊 [Output Calculation] Input: ~${estimatedInputTokens} tokens, Desired: ${desiredOutputTokens}, Safe: ${safeOutput}`);

  if (safeOutput < desiredOutputTokens) {
    console.warn(`⚠️ [Output Limit] Reducing from ${desiredOutputTokens} to ${safeOutput} tokens due to large input (${estimatedInputTokens} tokens)`);
  }

  return Math.max(safeOutput, 2000);
}
