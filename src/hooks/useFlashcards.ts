import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Flashcard {
  id: string;
  project_id: string;
  source_id: string | null;
  session_id: string | null;
  frente: string;
  verso: string;
  topico: string | null;
  dificuldade: string;
  created_at: string;
}

export const useFlashcards = (projectId: string | null) => {
  const { session } = useAuth();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchFlashcards = async () => {
    if (!projectId) {
      setFlashcards([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFlashcards(data || []);
    } catch (err) {
      console.error('Error fetching flashcards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlashcards();
  }, [projectId]);

  const generateFlashcards = async (sourceIds?: string | string[], count: number = 20, difficulty?: 'fácil' | 'médio' | 'difícil') => {
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

      const response = await fetch('/api/generate-flashcards', {
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
        throw new Error(result.error || 'Failed to generate flashcards');
      }

      // Refresh flashcards
      await fetchFlashcards();
      return result;
    } catch (err) {
      console.error('Error generating flashcards:', err);
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
    refetch: fetchFlashcards,
  };
};
