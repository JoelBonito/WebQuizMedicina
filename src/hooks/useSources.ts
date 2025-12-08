import { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getCountFromServer
} from 'firebase/firestore';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { useAuth } from './useAuth';
import {
  getFileType,
  processFile,
  getFileMetadata,
  FileMetadata,
} from '../lib/fileUtils';

export interface Source {
  id: string;
  project_id: string;
  name: string;
  type: string;
  storage_path: string | null;
  extracted_content: string | null;
  metadata: FileMetadata | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  embeddings_status?: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: any;
}

export const useSources = (projectId: string | null) => {
  const { user } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    if (!projectId) {
      setSources([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'sources'),
        where('project_id', '==', projectId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Source));
      setSources(data);
    } catch (err: any) {
      console.error('Error fetching sources:', err);
      setError(err.message || 'Erro ao buscar fontes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) {
      setSources([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, 'sources'),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Source));
        setSources(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error in sources snapshot:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId]);

  const uploadSource = async (file: File) => {
    if (!user || !projectId) throw new Error('User or project not found');

    // 200MB para suportar áudios longos e materiais médicos de alta resolução
    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      throw new Error(`Arquivo muito grande (${fileSizeMB} MB). O tamanho máximo permitido é ${maxSizeMB} MB.`);
    }

    try {
      setUploading(true);
      const fileType = getFileType(file);
      let storagePath: string | null = null;
      let extractedContent: string | null = null;

      // OPTIMIZATION: Extract text in browser and skip storage for PDF/Text
      if (['pdf', 'txt', 'md'].includes(fileType)) {
        try {
          console.log(`📄 Extracting text from ${file.name} in browser...`);
          extractedContent = await processFile(file);

          if (extractedContent) {
            // Sanitize content
            extractedContent = extractedContent.replace(/\u0000/g, '');
            console.log(`✅ Text extracted successfully (${extractedContent.length} chars). Skipping storage upload.`);
          }
        } catch (extractError) {
          console.error('❌ Text extraction failed:', extractError);
          // NÃO fazer upload para storage - isso desperdiçaria espaço
          // Em vez disso, vamos lançar o erro para o usuário tentar novamente
          throw new Error(`Falha ao extrair texto: ${(extractError as Error).message}. Tente novamente ou use um arquivo menor.`);
        }
      }

      // Only upload to storage if we didn't extract content (e.g. images/audio)
      // OR if we want to keep the original file for some reason (not in this optimization plan)
      if (!extractedContent) {
        storagePath = `projects/${projectId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
      }

      // 2. Get file metadata
      const metadata = await getFileMetadata(file);

      // 3. Create source record
      const sourceData = {
        project_id: projectId,
        user_id: user.uid,
        name: file.name,
        type: fileType,
        storage_path: storagePath, // Will be null for optimized files
        metadata,
        status: extractedContent ? 'ready' : 'processing', // Ready if we have content
        embeddings_status: 'pending' as const,
        extracted_content: extractedContent,
        created_at: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'sources'), sourceData);

      // Optimistic update
      const newSource: Source = {
        id: docRef.id,
        ...sourceData,
        created_at: new Date(),
        status: sourceData.status as any
      };
      setSources(prev => {
        if (prev.some(s => s.id === newSource.id)) {
          return prev;
        }
        return [newSource, ...prev];
      });

      // If we uploaded to storage (no extracted content), we might need server-side processing
      // But for now, our server functions expect 'extracted_content' or process it via other means.
      // If it's audio/image, it stays 'processing' until we implement that pipeline.

      return { id: docRef.id, ...sourceData, status: sourceData.status as any };

    } catch (err) {
      console.error('Error uploading source:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const deleteSource = async (id: string) => {
    try {
      const source = sources.find((s) => s.id === id);
      if (!source) throw new Error('Source not found');

      // Delete from Firestore
      await deleteDoc(doc(db, 'sources', id));

      // Delete from Storage
      if (source.storage_path) {
        const storageRef = ref(storage, source.storage_path);
        deleteObject(storageRef).catch(err => console.error('Storage delete error (ignored):', err));
      }

      setSources(prev => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Error deleting source:', err);
      throw err;
    }
  };

  const getGeneratedCounts = async (sourceId: string) => {
    try {
      const questionsQuery = query(collection(db, 'questions'), where('source_id', '==', sourceId));
      const flashcardsQuery = query(collection(db, 'flashcards'), where('source_id', '==', sourceId));
      const summariesQuery = query(collection(db, 'summaries'), where('source_ids', 'array-contains', sourceId));

      const [questionsSnap, flashcardsSnap, summariesSnap] = await Promise.all([
        getCountFromServer(questionsQuery),
        getCountFromServer(flashcardsQuery),
        getCountFromServer(summariesQuery)
      ]);

      return {
        quiz: questionsSnap.data().count,
        flashcards: flashcardsSnap.data().count,
        summaries: summariesSnap.data().count,
      };
    } catch (err) {
      console.error('Error getting generated counts:', err);
      return { quiz: 0, flashcards: 0, summaries: 0 };
    }
  };

  return {
    sources,
    loading,
    uploading,
    error,
    uploadSource,
    deleteSource,
    getGeneratedCounts,
    refetch: fetchSources,
  };
};
