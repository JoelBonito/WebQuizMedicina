import { useState, useEffect, useCallback } from 'react';
import { Question } from './useQuestions';
import { useProgress } from './useProgress';
import { useDifficulties } from './useDifficulties';
import { useQuizPersistence } from './useQuizPersistence';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export type QuizState = "question" | "feedback" | "summary";

export interface Answer {
  questionId: string;
  selectedOption: string | null;
  correct: boolean;
  clicouNaoSei: boolean;
  tempoResposta: number;
}

export interface QuizSessionState {
  currentIndex: number;
  state: QuizState;
  selectedOption: string | null;
  answers: Answer[];
  startTime: number;
  elapsedTime: number;
  showTimer: boolean;
}

export interface QuizStats {
  corretas: number;
  erradas: number;
  naoSei: number;
  tempoMedio: number;
}

export function useQuizSession(
  questions: Question[],
  projectId: string,
  open: boolean
) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<QuizState>("question");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showTimer, setShowTimer] = useState(true);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);

  const { saveQuizProgress } = useProgress();
  const { addDifficulty } = useDifficulties(projectId);
  const { loadProgress, saveProgress, clearProgress } = useQuizPersistence(projectId);

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  // Load saved progress on mount
  useEffect(() => {
    if (open && !hasLoadedProgress) {
      const saved = loadProgress();
      if (saved) {
        setCurrentIndex(saved.currentIndex);
        setAnswers(saved.answers);
        setStartTime(saved.startTime);
        setHasLoadedProgress(true);
        toast.success('Progresso restaurado do último quiz!', {
          description: `Continuando da questão ${saved.currentIndex + 1}`,
          icon: <RefreshCw className="w-4 h-4" />,
        });
      } else {
        setHasLoadedProgress(true);
      }
    }
  }, [open, hasLoadedProgress, loadProgress]);

  // Save progress whenever it changes (debounced)
  useEffect(() => {
    if (open && hasLoadedProgress && state === "question") {
      const timeout = setTimeout(() => {
        saveProgress({
          currentIndex,
          answers,
          startTime,
          projectId,
        });
      }, 500); // Debounce 500ms

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, answers, startTime, projectId, open, hasLoadedProgress, state, saveProgress]);

  // Timer
  useEffect(() => {
    if (state !== "question" || !showTimer) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state, startTime, showTimer]);

  const handleAnswer = useCallback(async (option: string) => {
    if (state !== "question") return;

    setSelectedOption(option);
    setState("feedback");

    const correct = option === currentQuestion.resposta_correta;
    const tempoResposta = Math.floor((Date.now() - startTime) / 1000);

    const answer: Answer = {
      questionId: currentQuestion.id,
      selectedOption: option,
      correct,
      clicouNaoSei: false,
      tempoResposta,
    };

    setAnswers([...answers, answer]);

    try {
      // Save progress
      await saveQuizProgress(
        currentQuestion.id,
        correct,
        false,
        tempoResposta
      );

      // If wrong, add to difficulties
      if (!correct && currentQuestion.topico) {
        await addDifficulty(currentQuestion.topico, "quiz");
      }
    } catch (error) {
      console.error("Error saving answer:", error);
    }
  }, [state, currentQuestion, startTime, answers, saveQuizProgress, addDifficulty]);

  const handleNaoSei = useCallback(async () => {
    if (state !== "question") return;

    setSelectedOption(null);
    setState("feedback");

    const tempoResposta = Math.floor((Date.now() - startTime) / 1000);

    const answer: Answer = {
      questionId: currentQuestion.id,
      selectedOption: null,
      correct: false,
      clicouNaoSei: true,
      tempoResposta,
    };

    setAnswers([...answers, answer]);

    try {
      // Save progress with "não sei"
      await saveQuizProgress(
        projectId,
        currentQuestion.id,
        false,
        true,
        tempoResposta
      );

      // Add to difficulties
      if (currentQuestion.topico) {
        await addDifficulty(currentQuestion.topico, "quiz");
        toast.info(
          `Tópico "${currentQuestion.topico}" adicionado às dificuldades`
        );
      }
    } catch (error) {
      console.error("Error saving 'não sei':", error);
    }
  }, [state, currentQuestion, startTime, answers, saveQuizProgress, addDifficulty]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setState("question");
      setSelectedOption(null);
      setStartTime(Date.now());
      setElapsedTime(0);
    } else {
      setState("summary");
      clearProgress(); // Clear progress when quiz is completed
    }
  }, [currentIndex, questions.length, clearProgress]);

  const handleClose = useCallback(() => {
    setCurrentIndex(0);
    setState("question");
    setSelectedOption(null);
    setAnswers([]);
    setStartTime(Date.now());
    setElapsedTime(0);
    setHasLoadedProgress(false);
    clearProgress(); // Clear saved progress
  }, [clearProgress]);

  const handleRetry = useCallback(() => {
    setCurrentIndex(0);
    setState("question");
    setAnswers([]);
    setStartTime(Date.now());
    clearProgress(); // Clear progress when retrying
  }, [clearProgress]);

  const getStats = useCallback((): QuizStats => {
    return {
      corretas: answers.filter((a) => a.correct).length,
      erradas: answers.filter((a) => !a.correct && !a.clicouNaoSei).length,
      naoSei: answers.filter((a) => a.clicouNaoSei).length,
      tempoMedio:
        answers.reduce((sum, a) => sum + a.tempoResposta, 0) / answers.length || 0,
    };
  }, [answers]);

  return {
    // State
    currentIndex,
    state,
    selectedOption,
    answers,
    startTime,
    elapsedTime,
    showTimer,
    currentQuestion,
    progress,

    // Actions
    handleAnswer,
    handleNaoSei,
    handleNext,
    handleClose,
    handleRetry,

    // Computed
    stats: getStats(),
  };
}
