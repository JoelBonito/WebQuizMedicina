import { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './useAuth';

export interface MindMap {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content_mermaid?: string;
  content_markdown?: string;
  source_ids: string[] | null;
  tipo: 'standard' | 'recovery';
  created_at: any;
}

export const useMindMaps = (projectId: string | null) => {
  const { user } = useAuth();
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchMindMaps = useCallback(async () => {
    if (!projectId) {
      setMindMaps([]);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'mindmaps'),
        where('project_id', '==', projectId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MindMap));
      setMindMaps(data);
    } catch (err) {
      console.error('Error fetching mind maps:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const q = query(
      collection(db, 'mindmaps'),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MindMap));
      setMindMaps(data);
    });

    return () => unsubscribe();
  }, [projectId]);

  const generateMindMap = async (sourceIds?: string | string[], tipo: 'standard' | 'recovery' = 'standard') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      const requestBody: any = { tipo };

      if (sourceIds) {
        if (Array.isArray(sourceIds) && sourceIds.length > 0) {
          requestBody.source_ids = sourceIds;
        } else if (typeof sourceIds === 'string') {
          requestBody.source_ids = [sourceIds];
        }
      }

      if (!requestBody.source_ids || requestBody.source_ids.length === 0) {
        requestBody.project_id = projectId;
      }

      const generateMindMapFn = httpsCallable(functions, 'generate_mindmap');
      const result = await generateMindMapFn(requestBody);

      return result.data;
    } catch (err: any) {
      console.error('Error generating mind map:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const deleteMindMap = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'mindmaps', id));
      setMindMaps(mindMaps.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Error deleting mind map:', err);
      throw err;
    }
  };

  return {
    mindMaps,
    loading,
    generating,
    generateMindMap,
    deleteMindMap,
    refetch: fetchMindMaps,
  };
};
