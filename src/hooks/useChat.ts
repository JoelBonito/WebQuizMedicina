import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  message: string;
  response: string;
  sources_cited: string[];
  created_at: string;
}

export interface CitedSource {
  id: string;
  file_name: string;
  file_type: string;
}

export interface ChatResponse {
  response: string;
  cited_sources: CitedSource[];
  suggested_topics: string[];
  has_difficulties_context: boolean;
}

export const useChat = (projectId: string | null) => {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch chat history
  useEffect(() => {
    if (!projectId || !user) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [projectId, user]);

  const sendMessage = async (message: string): Promise<ChatResponse | null> => {
    // More detailed error checking - VERCEL BUILD v2
    if (!session) {
      console.error('[useChat] Session is missing:', { session, user, projectId });
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }

    if (!projectId) {
      console.error('[useChat] ProjectId is missing:', { session: !!session, user: !!user, projectId });
      throw new Error('Nenhum projeto selecionado. Por favor, selecione um projeto primeiro.');
    }

    try {
      setSending(true);

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message, project_id: projectId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data: ChatResponse = await response.json();

      // Refresh messages to include the new one
      const { data: newMessages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });

      if (newMessages) {
        setMessages(newMessages);
      }

      return data;
    } catch (err) {
      console.error('Error sending message:', err);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!user || !projectId) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id);

      if (error) throw error;
      setMessages([]);
    } catch (err) {
      console.error('Error clearing chat history:', err);
      throw err;
    }
  };

  return {
    messages,
    loading,
    sending,
    sendMessage,
    clearHistory,
  };
};
