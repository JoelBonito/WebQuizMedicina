import { GoogleGenerativeAI } from '@google/generative-ai';

export class IntelligentModelSelector {
    private genAI: GoogleGenerativeAI;
    private apiKey: string;
    private modelCache: any[] | null;
    private cacheExpiry: number | null;
    private readonly CACHE_TTL: number;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelCache = null;
        this.cacheExpiry = null;
        this.CACHE_TTL = 3600000; // 1 hora
    }

    // 1️⃣ DESCOBERTA AUTOMÁTICA de modelos disponíveis
    async discoverModels() {
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
                .filter((m: any) =>
                    m.supportedGenerationMethods?.includes('generateContent') ||
                    m.supportedGenerationMethods?.includes('embedContent')
                )
                .map((m: any) => ({
                    name: m.name.replace('models/', ''),
                    displayName: m.displayName,
                    version: m.version,
                    inputTokenLimit: m.inputTokenLimit,
                    outputTokenLimit: m.outputTokenLimit,
                    methods: m.supportedGenerationMethods
                }));

            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            console.log(`✅ Discovered ${this.modelCache?.length} available models via API`);

            return this.modelCache;
        } catch (error) {
            console.error('❌ Failed to discover models:', error);
            return this.getFallbackModels(); // Lista estática como backup
        }
    }

    // 2️⃣ PRIORIDADES CONFIGURÁVEIS
    getModelPriorities(task: 'general' | 'complex' | 'embedding' = 'general'): string[] {
        const priorities = {
            // Para geração de quiz/flashcards (rápido e econômico)
            general: [
                'gemini-flash-latest',
                'gemini-2.5-flash',
                'gemini-2.0-flash-exp',
                'gemini-pro-latest'
            ],

            // Para tarefas complexas (máxima capacidade)
            complex: [
                'gemini-pro-latest',
                'gemini-2.5-pro',
                'gemini-flash-latest'
            ],

            // Para embeddings
            embedding: [
                'gemini-embedding-001', // Modelo estável e recomendado
                'text-embedding-004'     // Fallback
            ]
        };

        return priorities[task] || priorities.general;
    }

    // 3️⃣ SELEÇÃO INTELIGENTE com fallback automático
    async selectBestModel(task: 'general' | 'complex' | 'embedding' = 'general'): Promise<string> {
        const availableModels = await this.discoverModels();
        const priorities = this.getModelPriorities(task);

        // Encontrar primeiro modelo disponível da lista de prioridades
        if (availableModels) {
            for (const preferredModel of priorities) {
                const isAvailable = availableModels.some(m =>
                    m.name === preferredModel ||
                    m.name.includes(preferredModel.split('-')[0])
                );

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
        const fallback = availableModels && availableModels.length > 0 ? availableModels[0]?.name : null;
        if (fallback) {
            console.warn(`⚠️ Using fallback model from API list: ${fallback}`);
            return fallback;
        }

        return 'gemini-flash-latest'; // Último recurso absoluto
    }

    // 4️⃣ FALLBACK ESTÁTICO (caso API de discovery falhe)
    getFallbackModels() {
        return [
            { name: 'gemini-flash-latest', displayName: 'Gemini Flash Latest' },
            { name: 'gemini-pro-latest', displayName: 'Gemini Pro Latest' }
        ];
    }

    // 5️⃣ HEALTH CHECK periódico
    async testModel(modelName: string) {
        try {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            await model.generateContent('Test');
            return { healthy: true, model: modelName };
        } catch (error: any) {
            console.error(`❌ Model ${modelName} failed health check:`, error.message);
            return { healthy: false, model: modelName, error: error.message };
        }
    }
}

// Singleton instance
let modelSelector: IntelligentModelSelector | null = null;

export function getModelSelector(): IntelligentModelSelector {
    if (!modelSelector) {
        const apiKey = process.env.GEMINI_API_KEY || "";
        modelSelector = new IntelligentModelSelector(apiKey);
    }
    return modelSelector;
}
