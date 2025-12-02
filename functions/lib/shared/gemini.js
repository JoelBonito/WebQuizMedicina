"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbedding = exports.parseJsonFromResponse = exports.callGeminiWithUsage = exports.SAFE_OUTPUT_LIMIT = void 0;
const generative_ai_1 = require("@google/generative-ai");
const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new generative_ai_1.GoogleGenerativeAI(API_KEY);
exports.SAFE_OUTPUT_LIMIT = 8192;
async function callGeminiWithUsage(prompt, modelName = "gemini-2.5-flash", maxOutputTokens = exports.SAFE_OUTPUT_LIMIT, jsonMode = false, cacheName) {
    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens,
                responseMimeType: jsonMode ? "application/json" : "text/plain",
            },
            safetySettings: [
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
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
    }
    catch (error) {
        console.error("Error calling Gemini:", error);
        throw error;
    }
}
exports.callGeminiWithUsage = callGeminiWithUsage;
function parseJsonFromResponse(text) {
    // 1. Try parsing raw text first
    try {
        return JSON.parse(text);
    }
    catch (e) {
        // Continue to cleaning strategies
    }
    // 2. Try cleaning markdown code blocks
    try {
        let cleanText = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
        // Also handle just ``` at start if json tag was missing
        cleanText = cleanText.replace(/^```\s*/, "");
        return JSON.parse(cleanText);
    }
    catch (e) {
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
        }
        else if (firstOpenBracket !== -1) {
            start = firstOpenBracket;
            end = text.lastIndexOf(']');
        }
        if (start !== -1 && end !== -1 && end > start) {
            const jsonSubstring = text.substring(start, end + 1);
            return JSON.parse(jsonSubstring);
        }
    }
    catch (e) {
        // Ignore
    }
    console.error("Failed to parse JSON from Gemini response:", text);
    throw new Error("Invalid JSON response from AI");
}
exports.parseJsonFromResponse = parseJsonFromResponse;
async function getEmbedding(text, modelName = "text-embedding-004") {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.embedContent(text);
    return result.embedding.values;
}
exports.getEmbedding = getEmbedding;
//# sourceMappingURL=gemini.js.map