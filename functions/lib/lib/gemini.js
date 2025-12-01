"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonFromResponse = exports.callGeminiWithUsage = void 0;
const params_1 = require("firebase-functions/params");
const geminiApiKeyParam = (0, params_1.defineString)('GEMINI_API_KEY');
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
async function callGeminiWithUsage(prompt, model = 'gemini-2.5-flash', maxOutputTokens = 65535, jsonMode = false, cacheName) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const apiKey = geminiApiKeyParam.value() || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
    }
    const promptChars = prompt.length;
    const estimatedTokens = Math.ceil(promptChars / 4);
    if (cacheName) {
        console.log(`📊 [Gemini] Using cached content: ${cacheName}`);
    }
    else {
        console.log(`📊 [Gemini] Sending prompt: ${promptChars} chars (~${estimatedTokens} tokens), model: ${model}, maxOutputTokens: ${maxOutputTokens}`);
    }
    const generationConfig = {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens,
    };
    if (jsonMode) {
        generationConfig.responseMimeType = "application/json";
    }
    const requestBody = {
        generationConfig,
    };
    if (cacheName) {
        requestBody.cachedContent = cacheName;
        requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
    }
    else {
        requestBody.contents = [{ role: 'user', parts: [{ text: prompt }] }];
    }
    const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${error}`);
    }
    const data = await response.json();
    if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
        throw new Error(`Gemini returned invalid response: ${JSON.stringify(data).substring(0, 500)}`);
    }
    const candidate = data.candidates[0];
    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety filters.');
    }
    if (finishReason === 'MAX_TOKENS') {
        console.error('❌ Gemini response was truncated due to MAX_TOKENS limit');
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            const partialText = candidate.content.parts[0].text;
            console.warn(`⚠️ Recovering partial content (${partialText.length} chars)`);
            return {
                text: partialText,
                usage: {
                    inputTokens: ((_a = data.usageMetadata) === null || _a === void 0 ? void 0 : _a.promptTokenCount) || estimatedTokens,
                    outputTokens: ((_b = data.usageMetadata) === null || _b === void 0 ? void 0 : _b.candidatesTokenCount) || 0,
                    cachedTokens: ((_c = data.usageMetadata) === null || _c === void 0 ? void 0 : _c.cachedContentTokenCount) || 0,
                }
            };
        }
        throw new Error('Response truncated by token limit');
    }
    const text = (_f = (_e = (_d = candidate.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text;
    if (!text)
        throw new Error('Gemini candidate has no content');
    const usage = {
        inputTokens: ((_g = data.usageMetadata) === null || _g === void 0 ? void 0 : _g.promptTokenCount) || estimatedTokens,
        outputTokens: ((_h = data.usageMetadata) === null || _h === void 0 ? void 0 : _h.candidatesTokenCount) || 0,
        cachedTokens: ((_j = data.usageMetadata) === null || _j === void 0 ? void 0 : _j.cachedContentTokenCount) || 0,
    };
    return { text, usage };
}
exports.callGeminiWithUsage = callGeminiWithUsage;
function parseJsonFromResponse(text) {
    let cleaned = text.trim();
    const jsonMatch = cleaned.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch)
        cleaned = jsonMatch[1].trim();
    const codeMatch = cleaned.match(/```\s*\n([\s\S]*?)\n```/);
    if (codeMatch)
        cleaned = codeMatch[1].trim();
    const startMatch = cleaned.match(/^[^{[]*([{[])/);
    if (startMatch)
        cleaned = cleaned.substring(cleaned.indexOf(startMatch[1]));
    try {
        return JSON.parse(cleaned);
    }
    catch (error) {
        console.warn(`⚠️ JSON parse failed: ${error.message}`);
        throw new Error(`Could not parse JSON from response: ${error.message}`);
    }
}
exports.parseJsonFromResponse = parseJsonFromResponse;
//# sourceMappingURL=gemini.js.map