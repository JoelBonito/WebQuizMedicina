/**
 * Gemini File Manager - Para arquivos grandes (áudio/vídeo)
 * Usa a Gemini File API para upload temporário de arquivos > 10MB
 */

import { GoogleAIFileManager } from '@google/generative-ai/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getModelSelector } from './modelSelector';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Lazy initialization para evitar cold start
let fileManager: GoogleAIFileManager | null = null;
let genAI: GoogleGenerativeAI | null = null;

function getFileManager(): GoogleAIFileManager {
    if (!fileManager) {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY não configurada');
        }
        fileManager = new GoogleAIFileManager(apiKey);
    }
    return fileManager;
}

function getGenAI(): GoogleGenerativeAI {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY não configurada');
        }
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

/**
 * Upload de arquivo para ambiente temporário do Gemini
 * Use para arquivos > 10MB que não cabem em base64 inline
 */
export async function uploadToGeminiFiles(
    buffer: Buffer,
    mimeType: string,
    displayName: string
): Promise<{ fileUri: string; fileName: string }> {

    console.log(`📤 [Gemini Files] Uploading ${displayName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`);

    // Salvar buffer em arquivo temporário (File API requer path)
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `gemini_upload_${Date.now()}`);

    try {
        fs.writeFileSync(tempPath, buffer);

        const fm = getFileManager();
        const uploadResult = await fm.uploadFile(tempPath, {
            mimeType: mimeType,
            displayName: displayName
        });

        console.log(`✅ [Gemini Files] Upload completo: ${uploadResult.file.uri}`);

        return {
            fileUri: uploadResult.file.uri,
            fileName: uploadResult.file.name
        };
    } finally {
        // Sempre limpar arquivo temporário local
        try {
            fs.unlinkSync(tempPath);
        } catch (e) {
            // Ignorar erro de cleanup
        }
    }
}

/**
 * Deletar arquivo do ambiente temporário do Gemini
 * SEMPRE chamar após processar o arquivo para evitar custos
 */
export async function deleteGeminiFile(fileName: string): Promise<void> {
    try {
        const fm = getFileManager();
        await fm.deleteFile(fileName);
        console.log(`🗑️ [Gemini Files] Arquivo ${fileName} deletado`);
    } catch (error: any) {
        console.warn(`⚠️ [Gemini Files] Erro ao deletar arquivo: ${error.message}`);
        // Não lançar erro - arquivo será auto-deletado pelo Gemini após TTL
    }
}

/**
 * Transcrever áudio usando Gemini File API
 * Ideal para arquivos > 10MB (aulas, palestras, podcasts)
 */
export async function transcribeAudioWithGemini(
    buffer: Buffer,
    mimeType: string,
    displayName: string = 'audio_upload'
): Promise<string> {

    let uploadedFile: { fileUri: string; fileName: string } | null = null;

    try {
        // 1. Upload para ambiente temporário
        uploadedFile = await uploadToGeminiFiles(buffer, mimeType, displayName);

        // 2. Selecionar melhor modelo Flash disponível
        const selector = getModelSelector();
        const modelName = await selector.selectBestModel('general');

        console.log(`🎤 [Audio] Transcrevendo com ${modelName}...`);

        // 3. Chamar modelo com fileUri
        const ai = getGenAI();
        const model = ai.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: mimeType,
                    fileUri: uploadedFile.fileUri
                }
            },
            {
                text: `Você é um especialista em transcrição médica. Transcreva este áudio com alta precisão técnica.

INSTRUÇÕES:
1. Transcreva TODO o conteúdo falado, incluindo termos médicos técnicos
2. Preserve a estrutura do discurso (tópicos, listas, etc.)
3. Ignore silêncios longos e ruídos de fundo
4. Se houver múltiplos falantes, indique com [Palestrante 1], [Palestrante 2], etc.
5. Preserve nomes de medicamentos, procedimentos e condições médicas
6. Use formatação Markdown quando apropriado (listas, títulos)

Forneça APENAS a transcrição, sem comentários adicionais.`
            }
        ]);

        const text = result.response.text();
        console.log(`✅ [Audio] Transcrição completa: ${text.length} caracteres`);

        return text;

    } finally {
        // 4. SEMPRE cleanup - mesmo em caso de erro
        if (uploadedFile) {
            await deleteGeminiFile(uploadedFile.fileName);
        }
    }
}

/**
 * OCR avançado para imagens/scans usando Gemini Vision
 * Suporta manuscritos e anotações médicas
 */
export async function extractTextFromImageWithGemini(
    buffer: Buffer,
    mimeType: string
): Promise<string> {

    // Para imagens < 20MB, usar base64 inline (mais rápido)
    const base64Data = buffer.toString('base64');

    const selector = getModelSelector();
    const modelName = await selector.selectBestModel('general');

    console.log(`🔍 [OCR] Extraindo texto com ${modelName}...`);

    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: modelName });

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: mimeType,
                data: base64Data
            }
        },
        {
            text: `Você é um especialista em transcrição médica e OCR.

INSTRUÇÕES:
1. Transcreva TODO o texto visível na imagem com alta fidelidade
2. INCLUA anotações manuscritas (letra de mão) - são importantes
3. Preserve a estrutura original (tabelas, listas, hierarquia)
4. Se houver diagramas médicos, descreva-os brevemente
5. Ignore rabiscos sem significado semântico
6. Preserve terminologia médica técnica
7. Use formatação Markdown para tabelas e listas

Forneça APENAS o texto extraído, sem comentários adicionais.`
        }
    ]);

    const text = result.response.text();
    console.log(`✅ [OCR] Extração completa: ${text.length} caracteres`);

    return text;
}
