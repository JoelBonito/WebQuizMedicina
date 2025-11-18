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
  if (cleaned.length > 100) {
    const lastChars = cleaned.slice(-50);
    // Check if JSON ends abruptly without proper closing
    if (!lastChars.match(/[}\]]\s*$/)) {
      console.warn('⚠️ JSON appears to be truncated - does not end with } or ]');
    }
  }

  // Try to parse directly
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Check if error is due to unterminated string
    if (firstError.message.includes('Unterminated string')) {
      console.error('❌ JSON has unterminated string - likely truncated by token limit');
      throw new Error('Response was truncated. Please try requesting less content (e.g., fewer questions).');
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

        // Fix unescaped quotes in strings (basic attempt)
        // This is risky, so only try if nothing else worked

        try {
          return JSON.parse(fixed);
        } catch (fixError) {
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
