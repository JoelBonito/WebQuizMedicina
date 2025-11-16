import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Summary {
  id: string;
  project_id: string;
  titulo: string;
  conteudo_html: string;
  topicos: string[] | null;
  source_ids: string[] | null;
  tipo?: string; // 'normal' or 'personalizado'
  created_at: string;
}

export const useSummaries = (projectId: string | null) => {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchSummaries = async () => {
    if (!projectId) {
      setSummaries([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSummaries(data || []);
    } catch (err) {
      console.error('Error fetching summaries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, [projectId]);

  const generateSummary = async (sourceId?: string) => {
    if (!projectId && !sourceId) throw new Error('Project or source required');

    try {
      setGenerating(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            source_id: sourceId,
            project_id: projectId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate summary');
      }

      // Refresh summaries
      await fetchSummaries();
      return result;
    } catch (err) {
      console.error('Error generating summary:', err);
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const generateFocusedSummary = async () => {
    if (!projectId) throw new Error('Project ID required');

    try {
      setGenerating(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-focused-summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            project_id: projectId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate focused summary');
      }

      // Refresh summaries
      await fetchSummaries();
      return result;
    } catch (err) {
      console.error('Error generating focused summary:', err);
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const deleteSummary = async (id: string) => {
    try {
      const { error } = await supabase.from('summaries').delete().eq('id', id);

      if (error) throw error;
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
