import { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './useAuth';

export interface ProgressEntry {
  id: string;
  user_id: string;
  project_id: string;
  question_id: string | null;
  flashcard_id: string | null;
  acertou: boolean | null;
  clicou_nao_sei: boolean;
  tempo_resposta: number | null;
  created_at: any;
}

export const useProgress = () => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const saveQuizProgress = async (
    projectId: string,
    questionId: string,
    acertou: boolean,
    clicouNaoSei: boolean,
    tempoResposta?: number
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setSaving(true);

      const newData = {
        user_id: user.uid,
        project_id: projectId,
        question_id: questionId,
        acertou,
        clicou_nao_sei: clicouNaoSei,
        tempo_resposta: tempoResposta || null,
        created_at: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'progress'), newData);
      return { id: docRef.id, ...newData, created_at: new Date() };
    } catch (err) {
      console.error('Error saving progress:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const saveFlashcardProgress = async (
    projectId: string,
    flashcardId: string,
    rating: 'facil' | 'medio' | 'dificil',
    nextReviewInterval: number,
    tempoResposta?: number
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setSaving(true);

      const acertou = rating === 'facil' ? true : rating === 'dificil' ? false : null;
      const clicouNaoSei = rating === 'dificil';

      const newData = {
        user_id: user.uid,
        project_id: projectId,
        flashcard_id: flashcardId,
        acertou,
        clicou_nao_sei: clicouNaoSei,
        tempo_resposta: tempoResposta || null,
        created_at: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'progress'), newData);
      return { id: docRef.id, ...newData, created_at: new Date() };
    } catch (err) {
      console.error('Error saving flashcard progress:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const getQuizStats = async (projectId: string) => {
    if (!user) throw new Error('User not authenticated');

    try {
      // Now we can query progress by project_id directly!
      const qProgress = query(
        collection(db, 'progress'),
        where('user_id', '==', user.uid),
        where('project_id', '==', projectId)
      );
      const progressSnap = await getDocs(qProgress);

      const progressData = progressSnap.docs.map(doc => doc.data() as ProgressEntry);

      if (progressData.length === 0) {
        return { total: 0, corretas: 0, erradas: 0, naoSei: 0 };
      }

      const corretas = progressData.filter((p) => p.acertou === true).length;
      const erradas = progressData.filter(
        (p) => p.acertou === false && !p.clicou_nao_sei
      ).length;
      const naoSei = progressData.filter((p) => p.clicou_nao_sei).length;

      return {
        total: progressData.length,
        corretas,
        erradas,
        naoSei,
      };
    } catch (err) {
      console.error('Error getting quiz stats:', err);
      return { total: 0, corretas: 0, erradas: 0, naoSei: 0 };
    }
  };

  return {
    saving,
    saveQuizProgress,
    saveFlashcardProgress,
    getQuizStats,
  };
};
