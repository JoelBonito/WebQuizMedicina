import { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { CONTENT_REFRESH_EVENT } from '../lib/events';

export interface Question {
  id: string;
  project_id: string;
  source_id: string | null;
  session_id: string | null;
  tipo: 'multipla_escolha' | 'verdadeiro_falso' | 'citar' | 'completar' | 'caso_clinico';
  pergunta: string;
  opcoes: string[];
  resposta_correta: string;
  justificativa: string | null;
  dica: string | null;
  topico: string | null;
  dificuldade: string;
  content_type?: 'standard' | 'recovery';
  created_at: any; // Firestore Timestamp or Date
}

export const useQuestions = (projectId: string | null) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchQuestions = useCallback(async () => {
    if (!projectId) {
      setQuestions([]);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'questions'),
        where('project_id', '==', projectId),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(data);
    } catch (err) {
      console.error('Error fetching questions:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Realtime subscription
  useEffect(() => {
    if (!projectId) return;

    const q = query(
      collection(db, 'questions'),
      where('project_id', '==', projectId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(data);
    });

    return () => unsubscribe();
  }, [projectId]);

  // Local event listener
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[Events] Questions refresh triggered by local event');
      fetchQuestions();
    };

    window.addEventListener(CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [fetchQuestions]);

  const generateQuiz = async (sourceIds?: string | string[], count: number = 15, difficulty?: 'fácil' | 'médio' | 'difícil') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);

      if (!user) throw new Error('Not authenticated');

      const source_ids = Array.isArray(sourceIds) ? sourceIds : (sourceIds ? [sourceIds] : undefined);

      const payload = {
        source_ids,
        project_id: projectId,
        count,
        difficulty: difficulty || 'misto',
        language: profile?.response_language || 'pt'
      };
      console.log('📤 [useQuestions] Dados enviados para generate_quiz:', payload);

      const generateQuizFn = httpsCallable(functions, 'generate_quiz');
      const result = await generateQuizFn(payload);

      // No need to manually fetch if realtime listener is active, but keeping for consistency
      // await fetchQuestions(); 
      return result.data;
    } catch (err: any) {
      console.error('Error generating quiz:', err);
      // Map common errors if needed
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const generateRecoveryQuiz = async (difficulties?: any[], count: number = 10, difficulty?: 'fácil' | 'médio' | 'difícil') => {
    if (!projectId) throw new Error('Project required');

    try {
      setGenerating(true);
      if (!user) throw new Error('Not authenticated');

      const generateRecoveryQuizFn = httpsCallable(functions, 'generate_recovery_quiz');
      const result = await generateRecoveryQuizFn({
        project_id: projectId,
        difficulties,
        count,
        difficulty,
        language: profile?.response_language || 'pt'
      });

      return result.data;
    } catch (err: any) {
      console.error('Error generating recovery quiz:', err);
      if (err.message && (err.message.includes('quota') || err.message.includes('resource-exhausted'))) {
        throw new Error('Limite de uso da API atingido. Tente novamente em breve.');
      }
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  return {
    questions,
    loading,
    generating,
    generateQuiz,
    generateRecoveryQuiz,
    refetch: fetchQuestions,
  };
};
