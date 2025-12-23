"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligentModelSelector = void 0;
exports.getModelSelector = getModelSelector;
const generative_ai_1 = require("@google/generative-ai");
class IntelligentModelSelector {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.modelCache = null;
        this.cacheExpiry = null;
        this.CACHE_TTL = 3600000; // 1 hora
    }
    // 1️⃣ DESCOBERTA AUTOMÁTICA de modelos disponíveis
    async discoverModels() {
        var _a;
        // Cache para evitar chamadas excessivas
        if (this.modelCache && this.cacheExpiry && Date.now() < this.cacheExpiry) {
            return this.modelCache;
        }
        try {
            // SDK fallback: fetch directly from API since listModels is not on the main class in this version
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const models = data.models || [];
            // Filtrar modelos que suportam generateContent OU embedContent
            this.modelCache = models
                .filter((m) => {
                var _a, _b;
                return ((_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes('generateContent')) ||
                    ((_b = m.supportedGenerationMethods) === null || _b === void 0 ? void 0 : _b.includes('embedContent'));
            })
                .map((m) => ({
                name: m.name.replace('models/', ''),
                displayName: m.displayName,
                version: m.version,
                inputTokenLimit: m.inputTokenLimit,
                outputTokenLimit: m.outputTokenLimit,
                methods: m.supportedGenerationMethods
            }));
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            console.log(`✅ Discovered ${(_a = this.modelCache) === null || _a === void 0 ? void 0 : _a.length} available models via API`);
            return this.modelCache;
        }
        catch (error) {
            console.error('❌ Failed to discover models:', error);
            return this.getFallbackModels(); // Lista estática como backup
        }
    }
    // 2️⃣ PRIORIDADES CONFIGURÁVEIS
    getModelPriorities(task = 'general') {
        const priorities = {
            // Para geração de quiz/flashcards (rápido e econômico)
            general: [
                'gemini-3-flash-preview', // Modelo mais recente (Dezembro 2025) - Pro-level performance com Flash speed
                'gemini-2.5-flash', // Modelo estável (Junho 2025)
                'gemini-flash-latest',
                'gemini-2.0-flash-exp',
                'gemini-pro-latest'
            ],
            // Para tarefas complexas (máxima capacidade)
            complex: [
                'gemini-3-flash-preview', // Modelo mais recente com raciocínio avançado
                'gemini-2.5-flash', // Modelo estável (Junho 2025)
                'gemini-2.5-pro',
                'gemini-pro-latest',
                'gemini-flash-latest'
            ],
            // Para embeddings
            embedding: [
                'gemini-embedding-001', // Modelo estável e recomendado
                'text-embedding-004' // Fallback
            ]
        };
        return priorities[task] || priorities.general;
    }
    // 3️⃣ SELEÇÃO INTELIGENTE com fallback automático
    async selectBestModel(task = 'general') {
        var _a;
        const availableModels = await this.discoverModels();
        const priorities = this.getModelPriorities(task);
        // Encontrar primeiro modelo disponível da lista de prioridades
        if (availableModels) {
            for (const preferredModel of priorities) {
                const isAvailable = availableModels.some(m => m.name === preferredModel ||
                    m.name.includes(preferredModel.split('-')[0]));
                if (isAvailable) {
                    console.log(`✅ Selected model: ${preferredModel} (task: ${task})`);
                    return preferredModel;
                }
            }
        }
        // B. Fallback Específico por Tarefa (CORREÇÃO CRÍTICA)
        // Se for embedding, NUNCA retorne um modelo de chat genérico (flash/pro)
        if (task === 'embedding') {
            const fallbackEmbedding = 'text-embedding-004';
            console.warn(`⚠️ Embedding model lookup failed via API. Forcing fallback to ${fallbackEmbedding}.`);
            return fallbackEmbedding;
        }
        // C. Fallback Genérico (apenas para tarefas de texto/chat)
        const fallback = availableModels && availableModels.length > 0 ? (_a = availableModels[0]) === null || _a === void 0 ? void 0 : _a.name : null;
        if (fallback) {
            console.warn(`⚠️ Using fallback model from API list: ${fallback}`);
            return fallback;
        }
        return 'gemini-3-flash-preview'; // Último recurso absoluto (modelo mais recente)
    }
    // 4️⃣ FALLBACK ESTÁTICO (caso API de discovery falhe)
    getFallbackModels() {
        return [
            { name: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview' },
            { name: 'gemini-flash-latest', displayName: 'Gemini Flash Latest' },
            { name: 'gemini-pro-latest', displayName: 'Gemini Pro Latest' }
        ];
    }
    // 5️⃣ HEALTH CHECK periódico
    async testModel(modelName) {
        try {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            await model.generateContent('Test');
            return { healthy: true, model: modelName };
        }
        catch (error) {
            console.error(`❌ Model ${modelName} failed health check:`, error.message);
            return { healthy: false, model: modelName, error: error.message };
        }
    }
}
exports.IntelligentModelSelector = IntelligentModelSelector;
// Singleton instance
let modelSelector = null;
function getModelSelector() {
    if (!modelSelector) {
        const apiKey = process.env.GEMINI_API_KEY || "";
        modelSelector = new IntelligentModelSelector(apiKey);
    }
    return modelSelector;
}
//# sourceMappingURL=modelSelector.js.map