import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import {
  uploadFileToStorage,
  getFileType,
  processFile,
  getFileMetadata,
  FileMetadata,
} from '../lib/fileUtils';

export interface Source {
  id: string;
  project_id: string;
  name: string;
  type: string;
  storage_path: string;
  extracted_content: string | null;
  metadata: FileMetadata | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  created_at: string;
}

export const useSources = (projectId: string | null) => {
  const { user } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    if (!projectId) {
      setSources([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (err) {
      console.error('Error fetching sources:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar fontes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();

    // Setup realtime subscription for sources updates
    if (!projectId) return;

    const channel = supabase
      .channel(`sources:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sources',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[useSources] Realtime update:', payload);

          if (payload.eventType === 'INSERT') {
            const newSource = payload.new as Source;
            console.log('[useSources] INSERT - New source:', { id: newSource.id, name: newSource.name, status: newSource.status });
            setSources((prev) => {
              const updated = [newSource, ...prev];
              console.log('[useSources] After INSERT, total sources:', updated.length);
              return updated;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedSource = payload.new as Source;
            console.log('[useSources] UPDATE - Updated source:', {
              id: updatedSource.id,
              name: updatedSource.name,
              oldStatus: payload.old?.status,
              newStatus: updatedSource.status,
              embeddings_status: updatedSource.embeddings_status
            });
            setSources((prev) => {
              const updated = prev.map((s) => (s.id === updatedSource.id ? updatedSource : s));
              console.log('[useSources] After UPDATE, sources:', updated.map(s => ({ id: s.id, status: s.status })));
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            console.log('[useSources] DELETE - Deleted source ID:', payload.old?.id);
            setSources((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const uploadSource = async (file: File) => {
    if (!user || !projectId) throw new Error('User or project not found');

    try {
      setUploading(true);

      // 1. Upload to storage
      const storagePath = await uploadFileToStorage(file, user.id, projectId);

      // 2. Get file metadata
      const metadata = await getFileMetadata(file);
      const fileType = getFileType(file);

      // 3. Create source record with 'processing' status
      const { data: source, error: insertError } = await supabase
        .from('sources')
        .insert([
          {
            project_id: projectId,
            name: file.name,
            type: fileType,
            storage_path: storagePath,
            metadata,
            status: 'processing',
            embeddings_status: 'pending', // Initialize embeddings status as pending
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to state immediately
      setSources(prevSources => [source, ...prevSources]);

      // 4. Process file (extract content if possible)
      try {
        const extractedContent = await processFile(file);

        // Log for debugging
        if (import.meta.env.DEV && extractedContent) {
          console.log('Extracted content length:', extractedContent.length);
          console.log('First 100 chars:', extractedContent.substring(0, 100));

          // Check for null bytes
          const nullByteCount = (extractedContent.match(/\u0000/g) || []).length;
          if (nullByteCount > 0) {
            console.error('⚠️ NULL BYTES FOUND:', nullByteCount);
          }
        }

        // FINAL SAFETY CHECK: Remove any null bytes that might have slipped through
        const safeContent = extractedContent ? extractedContent.replace(/\u0000/g, '') : extractedContent;

        // Verify no null bytes remain
        if (safeContent && safeContent.includes('\u0000')) {
          console.error('❌ NULL BYTES STILL PRESENT AFTER FINAL CHECK!');
          throw new Error('Texto contém caracteres inválidos que não podem ser processados');
        }

        // 5. Update source with extracted content
        // Keep embeddings_status as 'pending' so it can be processed
        const { data: updatedSource, error: updateError } = await supabase
          .from('sources')
          .update({
            extracted_content: safeContent,
            status: 'ready',
            embeddings_status: 'pending', // Keep as pending for embeddings processing
          })
          .eq('id', source.id)
          .select()
          .single();

        if (updateError) {
          console.error('Supabase update error:', {
            code: updateError.code,
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
          });
          throw updateError;
        }

        // Update in state
        setSources(prevSources => prevSources.map((s) => (s.id === source.id ? updatedSource : s)));
      } catch (processError) {
        console.error('Error processing file:', processError);

        // Mark as error with message
        const { data: updatedSource } = await supabase
          .from('sources')
          .update({
            status: 'error',
            embeddings_status: 'failed', // Mark embeddings as failed too
            // Store error message in metadata if possible
          })
          .eq('id', source.id)
          .select()
          .single();

        if (updatedSource) {
          setSources(prevSources => prevSources.map((s) => (s.id === source.id ? updatedSource : s)));
        }

        // Re-throw to show toast error
        throw processError;
      }

      return source;
    } catch (err) {
      console.error('Error uploading source:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const deleteSource = async (id: string) => {
    try {
      // Get source from current state
      const source = sources.find((s) => s.id === id);
      if (!source) throw new Error('Source not found');

      // Delete from database first
      const { error } = await supabase.from('sources').delete().eq('id', id);

      if (error) throw error;

      // Delete from storage (non-blocking)
      supabase.storage
        .from('project-sources')
        .remove([source.storage_path])
        .then(({ error: storageError }) => {
          if (storageError) console.error('Storage delete error:', storageError);
        });

      // Update state immediately
      setSources(prevSources => prevSources.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Error deleting source:', err);
      throw err;
    }
  };

  const getGeneratedCounts = async (sourceId: string) => {
    try {
      const [questionsResult, flashcardsResult, summariesResult] = await Promise.all([
        supabase.from('questions').select('id', { count: 'exact' }).eq('source_id', sourceId),
        supabase.from('flashcards').select('id', { count: 'exact' }).eq('source_id', sourceId),
        supabase.from('summaries').select('id', { count: 'exact' }).match({ source_ids: [sourceId] }),
      ]);

      return {
        quiz: questionsResult.count || 0,
        flashcards: flashcardsResult.count || 0,
        summaries: summariesResult.count || 0,
      };
    } catch (err) {
      console.error('Error getting generated counts:', err);
      return { quiz: 0, flashcards: 0, summaries: 0 };
    }
  };

  return {
    sources,
    loading,
    uploading,
    error,
    uploadSource,
    deleteSource,
    getGeneratedCounts,
    refetch: fetchSources,
  };
};
