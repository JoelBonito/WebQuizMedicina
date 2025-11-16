import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Difficulty {
  id: string;
  user_id: string;
  project_id: string;
  topico: string;
  tipo_origem: 'quiz' | 'flashcard' | 'chat';
  nivel: number;
  resolvido: boolean;
  created_at: string;
}

export const useDifficulties = (projectId: string | null) => {
  const { user } = useAuth();
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDifficulties = async () => {
    if (!user || !projectId) {
      setDifficulties([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('difficulties')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('resolvido', false)
        .order('nivel', { ascending: false });

      if (error) throw error;
      setDifficulties(data || []);
    } catch (err) {
      console.error('Error fetching difficulties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDifficulties();
  }, [user, projectId]);

  const addDifficulty = async (
    topico: string,
    tipoOrigem: 'quiz' | 'flashcard' | 'chat'
  ) => {
    if (!user || !projectId) throw new Error('User or project not found');

    try {
      // Check if difficulty already exists
      const { data: existing } = await supabase
        .from('difficulties')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('topico', topico)
        .eq('resolvido', false)
        .maybeSingle();

      if (existing) {
        // Increment level
        const { data, error } = await supabase
          .from('difficulties')
          .update({ nivel: existing.nivel + 1 })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setDifficulties(
          difficulties.map((d) => (d.id === existing.id ? data : d))
        );

        return data;
      } else {
        // Create new difficulty
        const { data, error } = await supabase
          .from('difficulties')
          .insert({
            user_id: user.id,
            project_id: projectId,
            topico,
            tipo_origem: tipoOrigem,
            nivel: 1,
          })
          .select()
          .single();

        if (error) throw error;

        // Add to local state
        setDifficulties([data, ...difficulties]);

        return data;
      }
    } catch (err) {
      console.error('Error adding difficulty:', err);
      throw err;
    }
  };

  const markAsResolved = async (id: string) => {
    try {
      const { error } = await supabase
        .from('difficulties')
        .update({ resolvido: true })
        .eq('id', id);

      if (error) throw error;

      // Remove from local state
      setDifficulties(difficulties.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Error marking as resolved:', err);
      throw err;
    }
  };

  const getTopDifficulties = (limit: number = 5) => {
    return difficulties
      .sort((a, b) => b.nivel - a.nivel)
      .slice(0, limit);
  };

  return {
    difficulties,
    loading,
    addDifficulty,
    markAsResolved,
    getTopDifficulties,
    refetch: fetchDifficulties,
  };
};
