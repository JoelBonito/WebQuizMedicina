import { useState, useEffect } from 'react';
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
  created_at: string;
}

export const useQuestions = (projectId: string | null) => {
  const { session } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchQuestions = async () => {
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
  };

  useEffect(() => {
    fetchQuestions();
  }, [projectId]);

  const generateQuiz = async (sourceIds?: string | string[], count: number = 15, difficulty?: 'fácil' | 'médio' | 'difícil') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);

      if (!session) throw new Error('Not authenticated');

      // Build request body with priority logic
      const requestBody: any = { count };

      if (difficulty) {
        requestBody.difficulty = difficulty;
      }

      // Priority logic (same as backend):
      // 1. source_ids (user explicitly selected multiple sources)
      // 2. source_id (single source)
      // 3. project_id (all project sources)
      if (Array.isArray(sourceIds) && sourceIds.length > 0) {
        requestBody.source_ids = sourceIds;
      } else if (typeof sourceIds === 'string') {
        requestBody.source_id = sourceIds;
      } else if (projectId) {
        requestBody.project_id = projectId;
      }

      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

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
