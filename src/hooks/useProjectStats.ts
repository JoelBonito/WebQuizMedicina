import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface ProjectStats {
  // Fontes
  totalSources: number;
  readySources: number;

  // Quiz
  totalQuizzes: number;
  totalQuestions: number;
  quizzesByDifficulty: {
    fácil: number;
    médio: number;
    difícil: number;
  };
  quizAccuracy: number; // % de acerto
  totalQuizAttempts: number;

  // Flashcards
  totalFlashcards: number;
  flashcardsByDifficulty: {
    fácil: number;
    médio: number;
    difícil: number;
  };

  // Resumos
  totalSummaries: number;

  // Dificuldades
  totalDifficulties: number;
  difficultiesByLevel: {
    baixa: number;
    média: number;
    alta: number;
  };
}

export const useProjectStats = (projectId: string | null) => {
  const [stats, setStats] = useState<ProjectStats>({
    totalSources: 0,
    readySources: 0,
    totalQuizzes: 0,
    totalQuestions: 0,
    quizzesByDifficulty: { fácil: 0, médio: 0, difícil: 0 },
    quizAccuracy: 0,
    totalQuizAttempts: 0,
    totalFlashcards: 0,
    flashcardsByDifficulty: { fácil: 0, médio: 0, difícil: 0 },
    totalSummaries: 0,
    totalDifficulties: 0,
    difficultiesByLevel: { baixa: 0, média: 0, alta: 0 },
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setStats({
        totalSources: 0,
        readySources: 0,
        totalQuizzes: 0,
        totalQuestions: 0,
        quizzesByDifficulty: { fácil: 0, médio: 0, difícil: 0 },
        quizAccuracy: 0,
        totalQuizAttempts: 0,
        totalFlashcards: 0,
        flashcardsByDifficulty: { fácil: 0, médio: 0, difícil: 0 },
        totalSummaries: 0,
        totalDifficulties: 0,
        difficultiesByLevel: { baixa: 0, média: 0, alta: 0 },
      });
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);

        // Buscar fontes
        const { data: sources } = await supabase
          .from('sources')
          .select('status')
          .eq('project_id', projectId);

        const totalSources = sources?.length || 0;
        const readySources = sources?.filter(s => s.status === 'ready').length || 0;

        // Buscar questões e agrupar por session_id
        const { data: questions } = await supabase
          .from('questions')
          .select('session_id, dificuldade')
          .eq('project_id', projectId);

        const sessionsSet = new Set(questions?.map(q => q.session_id).filter(Boolean));
        const totalQuizzes = sessionsSet.size;
        const totalQuestions = questions?.length || 0;

        // Agrupar por dificuldade
        const quizzesByDifficulty = questions?.reduce(
          (acc, q) => {
            const diff = q.dificuldade?.toLowerCase();
            if (diff === 'fácil') acc.fácil++;
            else if (diff === 'médio') acc.médio++;
            else if (diff === 'difícil') acc.difícil++;
            return acc;
          },
          { fácil: 0, médio: 0, difícil: 0 }
        ) || { fácil: 0, médio: 0, difícil: 0 };

        // Buscar tentativas de quiz para calcular % de acerto
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('correct')
          .eq('project_id', projectId);

        const totalQuizAttempts = attempts?.length || 0;
        const correctAttempts = attempts?.filter(a => a.correct).length || 0;
        const quizAccuracy = totalQuizAttempts > 0 ? Math.round((correctAttempts / totalQuizAttempts) * 100) : 0;

        // Buscar flashcards
        const { data: flashcards } = await supabase
          .from('flashcards')
          .select('session_id, dificuldade')
          .eq('project_id', projectId);

        const totalFlashcards = flashcards?.length || 0;

        const flashcardsByDifficulty = flashcards?.reduce(
          (acc, f) => {
            const diff = f.dificuldade?.toLowerCase();
            if (diff === 'fácil') acc.fácil++;
            else if (diff === 'médio') acc.médio++;
            else if (diff === 'difícil') acc.difícil++;
            return acc;
          },
          { fácil: 0, médio: 0, difícil: 0 }
        ) || { fácil: 0, médio: 0, difícil: 0 };

        // Buscar resumos
        const { data: summaries } = await supabase
          .from('summaries')
          .select('id')
          .eq('project_id', projectId);

        const totalSummaries = summaries?.length || 0;

        // Buscar dificuldades
        const { data: difficulties } = await supabase
          .from('difficulties')
          .select('severity')
          .eq('project_id', projectId);

        const totalDifficulties = difficulties?.length || 0;

        const difficultiesByLevel = difficulties?.reduce(
          (acc, d) => {
            const level = d.severity?.toLowerCase();
            if (level === 'baixa') acc.baixa++;
            else if (level === 'média') acc.média++;
            else if (level === 'alta') acc.alta++;
            return acc;
          },
          { baixa: 0, média: 0, alta: 0 }
        ) || { baixa: 0, média: 0, alta: 0 };

        setStats({
          totalSources,
          readySources,
          totalQuizzes,
          totalQuestions,
          quizzesByDifficulty,
          quizAccuracy,
          totalQuizAttempts,
          totalFlashcards,
          flashcardsByDifficulty,
          totalSummaries,
          totalDifficulties,
          difficultiesByLevel,
        });
      } catch (error) {
        console.error('Error fetching project stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [projectId]);

  return { stats, loading };
};
