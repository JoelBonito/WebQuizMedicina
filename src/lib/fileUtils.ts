import { supabase } from './supabase';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Falha ao extrair texto do PDF');
  }
};

export const extractTextFromTextFile = async (file: File): Promise<string> => {
  try {
    return await file.text();
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
