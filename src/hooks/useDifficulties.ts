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
  updated_at?: string;
  // Phase 4C: Auto-Resolution Fields
  consecutive_correct?: number;
  last_attempt_at?: string;
  auto_resolved_at?: string;
}

export interface DifficultyStatistics {
  total: number;
  resolved: number;
  unresolved: number;
  autoResolved: number;
  averageStreak: number;
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
    if (!user?.id || !projectId) return;
    fetchDifficulties();
  }, [user?.id, projectId]);

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

      // Update local state
      setDifficulties(difficulties.map((d) =>
        d.id === id ? { ...d, resolvido: true } : d
      ));
    } catch (err) {
      console.error('Error marking as resolved:', err);
      throw err;
    }
  };

  const getTopDifficulties = (limit: number = 5) => {
    return difficulties
      .filter((d) => !d.resolvido)
      .sort((a, b) => b.nivel - a.nivel)
      .slice(0, limit);
  };

  // Phase 4C: Get statistics via API
  const getStatistics = async (): Promise<DifficultyStatistics | null> => {
    if (!user || !projectId) return null;

    try {
      const { data, error } = await supabase.functions.invoke('manage-difficulties', {
        body: {
          action: 'statistics',
          project_id: projectId,
        },
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching difficulty statistics:', err);
      return null;
    }
  };

  // Phase 4C: Check auto-resolve after answer
  const checkAutoResolve = async (topic: string, correct: boolean) => {
    if (!user || !projectId) return null;

    try {
      const { data, error } = await supabase.functions.invoke('manage-difficulties', {
        body: {
          action: 'check_auto_resolve',
          project_id: projectId,
          topic,
          correct,
        },
      });

      if (error) throw error;

      // Refresh difficulties list if auto-resolved
      if (data?.auto_resolved) {
        await fetchDifficulties();
      }

      return data;
    } catch (err) {
      console.error('Error checking auto-resolve:', err);
      return null;
    }
  };

  // Phase 4C: Normalize topic using taxonomy
  const normalizeTopic = async (topic: string): Promise<string> => {
    if (!user) return topic;

    try {
      const { data, error } = await supabase.functions.invoke('manage-difficulties', {
        body: {
          action: 'normalize_topic',
          topic,
        },
      });

      if (error) throw error;
      return data?.normalized || topic;
    } catch (err) {
      console.error('Error normalizing topic:', err);
      return topic;
    }
  };

  return {
    difficulties,
    loading,
    addDifficulty,
    markAsResolved,
    getTopDifficulties,
    refetch: fetchDifficulties,
    // Phase 4C functions
    getStatistics,
    checkAutoResolve,
    normalizeTopic,
  };
};
