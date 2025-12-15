import { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { CONTENT_REFRESH_EVENT } from '../lib/events';

export interface Flashcard {
  id: string;
  project_id: string;
  source_id: string | null;
  session_id: string | null;
  frente: string;
  verso: string;
  topico: string | null;
  dificuldade: string;
  content_type?: 'standard' | 'recovery';
  created_at: any;
}

export const useFlashcards = (projectId: string | null) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchFlashcards = useCallback(async () => {
    if (!projectId) {
      setFlashcards([]);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'flashcards'),
        where('project_id', '==', projectId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
      setFlashcards(data);
    } catch (err) {
      console.error('Error fetching flashcards:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const q = query(
      collection(db, 'flashcards'),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
      setFlashcards(data);
    });

    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    const handleRefresh = () => {
      console.log('[Events] Flashcards refresh triggered by local event');
      fetchFlashcards();
    };

    window.addEventListener(CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [fetchFlashcards]);

  const generateFlashcards = async (sourceIds?: string | string[], count: number = 20, difficulty?: 'fácil' | 'médio' | 'difícil') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      const source_ids = Array.isArray(sourceIds) ? sourceIds : (sourceIds ? [sourceIds] : undefined);

      // Timeout de 5 minutos para evitar erros de cold start
      const generateFlashcardsFn = httpsCallable(functions, 'generate_flashcards', { timeout: 300000 });
      const result = await generateFlashcardsFn({
        project_id: projectId,
        source_ids,
        dificuldade: difficulty,
        qtd_flashcards: count,
        language: profile?.response_language || 'pt'
      });

      return result.data;
    } catch (err: any) {
      console.error('Error generating flashcards:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const generateRecoveryFlashcards = async (difficulties?: any[], count: number = 10) => {
    if (!projectId) throw new Error('Project required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      // Timeout de 5 minutos para evitar erros de cold start
      const generateRecoveryFlashcardsFn = httpsCallable(functions, 'generate_recovery_flashcards', { timeout: 300000 });
      const result = await generateRecoveryFlashcardsFn({
        project_id: projectId,
        difficulties,
        count,
        language: profile?.response_language || 'pt'
      });

      return result.data;
    } catch (err: any) {
      console.error('Error generating recovery flashcards:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  return {
    flashcards,
    loading,
    generating,
    generateFlashcards,
    generateRecoveryFlashcards,
    refetch: fetchFlashcards,
  };
};
