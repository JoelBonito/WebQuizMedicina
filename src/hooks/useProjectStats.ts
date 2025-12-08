import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';

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

import { useAuth } from './useAuth';

export const useProjectStats = (projectId: string | null) => {
  const { user } = useAuth();
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
    if (!projectId || !user) {
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

        // Buscar fontes (precisa incluir user_id para cumprir regras de segurança)
        const qSources = query(
          collection(db, 'sources'),
          where('project_id', '==', projectId),
          where('user_id', '==', user.uid)
        );
        const sourcesSnap = await getDocs(qSources);
        const totalSources = sourcesSnap.size;
        const readySources = sourcesSnap.docs.filter(d => d.data().status === 'ready').length;

        // Buscar questões (precisa incluir user_id para cumprir regras de segurança)
        const qQuestions = query(
          collection(db, 'questions'),
          where('project_id', '==', projectId),
          where('user_id', '==', user.uid)
        );
        const questionsSnap = await getDocs(qQuestions);
        // Store IDs to filter progress later
        const questions = questionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
        const questionIds = new Set(questions.map((q: any) => q.id));

        const sessionsSet = new Set(questions.map(q => q.session_id).filter(Boolean));
        const totalQuizzes = sessionsSet.size;
        const totalQuestions = questions.length;

        const quizzesByDifficulty = questions.reduce<{ fácil: number; médio: number; difícil: number; }>(
          (acc, q) => {
            const diff = q.dificuldade?.toLowerCase();
            if (diff === 'fácil') acc.fácil++;
            else if (diff === 'médio') acc.médio++;
            else if (diff === 'difícil') acc.difícil++;
            return acc;
          },
          { fácil: 0, médio: 0, difícil: 0 }
        );

        // Buscar progresso (substituindo quiz_attempts)
        // Fetch all user progress and filter by project questions (legacy data missing project_id)
        const qProgress = query(
          collection(db, 'progress'),
          where('user_id', '==', user.uid)
        );
        const progressSnap = await getDocs(qProgress);
        const allProgress = progressSnap.docs.map(d => d.data());

        // Filter progress for this project's questions
        const progress = allProgress.filter(p => p.question_id && questionIds.has(p.question_id));

        const totalQuizAttempts = progress.length;
        const correctAttempts = progress.filter(p => p.acertou === true).length;
        const quizAccuracy = totalQuizAttempts > 0 ? Math.round((correctAttempts / totalQuizAttempts) * 100) : 0;

        // Buscar flashcards (precisa incluir user_id para cumprir regras de segurança)
        const qFlashcards = query(
          collection(db, 'flashcards'),
          where('project_id', '==', projectId),
          where('user_id', '==', user.uid)
        );
        const flashcardsSnap = await getDocs(qFlashcards);
        const flashcards = flashcardsSnap.docs.map(d => d.data());

        const totalFlashcards = flashcards.length;

        const flashcardsByDifficulty = flashcards.reduce<{ fácil: number; médio: number; difícil: number; }>(
          (acc, f) => {
            const diff = f.dificuldade?.toLowerCase();
            if (diff === 'fácil') acc.fácil++;
            else if (diff === 'médio') acc.médio++;
            else if (diff === 'difícil') acc.difícil++;
            return acc;
          },
          { fácil: 0, médio: 0, difícil: 0 }
        );

        // Buscar resumos (precisa incluir user_id para cumprir regras de segurança)
        const qSummaries = query(
          collection(db, 'summaries'),
          where('project_id', '==', projectId),
          where('user_id', '==', user.uid)
        );
        const summariesSnap = await getCountFromServer(qSummaries);
        const totalSummaries = summariesSnap.data().count;

        // Buscar dificuldades
        // Add user_id filter to comply with security rules
        const qDifficulties = query(
          collection(db, 'difficulties'),
          where('project_id', '==', projectId),
          where('user_id', '==', user.uid)
        );
        const difficultiesSnap = await getDocs(qDifficulties);
        const difficulties = difficultiesSnap.docs.map(d => d.data());

        const totalDifficulties = difficulties.length;

        const difficultiesByLevel = difficulties.reduce<{ baixa: number; média: number; alta: number; }>(
          (acc, d) => {
            // Map 'nivel' (number 1-10) to categories
            // 1-3: Baixa
            // 4-7: Média
            // 8-10: Alta
            const nivel = typeof d.nivel === 'number' ? d.nivel : 0;

            if (nivel >= 1 && nivel <= 3) acc.baixa++;
            else if (nivel >= 4 && nivel <= 7) acc.média++;
            else if (nivel >= 8) acc.alta++;
            // Fallback for legacy 'severity' string if exists
            else if (d.severity) {
              const level = d.severity.toLowerCase();
              if (level === 'baixa') acc.baixa++;
              else if (level === 'média') acc.média++;
              else if (level === 'alta') acc.alta++;
            }

            return acc;
          },
          { baixa: 0, média: 0, alta: 0 }
        );

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
  }, [projectId, user]);

  return { stats, loading };
};
