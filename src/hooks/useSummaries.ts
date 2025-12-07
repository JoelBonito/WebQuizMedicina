import { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { CONTENT_REFRESH_EVENT } from '../lib/events';

export interface Summary {
  id: string;
  project_id: string;
  titulo: string;
  conteudo_html: string;
  topicos: string[] | null;
  source_ids: string[] | null;
  tipo?: string;
  created_at: any;
}

export const useSummaries = (projectId: string | null) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchSummaries = useCallback(async () => {
    if (!projectId) {
      setSummaries([]);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'summaries'),
        where('project_id', '==', projectId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Summary));
      setSummaries(data);
    } catch (err) {
      console.error('Error fetching summaries:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const q = query(
      collection(db, 'summaries'),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Summary));
      setSummaries(data);
    });

    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    const handleRefresh = () => {
      console.log('[Events] Summaries refresh triggered by local event');
      fetchSummaries();
    };

    window.addEventListener(CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [fetchSummaries]);

  const generateSummary = async (sourceIds?: string | string[]) => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      const requestBody: any = {};

      if (sourceIds) {
        if (Array.isArray(sourceIds)) {
          requestBody.source_ids = sourceIds;
        } else if (typeof sourceIds === 'string') {
          requestBody.source_ids = [sourceIds];
        }
      }

      requestBody.project_id = projectId;
      requestBody.language = profile?.response_language || 'pt';

      // Debug log
      console.log('[useSummaries] Generating summary with language:', profile?.response_language);

      const generateSummaryFn = httpsCallable(functions, 'generate_summary', { timeout: 540000 });
      const result = await generateSummaryFn(requestBody);

      return result.data;
    } catch (err: any) {
      console.error('Error generating summary:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const generateFocusedSummary = async () => {
    if (!projectId) throw new Error('Project required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      const generateFocusedSummaryFn = httpsCallable(functions, 'generate_focused_summary');
      const result = await generateFocusedSummaryFn({
        project_id: projectId,
        language: profile?.response_language || 'pt'
      });

      return result.data;
    } catch (err: any) {
      console.error('Error generating focused summary:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const deleteSummary = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'summaries', id));
      setSummaries(summaries.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Error deleting summary:', err);
      throw err;
    }
  };

  return {
    summaries,
    loading,
    generating,
    generateSummary,
    generateFocusedSummary,
    deleteSummary,
    refetch: fetchSummaries,
  };
};
