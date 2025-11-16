import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface ProgressEntry {
  id: string;
  user_id: string;
  question_id: string | null;
  flashcard_id: string | null;
  acertou: boolean | null;
  clicou_nao_sei: boolean;
  tempo_resposta: number | null;
  created_at: string;
}

export const useProgress = () => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const saveQuizProgress = async (
    questionId: string,
    acertou: boolean,
    clicouNaoSei: boolean,
    tempoResposta?: number
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from('progress')
        .insert({
          user_id: user.id,
          question_id: questionId,
          acertou,
          clicou_nao_sei: clicouNaoSei,
          tempo_resposta: tempoResposta || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error saving progress:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const saveFlashcardProgress = async (
    flashcardId: string,
    rating: 'facil' | 'medio' | 'dificil',
    nextReviewInterval: number,
    tempoResposta?: number
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setSaving(true);

      // For flashcards, we treat ratings differently:
      // - facil: acertou = true, clicou_nao_sei = false
      // - medio: acertou = null, clicou_nao_sei = false
      // - dificil: acertou = false, clicou_nao_sei = true
      const acertou = rating === 'facil' ? true : rating === 'dificil' ? false : null;
      const clicouNaoSei = rating === 'dificil';

      const { data, error } = await supabase
        .from('progress')
        .insert({
          user_id: user.id,
          flashcard_id: flashcardId,
          acertou,
          clicou_nao_sei: clicouNaoSei,
          tempo_resposta: tempoResposta || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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
      // Get all questions for this project
      const { data: questions } = await supabase
        .from('questions')
        .select('id')
        .eq('project_id', projectId);

      if (!questions || questions.length === 0) {
        return { total: 0, corretas: 0, erradas: 0, naoSei: 0 };
      }

      const questionIds = questions.map((q) => q.id);

      // Get progress for these questions
      const { data: progressData } = await supabase
        .from('progress')
        .select('*')
        .eq('user_id', user.id)
        .in('question_id', questionIds);

      if (!progressData) {
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
