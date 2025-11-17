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
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to state immediately
      setSources([source, ...sources]);

      // 4. Process file (extract content if possible)
      try {
        const extractedContent = await processFile(file);

        // Log for debugging
        if (import.meta.env.DEV && extractedContent) {
          console.log('Extracted content length:', extractedContent.length);
          console.log('First 100 chars:', extractedContent.substring(0, 100));
        }

        // 5. Update source with extracted content
        const { data: updatedSource, error: updateError } = await supabase
          .from('sources')
          .update({
            extracted_content: extractedContent,
            status: 'ready',
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
        setSources(sources.map((s) => (s.id === source.id ? updatedSource : s)));
      } catch (processError) {
        console.error('Error processing file:', processError);

        // Mark as error with message
        const { data: updatedSource } = await supabase
          .from('sources')
          .update({
            status: 'error',
            // Store error message in metadata if possible
          })
          .eq('id', source.id)
          .select()
          .single();

        if (updatedSource) {
          setSources(sources.map((s) => (s.id === source.id ? updatedSource : s)));
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
      const source = sources.find((s) => s.id === id);
      if (!source) throw new Error('Source not found');

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('project-sources')
        .remove([source.storage_path]);

      if (storageError) console.error('Storage delete error:', storageError);

      // Delete from database
      const { error } = await supabase.from('sources').delete().eq('id', id);

      if (error) throw error;
      setSources(sources.filter((s) => s.id !== id));
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
