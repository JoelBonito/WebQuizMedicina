/**
 * File Extractors - Pista Expressa (Custo Zero)
 * Extrai texto de arquivos Office sem usar IA
 */

import * as mammoth from 'mammoth';
import { getTextExtractor } from 'office-text-extractor';
const pdf = require('pdf-parse');

/**
 * Extrai texto de arquivo DOCX usando mammoth
 * Custo: Zero (processamento local)
 */
export async function extractDocxContent(buffer: Buffer): Promise<string> {
    try {
        console.log('📄 [DOCX] Extraindo texto com mammoth...');
        const result = await mammoth.extractRawText({ buffer });

        if (result.messages && result.messages.length > 0) {
            console.warn('⚠️ [DOCX] Warnings:', result.messages);
        }

        const text = result.value.trim();
        console.log(`✅ [DOCX] Extraído ${text.length} caracteres`);

        return text;
    } catch (error: any) {
        console.error('❌ [DOCX] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do DOCX: ${error.message}`);
    }
}

/**
 * Extrai texto de arquivo PPTX usando office-text-extractor
 * Custo: Zero (processamento local)
 */
export async function extractPptxContent(buffer: Buffer): Promise<string> {
    try {
        console.log('📊 [PPTX] Extraindo texto com office-text-extractor...');

        const extractor = getTextExtractor();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });

        const cleanText = text.trim();
        console.log(`✅ [PPTX] Extraído ${cleanText.length} caracteres`);

        return cleanText;
    } catch (error: any) {
        console.error('❌ [PPTX] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PPTX: ${error.message}`);
    }
}

/**
 * Extrai texto de arquivo DOC (formato legado) usando office-text-extractor
 * Custo: Zero (processamento local)
 */
export async function extractDocContent(buffer: Buffer): Promise<string> {
    try {
        console.log('📄 [DOC] Extraindo texto com office-text-extractor...');

        const extractor = getTextExtractor();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });

        const cleanText = text.trim();
        console.log(`✅ [DOC] Extraído ${cleanText.length} caracteres`);

        return cleanText;
    } catch (error: any) {
        console.error('❌ [DOC] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do DOC: ${error.message}`);
    }
}

/**
 * Extrai texto de arquivo PPT (formato legado) usando office-text-extractor
 * Custo: Zero (processamento local)
 */
export async function extractPptContent(buffer: Buffer): Promise<string> {
    try {
        console.log('📊 [PPT] Extraindo texto com office-text-extractor...');

        const extractor = getTextExtractor();
        const text = await extractor.extractText({
            input: buffer,
            type: 'buffer'
        });

        const cleanText = text.trim();
        console.log(`✅ [PPT] Extraído ${cleanText.length} caracteres`);

        return cleanText;
    } catch (error: any) {
        console.error('❌ [PPT] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PPT: ${error.message}`);
    }
}

/**
 * Extrai texto de arquivo PDF usando pdf-parse
 * Custo: Zero (processamento local)
 */
export async function extractPdfContent(buffer: Buffer): Promise<string> {
    try {
        console.log('📑 [PDF] Extraindo texto com pdf-parse...');

        const data = await pdf(buffer);
        const text = data.text.trim();

        console.log(`✅ [PDF] Extraído ${text.length} caracteres`);
        return text;
    } catch (error: any) {
        console.error('❌ [PDF] Erro na extração:', error.message);
        throw new Error(`Falha ao extrair texto do PDF: ${error.message}`);
    }
}

/**
 * Router de extração baseado em MIME type e Extensão (Segurança)
 * Retorna null se o tipo não for suportado pela Pista Expressa
 */
export async function extractByMimeType(
    buffer: Buffer,
    mimeType: string,
    fileExtension?: string // Parâmetro opcional para mitigação
): Promise<string | null> {

    // Normalizar extensão se fornecida
    const ext = fileExtension?.toLowerCase().replace('.', '') || '';

    // PISTA EXPRESSA: Arquivos Office e PDF Texto (Custo Zero)

    // DOCX: MIME específico OR extensão + MIME genérico
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        (ext === 'docx' && mimeType.includes('wordprocessingml'))
    ) {
        return await extractDocxContent(buffer);
    }

    // DOC: MIME específico OR extensão 'doc'
    if (
        mimeType === 'application/msword' ||
        ext === 'doc'
    ) {
        return await extractDocContent(buffer);
    }

    // PPTX
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        (ext === 'pptx' && mimeType.includes('presentationml'))
    ) {
        return await extractPptxContent(buffer);
    }

    // PPT
    if (
        mimeType === 'application/vnd.ms-powerpoint' ||
        ext === 'ppt'
    ) {
        return await extractPptContent(buffer);
    }

    // PDF (Novo suporte backend)
    if (mimeType === 'application/pdf' || ext === 'pdf') {
        return await extractPdfContent(buffer);
    }

    console.log(`ℹ️ [Router] Type ${mimeType} / Ext ${ext} não suportado pela Pista Expressa`);
    return null;
}
