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
  model: 'gemini-2.5-flash' | 'gemini-2.0-flash-exp' = 'gemini-2.5-flash',
  maxOutputTokens: number = 65535, // Atualizado para o limite real do 2.5 Flash
  jsonMode: boolean = false, 
  cacheName?: string 
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 4);

  if (cacheName) {
    console.log(`📊 [Gemini] Using cached content: ${cacheName}`);
  } else {
    console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);
    
    // Aviso atualizado para o limite real de 1 Milhão
    if (estimatedTokens + maxOutputTokens > 900000) {
      console.warn(`⚠️ [Gemini] Total context (~${estimatedTokens + maxOutputTokens}) is approaching the 1M token limit.`);
    }
  }

  const generationConfig: any = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
    console.log('🔧 [Gemini] JSON mode enabled');
  }

  const requestBody: any = {
    generationConfig,
  };

  if (cacheName) {
    requestBody.cachedContent = cacheName;
    requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
  } else {
    requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: GeminiResponse = await response.json();

  if (!data.candidates || !data.candidates.length) {
    throw new Error(`Gemini returned invalid response: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const candidate = data.candidates[0];
  
  if (candidate.finishReason === 'MAX_TOKENS') {
    console.error('❌ Gemini response truncated (MAX_TOKENS)');
    // Tenta recuperar o que for possível
    if (candidate.content?.parts?.[0]?.text) {
        console.warn(`⚠️ Recovering partial content (${candidate.content.parts[0].text.length} chars)`);
        return candidate.content.parts[0].text;
    }
    throw new Error('Response truncated by token limit');
  }

  if (!candidate.content?.parts?.[0]) {
    throw new Error('Gemini candidate has no content');
  }

  return candidate.content.parts[0].text;
}

/**
 * Call Gemini and return both text and token usage metadata
 */
export async function callGeminiWithUsage(
  prompt: string,
  model: 'gemini-2.5-flash' | 'gemini-2.0-flash-exp' = 'gemini-2.5-flash',
  maxOutputTokens: number = 65535, // Atualizado
  jsonMode: boolean = false,
  cacheName?: string
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 4);

  if (cacheName) {
    console.log(`📊 [Gemini] Using cached content: ${cacheName}`);
  } else {
    console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);
  }

  const generationConfig: any = {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
  }

  const requestBody: any = { generationConfig };

  if (cacheName) {
    requestBody.cachedContent = cacheName;
    requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
  } else {
    requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data: GeminiResponse = await response.json();

  if (!data.candidates || !data.candidates.length) {
    throw new Error('Gemini returned invalid response structure');
  }

  const candidate = data.candidates[0];

  if (candidate.finishReason === 'MAX_TOKENS') {
    console.error('❌ Gemini response truncated (MAX_TOKENS)');
    if (candidate.content?.parts?.[0]?.text) {
        console.warn(`⚠️ Recovering partial content`);
        return {
            text: candidate.content.parts[0].text,
            usage: {
                inputTokens: data.usageMetadata?.promptTokenCount || estimatedTokens,
                outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
                cachedTokens: data.usageMetadata?.cachedContentTokenCount || 0,
            }
        };
    }
    throw new Error('Response truncated by token limit');
  }

  const text = candidate.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content generated');

  const usage = {
    inputTokens: data.usageMetadata?.promptTokenCount || estimatedTokens,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    cachedTokens: data.usageMetadata?.cachedContentTokenCount || 0,
  };

  console.log(`📊 [Gemini Usage] In: ${usage.inputTokens}, Out: ${usage.outputTokens}`);

  return { text, usage };
}

// Mantenha as funções de recoverPartialObject e recoverItemsFromTruncatedJson originais abaixo...
// (Elas são úteis e seguras, não precisam de alteração, apenas certifique-se de que estão no arquivo)
// ...
export function recoverPartialObject(text: string): any | null {
    // ... (Código original de recuperação)
    console.warn('🔧 Attempting to recover partial object...');
    const recovered: any = {};
    // ... (Mantenha a lógica original)
    return recovered; 
}
// ...
export function parseJsonFromResponse(text: string): any {
    // ... (Código original de parse)
    let cleaned = text.trim();
    // ...
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // ...
        return {}; // Fallback simples
    }
}
