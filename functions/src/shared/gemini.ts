import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export function getGenAI(): GoogleGenerativeAI {
    if (!genAI) {
        const API_KEY = process.env.GEMINI_API_KEY || "";
        genAI = new GoogleGenerativeAI(API_KEY);
    }
    return genAI;
}

export const SAFE_OUTPUT_LIMIT = 32768; // Increased for Gemini 2.5 thinking tokens

export async function callGeminiWithUsage(
    prompt: string | Array<string | any>,
    modelName: string = "gemini-2.5-flash",
    maxOutputTokens: number = SAFE_OUTPUT_LIMIT,
    jsonMode: boolean = false,
    cacheName?: string
) {
    try {
        const ai = getGenAI();
        const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens,
                responseMimeType: jsonMode ? "application/json" : "text/plain",
            },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ],
        });

        // Note: Caching support in Node.js SDK might differ from Deno.
        // For now, we'll proceed with standard generation.
        // If cacheName is provided, we might need to use a specific caching API if available in Node SDK.

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Usage metadata is available in result.response.usageMetadata
        const usage = response.usageMetadata || {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0
        };

        return {
            text,
            usage: {
                inputTokens: usage.promptTokenCount || 0,
                outputTokens: usage.candidatesTokenCount || 0,
                totalTokens: usage.totalTokenCount || 0,
                cachedTokens: 0 // Placeholder as caching API differs
            }
        };
    } catch (error) {
        console.error("Error calling Gemini:", error);
        throw error;
    }
}

export function parseJsonFromResponse(text: string): any {
    // Helper to sanitize invalid escape sequences in JSON strings
    // LaTeX commands like \downarrow, \rightarrow become \\d, \\r which are invalid JSON escapes
    const sanitizeEscapes = (str: string): string => {
        // Replace invalid escape sequences with double-escaped versions
        // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
        // This regex finds backslashes NOT followed by valid escape chars
        return str.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    };

    // Helper to attempt parsing
    const tryParse = (str: string) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            // Try with sanitized escapes
            try {
                return JSON.parse(sanitizeEscapes(str));
            } catch (e2) {
                return null;
            }
        }
    };

    // 1. Try parsing raw text first
    let result = tryParse(text);
    if (result) return result;

    // 2. Try cleaning markdown code blocks
    let cleanText = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
    cleanText = cleanText.replace(/^```\s*/, "");
    result = tryParse(cleanText);
    if (result) return result;


    // 3. Try finding the first '{' and last '}' (or '[' and ']')
    const firstOpenBrace = text.indexOf('{');
    const firstOpenBracket = text.indexOf('[');
    let start = -1;
    let end = -1;

    // Determine if we are looking for an object or array
    if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
        start = firstOpenBrace;
        end = text.lastIndexOf('}');
    } else if (firstOpenBracket !== -1) {
        start = firstOpenBracket;
        end = text.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
        const jsonSubstring = text.substring(start, end + 1);
        result = tryParse(jsonSubstring);
        if (result) return result;

        // 4. Try cleaning trailing commas (common AI error) on the substring
        // Remove comma before closing brace/bracket: , } -> } and , ] -> ]
        const noTrailingCommas = jsonSubstring.replace(/,\s*([\]}])/g, '$1');
        result = tryParse(noTrailingCommas);
        if (result) return result;
    }

    // 5. Try cleaning trailing commas on the main cleanText if substring failed or wasn't tried
    const noTrailingCommasText = cleanText.replace(/,\s*([\]}])/g, '$1');
    result = tryParse(noTrailingCommasText);
    if (result) return result;

    // If all attempts fail, log the error and text
    console.error("Failed to parse JSON from Gemini response. Text length:", text.length);
    // Log start and end of text to help debug without flooding huge logs if possible, 
    // or log everything if needed (Firebase log truncation might hide the middle).
    console.error("Original Text Start:", text.substring(0, 500));
    console.error("Original Text End:", text.substring(text.length - 500));

    // Attempt to log specific parse error from the cleanest attempt
    try {
        JSON.parse(cleanText);
    } catch (e: any) {
        console.error("Specific Parse Error:", e.message);
    }

    throw new Error("Invalid JSON response from AI");
}

export async function getEmbedding(text: string, modelName: string = "text-embedding-004"): Promise<number[]> {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: modelName });
    const result = await model.embedContent(text);
    return result.embedding.values;
}
