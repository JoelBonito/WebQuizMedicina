import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export const SAFE_OUTPUT_LIMIT = 8192;

export async function callGeminiWithUsage(
    prompt: string,
    modelName: string = "gemini-2.5-flash",
    maxOutputTokens: number = SAFE_OUTPUT_LIMIT,
    jsonMode: boolean = false,
    cacheName?: string
) {
    try {
        const model = genAI.getGenerativeModel({
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
                inputTokens: usage.promptTokenCount,
                outputTokens: usage.candidatesTokenCount,
                totalTokens: usage.totalTokenCount,
                cachedTokens: 0 // Placeholder as caching API differs
            }
        };
    } catch (error) {
        console.error("Error calling Gemini:", error);
        throw error;
    }
}

export function parseJsonFromResponse(text: string): any {
    // 1. Try parsing raw text first
    try {
        return JSON.parse(text);
    } catch (e) {
        // Continue to cleaning strategies
    }

    // 2. Try cleaning markdown code blocks
    try {
        let cleanText = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
        // Also handle just ``` at start if json tag was missing
        cleanText = cleanText.replace(/^```\s*/, "");
        return JSON.parse(cleanText);
    } catch (e) {
        // Continue to substring extraction
    }

    // 3. Try finding the first '{' and last '}' (or '[' and ']')
    try {
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
            return JSON.parse(jsonSubstring);
        }
    } catch (e) {
        // Ignore
    }

    console.error("Failed to parse JSON from Gemini response:", text);
    throw new Error("Invalid JSON response from AI");
}

export async function getEmbedding(text: string, modelName: string = "text-embedding-004"): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.embedContent(text);
    return result.embedding.values;
}
