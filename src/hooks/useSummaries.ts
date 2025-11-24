import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { CONTENT_REFRESH_EVENT } from '../lib/events';

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
  const { session } = useAuth();
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
  }, [projectId]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // Realtime subscription for instant updates when new summaries are inserted
  useEffect(() => {
    if (!projectId) return;

    // Create a unique channel name based on project_id to avoid conflicts
    const channelName = `summaries_updates_${projectId}`;

    console.log(`[Realtime] Subscribing to channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'summaries',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log(`[Realtime] New summary inserted:`, payload);
          // Immediately refresh the summaries list
          fetchSummaries();
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status for ${channelName}:`, status);
      });

    // Cleanup: unsubscribe when component unmounts or projectId changes
    return () => {
      console.log(`[Realtime] Unsubscribing from channel: ${channelName}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchSummaries]);

  // Local event listener (fallback for when Realtime fails)
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

      if (!session) throw new Error('Not authenticated');

      // Build request body respecting user's source selection:
      // Priority: User selection > All project sources
      //
      // 1. User selected specific sources → send source_ids (backend uses ONLY these)
      // 2. User selected 1 source → send source_id (backend uses only this one)
      // 3. No selection → send only project_id (backend fetches all project sources)
      const requestBody: any = {};

      if (sourceIds) {
        if (Array.isArray(sourceIds) && sourceIds.length > 0) {
          if (sourceIds.length > 1) {
            // Multiple sources selected (e.g., 4 out of 9 sources)
            // Backend will use ONLY these selected sources
            requestBody.source_ids = sourceIds;
            console.log(`📤 [Frontend] Sending ${sourceIds.length} selected sources`);
          } else if (sourceIds.length === 1) {
            // Single source selected
            requestBody.source_id = sourceIds[0];
            console.log(`📤 [Frontend] Sending 1 selected source`);
          }
          // Empty array falls through to project_id logic below
        } else if (typeof sourceIds === 'string') {
          // Single source ID as string (backwards compatibility)
          requestBody.source_id = sourceIds;
          console.log(`📤 [Frontend] Sending 1 selected source (string)`);
        }
      }

      // If no specific sources selected, request all project sources
      if (!requestBody.source_id && !requestBody.source_ids) {
        requestBody.project_id = projectId;
        console.log(`📤 [Frontend] No selection, requesting all project sources`);
      }

      // Call Vercel API route instead of Supabase Edge Function
      const response = await fetch('/api/generate-summary', {
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
