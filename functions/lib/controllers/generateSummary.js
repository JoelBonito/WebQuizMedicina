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
exports.generateSummary = void 0;
const cors = __importStar(require("cors"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("../utils/firestore");
const gemini_1 = require("../lib/gemini");
const params_1 = require("firebase-functions/params");
const corsHandler = cors({ origin: true });
const geminiApiKeyParam = (0, params_1.defineString)('GEMINI_API_KEY');
// Helper simples para estimar tokens (aprox 4 chars por token)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
const generateSummary = async (req, res) => {
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
            const { source_id, source_ids, project_id } = req.body;
            if (!source_id && !source_ids && !project_id) {
                res.status(400).json({ error: 'source_id, source_ids, or project_id required' });
                return;
            }
            let sources = [];
            const sourcesRef = firestore_1.db.collection(firestore_1.COLLECTIONS.SOURCES);
            if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
                // Firestore 'in' query
                const snapshot = await sourcesRef.where(admin.firestore.FieldPath.documentId(), 'in', source_ids).get();
                sources = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            }
            else if (source_id) {
                const doc = await sourcesRef.doc(source_id).get();
                if (doc.exists) {
                    sources = [Object.assign({ id: doc.id }, doc.data())];
                }
            }
            else if (project_id) {
                const snapshot = await sourcesRef.where('project_id', '==', project_id)
                    .where('status', '==', 'ready')
                    .orderBy('created_at', 'desc')
                    .get();
                sources = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            }
            if (sources.length === 0) {
                throw new Error('No sources found');
            }
            const sourceIds = sources.map((s) => s.id);
            let combinedContent = '';
            for (const source of sources) {
                const sData = source;
                if (sData.extracted_content) {
                    combinedContent += `\n\n=== ${sData.name} ===\n${sData.extracted_content}`;
                }
            }
            if (!combinedContent.trim()) {
                throw new Error('No content available to generate summary');
            }
            // Estratégia Simplificada (Single vs Batch)
            // Se < 800k tokens, tenta single. Se maior, batch.
            const estimatedTokens = estimateTokens(combinedContent);
            const GEMINI_MODEL = 'gemini-2.5-flash';
            let parsed;
            if (estimatedTokens < 800000) {
                // Single Shot
                const prompt = `Você é um professor especialista em medicina. Crie um resumo estruturado e CONSOLIDADO do conteúdo abaixo.
CONTEÚDO:
${combinedContent}

INSTRUÇÕES CRÍTICAS:
1. **CONSOLIDE TÓPICOS DUPLICADOS**: Integre informações de várias fontes.
2. **PRESERVE DETALHES CLÍNICOS**: Dosagens, posologias, contraindicações, tabelas.
3. **ESTRUTURA**: <h2>, <h3>, <h4>, <ul>/<li>, <strong>.
4. **IDIOMA**: Português do Brasil.

JSON Output:
{
  "titulo": "Título descritivo",
  "conteudo_html": "HTML estruturado",
  "topicos": ["tópico 1", "tópico 2"]
}`;
                const result = await (0, gemini_1.callGeminiWithUsage)(prompt, GEMINI_MODEL, 60000, true);
                parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            }
            else {
                // Batch Strategy (Simplificada para o exemplo)
                // Em produção, implementar a lógica de split e merge completa
                throw new Error('Content too large for single pass. Batch implementation pending.');
            }
            if (!parsed.titulo || !parsed.conteudo_html) {
                throw new Error('Invalid response format from AI');
            }
            const summaryData = {
                project_id: project_id || sources[0].project_id,
                titulo: parsed.titulo,
                conteudo_html: parsed.conteudo_html,
                topicos: parsed.topicos || [],
                source_ids: sourceIds,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            };
            const docRef = await firestore_1.db.collection(firestore_1.COLLECTIONS.SUMMARIES).add((0, firestore_1.sanitizeData)(summaryData));
            const savedDoc = await docRef.get();
            res.status(200).json({ success: true, summary: Object.assign({ id: savedDoc.id }, savedDoc.data()) });
        }
        catch (error) {
            console.error('❌ Error generating summary:', error);
            res.status(400).json({ error: error.message || 'Failed to generate summary' });
        }
    });
};
exports.generateSummary = generateSummary;
//# sourceMappingURL=generateSummary.js.map