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
}

export async function callGemini(
  prompt: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash',
  maxOutputTokens: number = 8192
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Log prompt size for debugging
  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 4); // Rough estimate: 1 token ≈ 4 characters
  console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);

  if (estimatedTokens > 30000) {
    console.warn(`⚠️ [Gemini] Very large prompt detected! This may cause API errors. Consider reducing content.`);
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
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens,
        },
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
      `- Prompt too large (try reducing content or number of items)\n` +
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

  const finishReason = candidate.finishReason;

  // Check if response was truncated
  if (finishReason === 'MAX_TOKENS') {
    console.warn('⚠️ Gemini response was truncated due to MAX_TOKENS limit. Consider requesting less content or increasing maxOutputTokens.');
  }

  // Check for other problematic finish reasons
  if (finishReason === 'SAFETY') {
    throw new Error('Response blocked by safety filters. Content may contain sensitive medical information.');
  }

  if (finishReason === 'RECITATION') {
    console.warn('⚠️ Response flagged for recitation. Content may be too similar to training data.');
  }

  return candidate.content.parts[0].text;
}

export async function callGeminiWithFile(
  prompt: string,
  fileData: string,
  mimeType: string,
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite' = 'gemini-2.5-flash'
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
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
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
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
 * Attempts to recover valid items from a truncated JSON array
 * Used when the API response was cut off mid-generation
 */
function recoverItemsFromTruncatedJson(text: string, arrayKey: string = 'perguntas'): any[] {
  console.warn('🔧 Attempting to recover valid items from truncated JSON...');

  const items: any[] = [];

  // Try to find the start of the array
  const arrayStart = text.indexOf(`"${arrayKey}"`);
  if (arrayStart === -1) {
    console.error(`❌ Could not find "${arrayKey}" array in response`);
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

      // Try to recover partial items
      const recoveredItems = recoverItemsFromTruncatedJson(cleaned, 'perguntas');
      if (recoveredItems.length > 0) {
        console.log(`✅ Recovered ${recoveredItems.length} complete items from truncated response`);
        return { perguntas: recoveredItems };
      }

      throw new Error(`Response was truncated at ${cleaned.length} characters. Recovered 0 items. Please try requesting fewer questions.`);
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

          // Last resort: try to recover items
          const recoveredItems = recoverItemsFromTruncatedJson(fixed, 'perguntas');
          if (recoveredItems.length > 0) {
            console.log(`✅ Recovered ${recoveredItems.length} items after fix attempt`);
            return { perguntas: recoveredItems };
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
