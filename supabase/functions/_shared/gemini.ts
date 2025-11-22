// Shared Gemini API client for Edge Functions

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
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

export async function callGemini(
  prompt: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  maxOutputTokens: number = 16384, // Increased from 8192 - Gemini 2.5 supports up to 16k output tokens
  jsonMode: boolean = false, // Enable native JSON mode to save tokens and ensure valid JSON
  cacheName?: string // Optional: Use cached content to reduce input token costs by ~95%
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Log prompt size for debugging
  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 4); // Rough estimate: 1 token ≈ 4 characters

  if (cacheName) {
    console.log(`📊 [Gemini] Using cached content: ${cacheName}`);
    console.log(`📊 [Gemini] Prompt only: ${promptChars} chars (~${estimatedTokens} tokens)`);
    console.log(`💰 [Gemini] Cache reduces input token cost by ~95%`);
  } else {
    console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);

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

  // Enable native JSON mode to save prompt tokens and ensure valid JSON
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
        parts: [
          {
            text: prompt, // Only instructions when using cache
          },
        ],
      },
    ];
  } else {
    requestBody.contents = [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ];
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
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

  // Check for problematic finish reasons FIRST (before validating content)
  if (finishReason === 'SAFETY') {
    throw new Error('Response blocked by safety filters. Content may contain sensitive medical information.');
  }

  if (finishReason === 'MAX_TOKENS') {
    console.error('❌ Gemini response was truncated due to MAX_TOKENS limit');
    console.error('Candidate:', JSON.stringify(candidate, null, 2));

    // Check if there's any partial content we can recover
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      const partialText = candidate.content.parts[0].text;
      console.warn(`⚠️ MAX_TOKENS hit, but recovered ${partialText.length} characters of partial content`);
      console.warn('This will likely cause JSON parsing errors. Consider:');
      console.warn('  1. Reducing the number of items requested');
      console.warn('  2. Increasing maxOutputTokens parameter');
      console.warn('  3. Using batched processing for large requests');
      return partialText; // Return partial content, let parseJsonFromResponse handle recovery
    }

    // No partial content available
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

  // Now validate content structure
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    console.error('❌ Invalid candidate structure:', JSON.stringify(candidate, null, 2));
    throw new Error(`Gemini candidate has no content. Response: ${JSON.stringify(candidate).substring(0, 500)}`);
  }

  // Extract usage metadata if available
  const usageMetadata = data.usageMetadata;
  if (usageMetadata) {
    console.log(`📊 [Gemini Usage] Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}`);
    if (usageMetadata.cachedContentTokenCount) {
      console.log(`💰 [Gemini Cache] Cached tokens: ${usageMetadata.cachedContentTokenCount} (75% discount)`);
    }
  }

  return candidate.content.parts[0].text;
}

/**
 * Call Gemini and return both text and token usage metadata
 * Use this when you need to log token usage for admin analytics
 */
export async function callGeminiWithUsage(
  prompt: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  maxOutputTokens: number = 16384,
  jsonMode: boolean = false,
  cacheName?: string
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
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
        role: 'user',  // Required when using cachedContent
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
    `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
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

    // No content was generated - this is a critical error
    console.error('❌ CRITICAL: MAX_TOKENS reached but no content was generated!');
    console.error('This typically means:');
    console.error('  1. The input is too large for the model to process');
    console.error('  2. The output limit is set too high relative to input size');
    console.error('  3. There may be an API issue');

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

export async function callGeminiWithFile(
  prompt: string,
  fileData: string,
  mimeType: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  jsonMode: boolean = false
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Build generation config with optional JSON mode
  const generationConfig: any = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 16384, // Gemini 2.5 supports up to 16k output tokens
  };

  // Enable native JSON mode to save prompt tokens and ensure valid JSON
  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
    console.log('🔧 [Gemini] JSON mode enabled for file processing');
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: fileData,
                },
              },
            ],
          },
        ],
        generationConfig,
      }),
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
      `- File too large or prompt too complex\n` +
      `- Content safety filters triggered\n` +
      `- API quota exceeded\n` +
      `Response: ${JSON.stringify(data).substring(0, 500)}`
    );
  }

  const candidate = data.candidates[0];

  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    console.error('❌ Invalid candidate structure:', JSON.stringify(candidate, null, 2));
    throw new Error(`Gemini candidate has no content. Response: ${JSON.stringify(candidate).substring(0, 500)}`);
  }

  return candidate.content.parts[0].text;
}

/**
 * Attempts to recover a partial object from truncated JSON
 * Used for responses that return a single object (e.g., summaries)
 * Extracts complete fields even if the object is not fully closed
 */
function recoverPartialObject(text: string): any | null {
  console.warn('🔧 Attempting to recover partial object from truncated JSON...');

  const recovered: any = {};

  // Find all complete string fields (including those with proper closing quotes)
  const stringFieldPattern = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;

  while ((match = stringFieldPattern.exec(text)) !== null) {
    const key = match[1];
    const value = match[2];

    // Unescape the value
    try {
      recovered[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      console.log(`✅ Recovered field: "${key}" (${value.length} chars)`);
    } catch (e) {
      console.warn(`⚠️ Failed to unescape field "${key}": ${e.message}`);
    }
  }

  // IMPROVED: Try to recover truncated string fields (without closing quote)
  // This helps with long HTML content that gets cut off
  if (Object.keys(recovered).length === 0 || !recovered.conteudo_html) {
    const truncatedStringPattern = /"([^"]+)"\s*:\s*"([^"]*?)$/;
    const truncMatch = text.match(truncatedStringPattern);
    if (truncMatch) {
      const key = truncMatch[1];
      let value = truncMatch[2];

      // Try to extract more content by looking backwards for the field start
      const fieldStart = text.lastIndexOf(`"${key}"`);
      if (fieldStart !== -1) {
        const colonPos = text.indexOf(':', fieldStart);
        const quotePos = text.indexOf('"', colonPos + 1);
        if (quotePos !== -1) {
          value = text.substring(quotePos + 1);
          // Clean up any trailing incomplete escape sequences
          value = value.replace(/\\+$/, '');
        }
      }

      if (value.length > 10) { // Only recover if we got substantial content
        recovered[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        console.log(`✅ Recovered TRUNCATED field: "${key}" (${value.length} chars, incomplete)`);
      }
    }
  }

  // Find complete array fields
  const arrayFieldPattern = /"([^"]+)"\s*:\s*\[((?:[^\[\]]*(?:\[[^\]]*\])?)*)\]/g;
  while ((match = arrayFieldPattern.exec(text)) !== null) {
    const key = match[1];
    const arrayContent = match[2];

    try {
      recovered[key] = JSON.parse(`[${arrayContent}]`);
      console.log(`✅ Recovered array field: "${key}" (${recovered[key].length} items)`);
    } catch (e) {
      console.warn(`⚠️ Failed to parse array field "${key}": ${e.message}`);
    }
  }

  // IMPROVED: Try to recover partial arrays for topicos
  if (!recovered.topicos) {
    const partialArrayPattern = /"topicos"\s*:\s*\[(.*?)(?:\]|$)/;
    const partialMatch = text.match(partialArrayPattern);
    if (partialMatch) {
      const arrayContent = partialMatch[1];
      // Extract all complete string items
      const items: string[] = [];
      const itemPattern = /"([^"]+)"/g;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(arrayContent)) !== null) {
        items.push(itemMatch[1]);
      }
      if (items.length > 0) {
        recovered.topicos = items;
        console.log(`✅ Recovered partial array "topicos" (${items.length} items)`);
      }
    }
  }

  // Find complete number fields
  const numberFieldPattern = /"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)/g;
  while ((match = numberFieldPattern.exec(text)) !== null) {
    const key = match[1];
    const value = parseFloat(match[2]);
    recovered[key] = value;
    console.log(`✅ Recovered number field: "${key}" = ${value}`);
  }

  // Find complete boolean fields
  const boolFieldPattern = /"([^"]+)"\s*:\s*(true|false)/g;
  while ((match = boolFieldPattern.exec(text)) !== null) {
    const key = match[1];
    const value = match[2] === 'true';
    recovered[key] = value;
    console.log(`✅ Recovered boolean field: "${key}" = ${value}`);
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
 * Attempts to recover valid items from a truncated JSON array
 * Used when the API response was cut off mid-generation
 */
function recoverItemsFromTruncatedJson(text: string, arrayKey?: string): any[] {
  console.warn('🔧 Attempting to recover valid items from truncated JSON...');

  const items: any[] = [];

  // Auto-detect array key if not provided
  let detectedKey = arrayKey;
  if (!detectedKey) {
    // Try common array names (including topicos for summaries)
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
        console.warn(`⚠️ Failed to parse recovered object: ${e.message}`);
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
  } catch (firstError) {
    console.warn(`⚠️ Initial JSON parse failed: ${firstError.message}`);

    // Check if error is due to unterminated string or unexpected end
    if (firstError.message.includes('Unterminated string') ||
        firstError.message.includes('Unexpected end of JSON') ||
        firstError.message.includes('Expected') && isTruncated) {
      console.warn('🔧 JSON truncated by token limit. Attempting recovery...');

      // Try to recover partial items (auto-detect array key)
      const recoveredItems = recoverItemsFromTruncatedJson(cleaned);
      if (recoveredItems.length > 0) {
        // Detect which array key was used
        const arrayKey = cleaned.indexOf('"flashcards"') !== -1 ? 'flashcards' : 'perguntas';
        console.log(`✅ Recovered ${recoveredItems.length} complete items from truncated response`);
        return { [arrayKey]: recoveredItems };
      }

      // If no array items recovered, try to recover partial object (for summaries, etc)
      console.warn('⚠️ No array items recovered. Trying partial object recovery...');
      const partialObject = recoverPartialObject(cleaned);
      if (partialObject && Object.keys(partialObject).length > 0) {
        console.log(`✅ Recovered partial object with ${Object.keys(partialObject).length} fields`);
        return partialObject;
      }

      throw new Error(`Response was truncated at ${cleaned.length} characters. Could not recover sufficient data. Please try again.`);
    }

    // Try to find complete JSON object/array in text
    const objMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[1]);
      } catch {
        // Try to fix common issues
        let fixed = objMatch[1];

        // Remove trailing commas before } or ]
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

        try {
          return JSON.parse(fixed);
        } catch (fixError) {
          console.warn('⚠️ Could not fix JSON, attempting item recovery...');

          // Last resort: try to recover items (auto-detect array key)
          const recoveredItems = recoverItemsFromTruncatedJson(fixed);
          if (recoveredItems.length > 0) {
            // Detect which array key was used
            const arrayKey = fixed.indexOf('"flashcards"') !== -1 ? 'flashcards' : 'perguntas';
            console.log(`✅ Recovered ${recoveredItems.length} items after fix attempt`);
            return { [arrayKey]: recoveredItems };
          }

          // If no array items, try partial object recovery
          console.warn('⚠️ Last resort: trying partial object recovery...');
          const partialObject = recoverPartialObject(fixed);
          if (partialObject && Object.keys(partialObject).length > 0) {
            console.log(`✅ Recovered partial object with ${Object.keys(partialObject).length} fields (last resort)`);
            return partialObject;
          }

          console.error('Failed to parse JSON after fixes:', {
            originalError: firstError,
            fixError,
            sample: fixed.substring(0, 200)
          });
          throw new Error(`Could not parse JSON from response. Sample: ${cleaned.substring(0, 200)}...`);
        }
      }
    }

    const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[1]);
      } catch {
        // Try to fix trailing commas
        let fixed = arrMatch[1].replace(/,(\s*\])/g, '$1');
        try {
          return JSON.parse(fixed);
        } catch (arrError) {
          console.error('Failed to parse JSON array:', {
            error: arrError,
            sample: fixed.substring(0, 200)
          });
        }
      }
    }

    console.error('All JSON parse attempts failed:', {
      error: firstError,
      textSample: cleaned.substring(0, 300)
    });
    throw new Error(`Could not parse JSON from response. Error: ${firstError.message}`);
  }
}
