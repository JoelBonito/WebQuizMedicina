import { useState, useEffect } from 'react';

interface QuizProgress {
  currentIndex: number;
  answers: Array<{
    questionId: string;
    selectedOption: string | null;
    correct: boolean;
    clicouNaoSei: boolean;
    tempoResposta: number;
  }>;
  startTime: number;
  projectId: string;
  timestamp: number;
}

const STORAGE_KEY = 'quiz_progress';
const PROGRESS_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export function useQuizPersistence(projectId: string) {
  const [hasRestoredProgress, setHasRestoredProgress] = useState(false);

  // Load saved progress
  const loadProgress = (): QuizProgress | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const progress: QuizProgress = JSON.parse(stored);

      // Check if progress is for same project
      if (progress.projectId !== projectId) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // Check if progress is expired
      const age = Date.now() - progress.timestamp;
      if (age > PROGRESS_EXPIRY) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      console.log('[QuizPersistence] Loaded saved progress:', {
        currentIndex: progress.currentIndex,
        answersCount: progress.answers.length,
      });

      return progress;
    } catch (error) {
      console.error('[QuizPersistence] Error loading progress:', error);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  };

  // Save progress
  const saveProgress = (progress: Omit<QuizProgress, 'timestamp'>) => {
    try {
      const dataToSave: QuizProgress = {
        ...progress,
        timestamp: Date.now(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));

      console.log('[QuizPersistence] Saved progress:', {
        currentIndex: progress.currentIndex,
        answersCount: progress.answers.length,
      });
    } catch (error) {
      console.error('[QuizPersistence] Error saving progress:', error);
    }
  };

  // Clear progress
  const clearProgress = () => {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[QuizPersistence] Cleared saved progress');
  };

  return {
    loadProgress,
    saveProgress,
    clearProgress,
    hasRestoredProgress,
    setHasRestoredProgress,
  };
}
