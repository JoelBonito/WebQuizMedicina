import { useState, useEffect } from 'react';
import { db, functions } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './useAuth';

export interface Difficulty {
  id: string;
  user_id: string;
  project_id: string;
  topico: string;
  tipo_origem: 'quiz' | 'flashcard' | 'chat';
  nivel: number;
  resolvido: boolean;
  created_at: any;
  updated_at?: any;
  consecutive_correct?: number;
  last_attempt_at?: any;
  auto_resolved_at?: any;
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
      const q = query(
        collection(db, 'difficulties'),
        where('user_id', '==', user.uid),
        where('project_id', '==', projectId),
        orderBy('nivel', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Difficulty));
      setDifficulties(data);
    } catch (err) {
      console.error('Error fetching difficulties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid || !projectId) return;
    fetchDifficulties();
  }, [user?.uid, projectId]);

  const addDifficulty = async (
    topico: string,
    tipoOrigem: 'quiz' | 'flashcard' | 'chat'
  ) => {
    if (!user || !projectId) throw new Error('User or project not found');

    try {
      // Check if difficulty already exists
      const q = query(
        collection(db, 'difficulties'),
        where('user_id', '==', user.uid),
        where('project_id', '==', projectId),
        where('topico', '==', topico),
        where('resolvido', '==', false),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      const existingDoc = querySnapshot.empty ? null : querySnapshot.docs[0];

      if (existingDoc) {
        // Increment level
        const existingData = existingDoc.data() as Difficulty;
        const newLevel = (existingData.nivel || 1) + 1;

        await updateDoc(doc(db, 'difficulties', existingDoc.id), {
          nivel: newLevel,
          updated_at: serverTimestamp()
        });

        const updatedData = { ...existingData, nivel: newLevel, updated_at: new Date() }; // Optimistic

        // Update local state
        setDifficulties(
          difficulties.map((d) => (d.id === existingDoc.id ? updatedData : d))
        );

        return updatedData;
      } else {
        // Create new difficulty
        const newData = {
          user_id: user.uid,
          project_id: projectId,
          topico,
          tipo_origem: tipoOrigem,
          nivel: 1,
          resolvido: false,
          created_at: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'difficulties'), newData);
        const createdData = { id: docRef.id, ...newData, created_at: new Date() } as Difficulty;

        // Add to local state
        setDifficulties([createdData, ...difficulties]);

        return createdData;
      }
    } catch (err) {
      console.error('Error adding difficulty:', err);
      throw err;
    }
  };

  const markAsResolved = async (id: string) => {
    try {
      await updateDoc(doc(db, 'difficulties', id), {
        resolvido: true,
        updated_at: serverTimestamp()
      });

      // Update local state
      setDifficulties(difficulties.map((d) =>
        d.id === id ? { ...d, resolvido: true } : d
      ));
    } catch (err) {
      console.error('Error marking as resolved:', err);
      throw err;
    }
  };

  const getTopDifficulties = (limitCount: number = 5) => {
    return difficulties
      .filter((d) => !d.resolvido)
      .sort((a, b) => b.nivel - a.nivel)
      .slice(0, limitCount);
  };

  // Phase 4C: Get statistics via API
  const getStatistics = async (): Promise<DifficultyStatistics | null> => {
    if (!user || !projectId) return null;

    try {
      const manageDifficultiesFn = httpsCallable(functions, 'manage_difficulties');
      const result = await manageDifficultiesFn({
        action: 'statistics',
        project_id: projectId,
      });

      return result.data as DifficultyStatistics;
    } catch (err) {
      console.error('Error fetching difficulty statistics:', err);
      return null;
    }
  };

  // Phase 4C: Check auto-resolve after answer
  const checkAutoResolve = async (topic: string, correct: boolean) => {
    if (!user || !projectId) return null;

    try {
      const manageDifficultiesFn = httpsCallable(functions, 'manage_difficulties');
      const result = await manageDifficultiesFn({
        action: 'check_auto_resolve',
        project_id: projectId,
        topic,
        correct,
      });

      const data = result.data as any;

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
      const manageDifficultiesFn = httpsCallable(functions, 'manage_difficulties');
      const result = await manageDifficultiesFn({
        action: 'normalize_topic',
        topic,
      });

      const data = result.data as any;
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
    getStatistics,
    checkAutoResolve,
    normalizeTopic,
  };
};
