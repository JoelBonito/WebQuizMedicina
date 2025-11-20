import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Flashcard {
  id: string;
  project_id: string;
  source_id: string | null;
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

  const generateFlashcards = async (sourceIds?: string | string[], count: number = 20) => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);

      if (!session) throw new Error('Not authenticated');

      // Support both single sourceId (string) and multiple sourceIds (array)
      const source_ids = Array.isArray(sourceIds) ? sourceIds : (sourceIds ? [sourceIds] : undefined);

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-flashcards`,
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
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
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
