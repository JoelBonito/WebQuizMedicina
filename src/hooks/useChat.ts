import { useState, useEffect } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
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
  created_at: any;
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
  created_at: any;
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
 * Helper to safely convert Firestore timestamp to ISO string
 */
function getSafeDate(timestamp: any): string {
  if (!timestamp) return new Date().toISOString();

  // Handle Firestore Timestamp
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }

  // Handle seconds/nanoseconds object if not a class instance
  if (timestamp.seconds !== undefined && timestamp.nanoseconds !== undefined) {
    return new Date(timestamp.seconds * 1000).toISOString();
  }

  // Handle Date objects
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  // Handle strings/numbers
  try {
    return new Date(timestamp).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
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
        created_at: getSafeDate(current.created_at),
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
          created_at: getSafeDate(current.created_at),
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
          created_at: getSafeDate(current.created_at),
        });
      }
    }
    // Skip standalone assistant messages (shouldn't happen)
  }

  return uiMessages;
}

export const useChat = (projectId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch chat history
  useEffect(() => {
    if (!projectId || !user?.uid) {
      setMessages([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'chat_messages'),
      where('project_id', '==', projectId),
      where('user_id', '==', user.uid),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DbChatMessage));
      const uiMessages = convertDbMessagesToUiFormat(data);
      setMessages(uiMessages);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching messages:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId, user?.uid]);

  const sendMessage = async (message: string): Promise<ChatResponse | null> => {
    if (!user) {
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }

    if (!projectId) {
      throw new Error('Nenhum projeto selecionado. Por favor, selecione um projeto primeiro.');
    }

    try {
      setSending(true);

      const chatFn = httpsCallable(functions, 'chat');
      const result = await chatFn({
        message,
        project_id: projectId
      });

      return result.data as ChatResponse;
    } catch (err: any) {
      console.error('Error sending message:', err);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!user || !projectId) return;

    try {
      const q = query(
        collection(db, 'chat_messages'),
        where('project_id', '==', projectId),
        where('user_id', '==', user.uid)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
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
