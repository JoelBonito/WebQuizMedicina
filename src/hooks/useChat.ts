import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

// Database message format (new schema with role + content)
interface DbChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources_cited: string[] | null;
  is_system?: boolean;
  created_at: string;
}

// Legacy format for UI compatibility
export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  message: string;
  response: string;
  sources_cited: string[];
  is_system?: boolean;
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

/**
 * Converts database messages (role + content) to UI format (message + response)
 * Groups pairs of user/assistant messages into single ChatMessage objects
 */
function convertDbMessagesToUiFormat(dbMessages: DbChatMessage[]): ChatMessage[] {
  const uiMessages: ChatMessage[] = [];

  for (let i = 0; i < dbMessages.length; i++) {
    const current = dbMessages[i];

    if (current.role === 'system' || current.is_system) {
      // System message - show as standalone notification
      uiMessages.push({
        id: current.id,
        project_id: current.project_id,
        user_id: current.user_id,
        message: '',
        response: current.content,
        sources_cited: [],
        is_system: true,
        created_at: current.created_at,
      });
    } else if (current.role === 'user') {
      // Find the next assistant message
      const assistantMsg = dbMessages[i + 1];

      if (assistantMsg && assistantMsg.role === 'assistant') {
        // Pair found - create combined message
        uiMessages.push({
          id: current.id,
          project_id: current.project_id,
          user_id: current.user_id,
          message: current.content,
          response: assistantMsg.content,
          sources_cited: assistantMsg.sources_cited || [],
          created_at: current.created_at,
        });
        i++; // Skip the assistant message since we already processed it
      } else {
        // User message without response (shouldn't happen in normal flow)
        uiMessages.push({
          id: current.id,
          project_id: current.project_id,
          user_id: current.user_id,
          message: current.content,
          response: 'Aguardando resposta...',
          sources_cited: [],
          created_at: current.created_at,
        });
      }
    }
    // Skip standalone assistant messages (shouldn't happen)
  }

  return uiMessages;
}

export const useChat = (projectId: string | null) => {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch chat history
  useEffect(() => {
    if (!projectId || !user?.id) {
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

        // Convert from DB format (role+content) to UI format (message+response)
        const uiMessages = convertDbMessagesToUiFormat(data || []);
        setMessages(uiMessages);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Setup realtime subscription for chat messages
    const channel = supabase
      .channel(`chat_messages:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[useChat] Realtime update:', payload);

          // Refetch all messages to maintain correct pairing
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, user?.id]);

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
        // Convert from DB format to UI format
        const uiMessages = convertDbMessagesToUiFormat(newMessages);
        setMessages(uiMessages);
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

