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
exports.generateMindmap = void 0;
const cors = __importStar(require("cors"));
const firestore_1 = require("../utils/firestore");
const gemini_1 = require("../lib/gemini");
const params_1 = require("firebase-functions/params");
const corsHandler = cors({ origin: true });
const geminiApiKeyParam = (0, params_1.defineString)('GEMINI_API_KEY');
const generateMindmap = async (req, res) => {
    return corsHandler(req, res, async () => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        try {
            // Autenticação (Verifica se o usuário está logado via Firebase Auth)
            // Nota: Para chamadas HTTPS diretas, o token deve ser verificado manualmente ou usar onCall
            // Aqui vamos assumir que o frontend envia o token no header Authorization
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
            const { source_ids, project_id, tipo = 'standard' } = req.body;
            if (!source_ids && !project_id) {
                res.status(400).json({ error: 'source_ids or project_id required' });
                return;
            }
            // 1. Buscar Fontes no Firestore
            let sources = [];
            if (source_ids && Array.isArray(source_ids) && source_ids.length > 0) {
                console.log(`🗺️ [MindMap] Fetching ${source_ids.length} user-selected sources`);
                // Firestore 'in' query limita a 10, se for mais precisa fazer em batches ou lógica diferente
                // Assumindo < 10 por enquanto ou iterando
                const sourcesRef = firestore_1.db.collection(firestore_1.COLLECTIONS.SOURCES);
                // Simplificação: buscando um por um se forem poucos, ou usando 'in'
                const snapshot = await sourcesRef.where(admin.firestore.FieldPath.documentId(), 'in', source_ids).get();
                sources = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            }
            else if (project_id) {
                console.log(`🗺️ [MindMap] Fetching ALL sources from project: ${project_id}`);
                const sourcesRef = firestore_1.db.collection(firestore_1.COLLECTIONS.SOURCES);
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
                throw new Error('No content available to generate mind map');
            }
            // 2. Preparar Prompt (Mesma lógica do original)
            const prompt = `Você é um especialista em didática médica. Crie um MAPA MENTAL completo e detalhado com base no conteúdo fornecido.
CONTEÚDO:
${combinedContent}

INSTRUÇÕES TÉCNICAS (CRÍTICO - SIGA EXATAMENTE):
1. **FORMATO JSON OBRIGATÓRIO**: 
   - Sua resposta DEVE ser APENAS um objeto JSON válido
   - Campos obrigatórios: "titulo" (string) e "mermaid" (string)

2. **INDENTAÇÃO - REGRA MAIS IMPORTANTE**:
   - Linha 1: mindmap
   - Linha 2: 2 espaços + "Texto"
   - Linha 3: 4 espaços + "Texto"
   - SEMPRE incremente EXATAMENTE 2 espaços por nível
   
3. **ASPAS DUPLAS**:
   - TODO texto deve estar entre aspas duplas

4. **ESTRUTURA HIERÁRQUICA**:
   - Filhos devem ter EXATAMENTE 2 espaços a mais que o pai

Gere o JSON agora:`;
            // 3. Chamar Gemini
            const result = await (0, gemini_1.callGeminiWithUsage)(prompt, 'gemini-2.5-flash', 60000, true);
            // 4. Parse e Salvar
            const parsed = (0, gemini_1.parseJsonFromResponse)(result.text);
            if (!parsed.titulo || !parsed.mermaid) {
                throw new Error('Invalid response format from AI');
            }
            let mermaidCode = parsed.mermaid;
            if (mermaidCode.startsWith('```mermaid')) {
                mermaidCode = mermaidCode.replace(/^```mermaid\s*/i, '').replace(/```$/, '').trim();
            }
            const titlePrefix = tipo === 'recovery' ? 'Recovery: ' : '';
            const finalTitle = titlePrefix + parsed.titulo;
            const mindmapData = {
                project_id: project_id || sources[0].project_id,
                user_id: userId,
                title: finalTitle,
                content_mermaid: mermaidCode,
                source_ids: sourceIds,
                tipo: tipo,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            };
            const docRef = await firestore_1.db.collection(firestore_1.COLLECTIONS.MINDMAPS).add((0, firestore_1.sanitizeData)(mindmapData));
            const savedDoc = await docRef.get();
            res.status(200).json({ success: true, mindmap: Object.assign({ id: savedDoc.id }, savedDoc.data()) });
        }
        catch (error) {
            console.error('❌ Error generating mind map:', error);
            res.status(400).json({ error: error.message || 'Failed to generate mind map' });
        }
    });
};
exports.generateMindmap = generateMindmap;
const admin = __importStar(require("firebase-admin"));
//# sourceMappingURL=generateMindmap.js.map