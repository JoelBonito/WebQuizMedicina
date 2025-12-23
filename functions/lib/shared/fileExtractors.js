"use strict";
/**
 * File Extractors - Pista Expressa (Custo Zero)
 * Extrai texto de arquivos Office sem usar IA
 */
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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDocxContent = extractDocxContent;
exports.extractPptxContent = extractPptxContent;
exports.extractDocContent = extractDocContent;
exports.extractPptContent = extractPptContent;
exports.extractPdfContent = extractPdfContent;
exports.extractByMimeType = extractByMimeType;
const mammoth = __importStar(require("mammoth"));
const office_text_extractor_1 = require("office-text-extractor");
const pdf = require('pdf-parse');
/**
 * Extrai texto de arquivo DOCX usando mammoth
 * Custo: Zero (processamento local)
 */
async function extractDocxContent(buffer) {
    try {
        console.log('📄 [DOCX] Extraindo texto com mammoth...');
        const result = await mammoth.extractRawText({ buffer });
        if (result.messages && result.messages.length > 0) {
            console.warn('⚠️ [DOCX] Warnings:', result.messages);
        }
        const text = result.value.trim();
        console.log(`✅ [DOCX] Extraído ${text.length} caracteres`);
        return text;
    }
    catch (error) {
        console.error('❌ [DOCX] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do DOCX: ${error.message}`);
    }
}
/**
 * Extrai texto de arquivo PPTX usando office-text-extractor
 * Custo: Zero (processamento local)
 */
async function extractPptxContent(buffer) {
    try {
        console.log('📊 [PPTX] Extraindo texto com office-text-extractor...');
        const extractor = (0, office_text_extractor_1.getTextExtractor)();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });
        const cleanText = text.trim();
        console.log(`✅ [PPTX] Extraído ${cleanText.length} caracteres`);
        return cleanText;
    }
    catch (error) {
        console.error('❌ [PPTX] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PPTX: ${error.message}`);
    }
}
/**
 * Extrai texto de arquivo DOC (formato legado) usando office-text-extractor
 * Custo: Zero (processamento local)
 */
async function extractDocContent(buffer) {
    try {
        console.log('📄 [DOC] Extraindo texto com office-text-extractor...');
        const extractor = (0, office_text_extractor_1.getTextExtractor)();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });
        const cleanText = text.trim();
        console.log(`✅ [DOC] Extraído ${cleanText.length} caracteres`);
        return cleanText;
    }
    catch (error) {
        console.error('❌ [DOC] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do DOC: ${error.message}`);
    }
}
/**
 * Extrai texto de arquivo PPT (formato legado) usando office-text-extractor
 * Custo: Zero (processamento local)
 */
async function extractPptContent(buffer) {
    try {
        console.log('📊 [PPT] Extraindo texto com office-text-extractor...');
        const extractor = (0, office_text_extractor_1.getTextExtractor)();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });
        const cleanText = text.trim();
        console.log(`✅ [PPT] Extraído ${cleanText.length} caracteres`);
        return cleanText;
    }
    catch (error) {
        console.error('❌ [PPT] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PPT: ${error.message}`);
    }
}
/**
 * Extrai texto de arquivo PDF usando pdf-parse
 * Custo: Zero (processamento local)
 */
async function extractPdfContent(buffer) {
    try {
        console.log('📑 [PDF] Extraindo texto com pdf-parse...');
        const data = await pdf(buffer);
        const text = data.text.trim();
        console.log(`✅ [PDF] Extraído ${text.length} caracteres`);
        return text;
    }
    catch (error) {
        console.error('❌ [PDF] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PDF: ${error.message}`);
    }
}
/**
 * Router de extração baseado em MIME type e Extensão (Segurança)
 * Retorna null se o tipo não for suportado pela Pista Expressa
 */
async function extractByMimeType(buffer, mimeType, fileExtension // Parâmetro opcional para mitigação
) {
    // Normalizar extensão se fornecida
    const ext = (fileExtension === null || fileExtension === void 0 ? void 0 : fileExtension.toLowerCase().replace('.', '')) || '';
    // PISTA EXPRESSA: Arquivos Office e PDF Texto (Custo Zero)
    // DOCX: MIME específico OR extensão + MIME genérico
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        (ext === 'docx' && mimeType.includes('wordprocessingml'))) {
        return await extractDocxContent(buffer);
    }
    // DOC: MIME específico OR extensão 'doc'
    if (mimeType === 'application/msword' ||
        ext === 'doc') {
        return await extractDocContent(buffer);
    }
    // PPTX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        (ext === 'pptx' && mimeType.includes('presentationml'))) {
        return await extractPptxContent(buffer);
    }
    // PPT
    if (mimeType === 'application/vnd.ms-powerpoint' ||
        ext === 'ppt') {
        return await extractPptContent(buffer);
    }
    // PDF (Novo suporte backend)
    if (mimeType === 'application/pdf' || ext === 'pdf') {
        return await extractPdfContent(buffer);
    }
    console.log(`ℹ️ [Router] Type ${mimeType} / Ext ${ext} não suportado pela Pista Expressa`);
    return null;
}
//# sourceMappingURL=fileExtractors.js.map