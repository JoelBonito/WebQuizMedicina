"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuiz = void 0;
const cors = __importStar(require("cors"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const firestore_1 = require("../utils/firestore");
const gemini_1 = require("../lib/gemini");
const params_1 = require("firebase-functions/params");
const corsHandler = cors({ origin: true });
const geminiApiKeyParam = (0, params_1.defineString)('GEMINI_API_KEY');
const generateQuiz = async (req, res) => {
    return corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const idToken = authHeader.split('Bearer ')[1];
            let decodedToken;
            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
            }
            catch (e) {
                res.status(401).json({ error: 'Invalid token' });
                return;
            }
            const userId = decodedToken.uid;
            const { source_id, project_id, count = 5, difficulty } = req.body;
            // Buscar Fontes
            let sources = [];
            const sourcesRef = firestore_1.db.collection(firestore_1.COLLECTIONS.SOURCES);
            if (source_id) {
                const doc = await sourcesRef.doc(source_id).get();
                if (doc.exists)
                    sources = [Object.assign({ id: doc.id }, doc.data())];
            }
            else if (project_id) {
                const snapshot = await sourcesRef.where('project_id', '==', project_id)
                    .where('status', '==', 'ready')
                    .orderBy('created_at', 'desc')
                    .get();
                sources = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            }
            if (sources.length === 0)
                throw new Error("No sources found");
            // Filtrar fontes com conteúdo
            const sourcesWithContent = sources.filter((s) => s.extracted_content && s.extracted_content.trim());
            if (sourcesWithContent.length === 0) {
                throw new Error(`Sources found but no content available.`);
            }
            // Combinar conteúdo (Limitado a 5 fontes recentes para exemplo)
            const MAX_SOURCES = 5;
            const usedSources = sourcesWithContent.slice(0, MAX_SOURCES);
            let combinedContent = "";
            for (const source of usedSources) {
                const sData = source;
                combinedContent += `\n\n=== ${sData.name} ===\n${sData.extracted_content}`;
            }
            const MAX_CONTENT_LENGTH = 300000;
            if (combinedContent.length > MAX_CONTENT_LENGTH) {
                combinedContent = combinedContent.substring(0, MAX_CONTENT_LENGTH);
            }
            // Gerar Quiz
            const sessionId = crypto.randomUUID();
            const prompt = `
Você é um professor universitário de MEDICINA criando uma prova.
Gere ${count} questões baseadas no CONTEÚDO abaixo.

CONTEÚDO BASE:
${combinedContent.substring(0, 50000)} 

TIPOS DE QUESTÃO:
1. "multipla_escolha"
2. "verdadeiro_falso"

REGRAS:
- TODAS as questões devem ter APENAS UMA alternativa correta.
- Justificativa CURTA em Português do Brasil.
${difficulty ? `DIFICULDADE: ${difficulty}` : ''}

FORMATO JSON:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Texto da pergunta...",
      "opcoes": ["A) ...", "B) ..."],
      "resposta_correta": "A",
      "justificativa": "Explicação...",
      "dica": "Dica...",
      "dificuldade": "médio",
      "topico": "Cardiologia"
    }
  ]
}
      `;
            const result = await (0, gemini_1.callGeminiWithUsage)(prompt, 'gemini-2.5-flash', 60000, true);
            const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            if (!parsed.perguntas || !Array.isArray(parsed.perguntas)) {
                throw new Error('Invalid questions format');
            }
            // Salvar Questões
            const questionsRef = firestore_1.db.collection(firestore_1.COLLECTIONS.QUESTIONS);
            const batch = firestore_1.db.batch();
            const insertedQuestions = [];
            parsed.perguntas.forEach((q) => {
                const newDocRef = questionsRef.doc();
                const questionData = {
                    project_id: project_id || sources[0].project_id,
                    source_id: source_id || null,
                    session_id: sessionId,
                    tipo: q.tipo || "multipla_escolha",
                    pergunta: q.pergunta,
                    opcoes: q.opcoes || [],
                    resposta_correta: q.resposta_correta,
                    justificativa: q.justificativa,
                    dica: q.dica,
                    topico: q.topico || "Geral",
                    dificuldade: q.dificuldade || "médio",
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                };
                batch.set(newDocRef, (0, firestore_1.sanitizeData)(questionData));
                insertedQuestions.push(Object.assign({ id: newDocRef.id }, questionData));
            });
            await batch.commit();
            res.status(200).json({
                success: true,
                count: insertedQuestions.length,
                session_id: sessionId,
                questions: insertedQuestions
            });
        }
        catch (error) {
            console.error("Critical Error in generate-quiz:", error);
            res.status(500).json({ error: error.message || "Internal Server Error" });
        }
    });
};
exports.generateQuiz = generateQuiz;
//# sourceMappingURL=generateQuiz.js.map