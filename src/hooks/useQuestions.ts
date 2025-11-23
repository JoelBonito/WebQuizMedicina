import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

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
  created_at: string;
}

export const useQuestions = (projectId: string | null) => {
  const { session } = useAuth();
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
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err) {
      console.error('Error fetching questions:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const generateQuiz = async (sourceIds?: string | string[], count: number = 15, difficulty?: 'fácil' | 'médio' | 'difícil') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);

      if (!session) throw new Error('Not authenticated');

      // Support both single sourceId (string) and multiple sourceIds (array)
      const source_ids = Array.isArray(sourceIds) ? sourceIds : (sourceIds ? [sourceIds] : undefined);

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-quiz`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            source_ids,
            project_id: projectId,
            count,
            ...(difficulty && { difficulty }),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        // Check for quota/rate limit errors
        const errorMessage = result.error || '';
        if (
          response.status === 429 ||
          errorMessage.includes('quota') ||
          errorMessage.includes('RESOURCE_EXHAUSTED') ||
          errorMessage.includes('rate limit')
        ) {
          throw new Error('Limite de uso da API atingido. Por favor, tente novamente mais tarde (aproximadamente em 1 minuto).');
        }
        throw new Error(result.error || 'Failed to generate quiz');
      }

      // Refresh questions
      await fetchQuestions();
      return result;
    } catch (err) {
      console.error('Error generating quiz:', err);
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
    refetch: fetchQuestions,
  };
};
