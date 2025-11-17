import { supabase } from './supabase';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
// In production: use local worker file (copied by vite-plugin-static-copy)
// In development: use CDN fallback
const PDFJS_VERSION = pdfjsLib.version;

if (import.meta.env.PROD) {
  // Production: use local worker (relative to the build output)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
} else {
  // Development: use CDN
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
}

if (import.meta.env.DEV) {
  console.log('PDF.js version:', PDFJS_VERSION);
  console.log('PDF.js worker URL:', pdfjsLib.GlobalWorkerOptions.workerSrc);
}

export type FileType = 'pdf' | 'txt' | 'md' | 'mp3' | 'wav' | 'm4a' | 'jpg' | 'png' | 'jpeg';

export interface FileMetadata {
  duration?: number;
  pages?: number;
  size: number;
  mimeType: string;
}

export const getFileType = (file: File): FileType => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return (extension as FileType) || 'txt';
};

export const isAudioFile = (type: FileType): boolean => {
  return ['mp3', 'wav', 'm4a'].includes(type);
};

export const isImageFile = (type: FileType): boolean => {
  return ['jpg', 'jpeg', 'png'].includes(type);
};

export const isTextFile = (type: FileType): boolean => {
  return ['txt', 'md'].includes(type);
};

export const isPDFFile = (type: FileType): boolean => {
  return type === 'pdf';
};

/**
 * Sanitizes text by removing null bytes and other problematic Unicode characters
 * that PostgreSQL TEXT columns cannot handle
 */
const sanitizeText = (text: string): string => {
  if (!text) return '';

  // Count null bytes BEFORE sanitization
  const initialNullBytes = (text.match(/\u0000/g) || []).length;
  if (initialNullBytes > 0 && import.meta.env.DEV) {
    console.warn(`⚠️ Found ${initialNullBytes} null bytes in original text`);
  }

  let sanitized = text
    // Remove null bytes (U+0000) - PostgreSQL can't handle these - EXPLICIT REMOVAL
    .replace(/\u0000/g, '')
    .replace(/\x00/g, '') // Try hex notation too
    // Remove all control characters (U+0000 to U+001F) except newline (U+000A) and tab (U+0009)
    .replace(/[\u0001-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/[\x01-\x08\x0B-\x1F\x7F]/g, '') // Also hex notation
    // Remove invalid UTF-8 sequences (replacement character)
    .replace(/\uFFFD/g, '')
    // Remove zero-width characters that might cause issues
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize line endings to \n
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize multiple spaces to single space
    .replace(/ {2,}/g, ' ')
    // Normalize multiple newlines to double newline (paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    // Trim leading and trailing whitespace
    .trim();

  // AGGRESSIVE final pass - remove ANYTHING that's not safe
  // Only allow: printable ASCII (32-126), newline (10), tab (9), and common Unicode (160-65535)
  sanitized = sanitized.replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, '');

  // Final verification - check for null bytes
  const finalNullBytes = (sanitized.match(/\u0000/g) || []).length;
  if (finalNullBytes > 0) {
    console.error(`❌ CRITICAL: ${finalNullBytes} null bytes STILL PRESENT after sanitization!`);
    // Last resort - split, filter, join
    sanitized = sanitized.split('').filter(char => char.charCodeAt(0) !== 0).join('');
  }

  return sanitized;
};

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }

    // Sanitize the extracted text to remove problematic characters
    return sanitizeText(fullText);
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Falha ao extrair texto do PDF');
  }
};

export const extractTextFromTextFile = async (file: File): Promise<string> => {
  try {
    const text = await file.text();
    // Also sanitize text files to ensure consistency
    return sanitizeText(text);
  } catch (error) {
    console.error('Error reading text file:', error);
    throw new Error('Falha ao ler arquivo de texto');
  }
};

export const uploadFileToStorage = async (
  file: File,
  userId: string,
  projectId: string
): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${userId}/${projectId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('project-sources')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    throw new Error('Falha no upload do arquivo');
  }

  return data.path;
};

export const getFileMetadata = async (file: File): Promise<FileMetadata> => {
  const metadata: FileMetadata = {
    size: file.size,
    mimeType: file.type,
  };

  const fileType = getFileType(file);

  if (isPDFFile(fileType)) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      metadata.pages = pdf.numPages;
    } catch (error) {
      console.error('Error getting PDF metadata:', error);
    }
  }

  if (isAudioFile(fileType)) {
    try {
      const audio = new Audio(URL.createObjectURL(file));
      await new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          metadata.duration = Math.round(audio.duration);
          resolve(true);
        });
      });
    } catch (error) {
      console.error('Error getting audio metadata:', error);
    }
  }

  return metadata;
};

export const processFile = async (file: File): Promise<string | null> => {
  const fileType = getFileType(file);

  try {
    if (isPDFFile(fileType)) {
      return await extractTextFromPDF(file);
    }

    if (isTextFile(fileType)) {
      return await extractTextFromTextFile(file);
    }

    // Para áudio e imagem, não processamos agora (processamento sob demanda)
    return null;
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
};
