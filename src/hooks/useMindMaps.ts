import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface MindMap {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content_mermaid: string;
  source_ids: string[] | null;
  tipo: 'standard' | 'recovery';
  created_at: string;
}

export const useMindMaps = (projectId: string | null) => {
  const { session } = useAuth();
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchMindMaps = useCallback(async () => {
    if (!projectId) {
      setMindMaps([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mindmaps')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMindMaps(data || []);
    } catch (err) {
      console.error('Error fetching mind maps:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMindMaps();
  }, [fetchMindMaps]);

  // Realtime subscription for instant updates when new mind maps are inserted
  useEffect(() => {
    if (!projectId) return;

    // Create a unique channel name based on project_id to avoid conflicts
    const channelName = `mindmaps_list_${projectId}`;

    console.log(`[Realtime] Subscribing to channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mindmaps',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log(`[Realtime] New mind map inserted:`, payload);
          // Immediately refresh the mind maps list
          fetchMindMaps();
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
  }, [projectId, fetchMindMaps]);

  const generateMindMap = async (sourceIds?: string | string[], tipo: 'standard' | 'recovery' = 'standard') => {
    if (!projectId && !sourceIds) throw new Error('Project or source required');

    try {
      setGenerating(true);

      if (!session) throw new Error('Not authenticated');

      // Build request body respecting user's source selection
      const requestBody: any = { tipo };

      if (sourceIds) {
        if (Array.isArray(sourceIds) && sourceIds.length > 0) {
          requestBody.source_ids = sourceIds;
          console.log(`📤 [MindMap] Sending ${sourceIds.length} selected sources`);
        } else if (typeof sourceIds === 'string') {
          requestBody.source_ids = [sourceIds];
          console.log(`📤 [MindMap] Sending 1 selected source`);
        }
      }

      // If no specific sources selected, request all project sources
      if (!requestBody.source_ids || requestBody.source_ids.length === 0) {
        requestBody.project_id = projectId;
        console.log(`📤 [MindMap] No selection, requesting all project sources`);
      }

      // Call Vercel API route
      const response = await fetch('/api/generate-mindmap', {
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
        throw new Error(result.error || 'Failed to generate mind map');
      }

      // Refresh mind maps
      await fetchMindMaps();
      return result;
    } catch (err) {
      console.error('Error generating mind map:', err);
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const deleteMindMap = async (id: string) => {
    try {
      const { error } = await supabase.from('mindmaps').delete().eq('id', id);

      if (error) throw error;
      setMindMaps(mindMaps.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Error deleting mind map:', err);
      throw err;
    }
  };

  return {
    mindMaps,
    loading,
    generating,
    generateMindMap,
    deleteMindMap,
    refetch: fetchMindMaps,
  };
};
