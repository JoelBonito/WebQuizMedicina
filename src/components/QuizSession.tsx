import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Trophy,
  Target,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Question } from "../hooks/useQuestions";
import { useProgress } from "../hooks/useProgress";
import { useDifficulties } from "../hooks/useDifficulties";
import { useQuizPersistence } from "../hooks/useQuizPersistence";
import { toast } from "sonner";

interface QuizSessionProps {
  questions: Question[];
  projectId: string;
  open: boolean;
  onClose: () => void;
}

type QuizState = "question" | "feedback" | "summary";

interface Answer {
  questionId: string;
  selectedOption: string | null;
  correct: boolean;
  clicouNaoSei: boolean;
  tempoResposta: number;
}

export function QuizSession({
  questions,
  projectId,
  open,
  onClose,
}: QuizSessionProps) {
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

  const handleAnswer = async (option: string) => {
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
  };

  const handleNaoSei = async () => {
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
  };

  const handleNext = () => {
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
  };

  const handleClose = () => {
    setCurrentIndex(0);
    setState("question");
    setSelectedOption(null);
    setAnswers([]);
    setStartTime(Date.now());
    setElapsedTime(0);
    setHasLoadedProgress(false);
    clearProgress(); // Clear saved progress
    onClose();
  };

  const getOptionLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A, B, C, D
  };

  const isCorrectOption = (option: string) => {
    return option === currentQuestion.resposta_correta;
  };

  const getOptionStyle = (option: string) => {
    if (state !== "feedback") {
      return "glass border border-gray-200 hover:border-[#0891B2] hover:bg-[#F0F9FF]/30";
    }

    const isSelected = option === selectedOption;
    const isCorrect = isCorrectOption(option);

    if (isCorrect) {
      return "bg-green-50 border-2 border-green-500 text-green-900";
    }

    if (isSelected && !isCorrect) {
      return "bg-red-50 border-2 border-red-500 text-red-900";
    }

    return "glass border border-gray-200 opacity-50";
  };

  // Summary stats
  const stats = {
    corretas: answers.filter((a) => a.correct).length,
    erradas: answers.filter((a) => !a.correct && !a.clicouNaoSei).length,
    naoSei: answers.filter((a) => a.clicouNaoSei).length,
    tempoMedio:
      answers.reduce((sum, a) => sum + a.tempoResposta, 0) / answers.length || 0,
  };

  if (!currentQuestion) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
        <AnimatePresence mode="wait">
          {state === "summary" ? (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 md:p-8 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-8 overflow-y-auto overscroll-contain h-screen supports-[height:100dvh]:h-dvh w-full"
            >
              <DialogTitle className="sr-only">Resumo do Quiz</DialogTitle>
              <DialogDescription className="sr-only">
                Visualização dos resultados do quiz completo com estatísticas de desempenho
              </DialogDescription>
              {/* Summary */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  Quiz Concluído!
                </h2>
                <p className="text-gray-600">
                  Você completou {questions.length} questões
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-dark rounded-2xl p-6 text-center border border-gray-200">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.corretas}
                  </p>
                  <p className="text-sm text-gray-600">Corretas</p>
                </div>

                <div className="glass-dark rounded-2xl p-6 text-center border border-gray-200">
                  <XCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.erradas}
                  </p>
                  <p className="text-sm text-gray-600">Erradas</p>
                </div>

                <div className="glass-dark rounded-2xl p-6 text-center border border-gray-200">
                  <HelpCircle className="w-8 h-8 mx-auto mb-2 text-orange-600" />
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.naoSei}
                  </p>
                  <p className="text-sm text-gray-600">Não Sei</p>
                </div>

                <div className="glass-dark rounded-2xl p-6 text-center border border-gray-200">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <p className="text-3xl font-bold text-gray-900">
                    {Math.round(stats.tempoMedio)}s
                  </p>
                  <p className="text-sm text-gray-600">Tempo Médio</p>
                </div>
              </div>

              {/* Score */}
              <div className="glass rounded-3xl p-6 mb-6 border border-[#BAE6FD] bg-gradient-to-br from-[#F0F9FF] to-[#F1F8E9]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">
                      Pontuação Final
                    </p>
                    <p className="text-4xl font-bold bg-gradient-to-r from-[#0891B2] to-[#7CB342] bg-clip-text text-transparent">
                      {Math.round((stats.corretas / questions.length) * 100)}%
                    </p>
                  </div>
                  <Target className="w-12 h-12 text-[#0891B2]" />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700"
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    setCurrentIndex(0);
                    setState("question");
                    setAnswers([]);
                    setStartTime(Date.now());
                    clearProgress(); // Clear progress when retrying
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg"
                >
                  Tentar Novamente
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="quiz"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-screen supports-[height:100dvh]:h-dvh w-full"
            >
              <DialogTitle className="sr-only">
                Questão {currentIndex + 1} de {questions.length}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {state === "feedback"
                  ? "Feedback da resposta selecionada com explicação detalhada"
                  : "Responda a questão selecionando uma das alternativas ou clique em 'Não Sei'"}
              </DialogDescription>
              {/* Header */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-gray-900">
                      Questão {currentIndex + 1} de {questions.length}
                    </h3>
                    {currentQuestion.dificuldade && (
                      <Badge
                        className={`rounded-lg ${
                          currentQuestion.dificuldade === "fácil"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : currentQuestion.dificuldade === "médio"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {currentQuestion.dificuldade}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {showTimer && state === "question" && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span className="font-mono">{elapsedTime}s</span>
                      </div>
                    )}
                    <button
                      onClick={handleClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <Progress value={progress} className="h-2" />
              </div>

              {/* Question Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6 pb-40 md:pb-32">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="max-w-3xl mx-auto"
                >
                  {/* Question */}
                  <h3 className="text-2xl font-semibold text-gray-900 mb-8">
                    {currentQuestion.pergunta}
                  </h3>

                  {/* Options */}
                  <div className="space-y-3 mb-6">
                    {currentQuestion.opcoes.map((option, index) => {
                      const letter = getOptionLetter(index);
                      return (
                        <button
                          key={index}
                          onClick={() => handleAnswer(letter)}
                          disabled={state !== "question"}
                          className={`w-full text-left p-4 rounded-xl transition-all duration-300 ${getOptionStyle(
                            letter
                          )}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="font-bold text-lg">{letter})</span>
                            <span className="flex-1">
                              {option.replace(/^[A-D]\)\s*/, "")}
                            </span>
                            {state === "feedback" && isCorrectOption(letter) && (
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            )}
                            {state === "feedback" &&
                              letter === selectedOption &&
                              !isCorrectOption(letter) && (
                                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                              )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Feedback */}
                  {state === "feedback" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Result Banner */}
                      {selectedOption ? (
                        isCorrectOption(selectedOption) ? (
                          <div className="glass rounded-2xl p-4 border-2 border-green-500 bg-green-50">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="w-6 h-6 text-green-600" />
                              <div>
                                <p className="font-semibold text-green-900">
                                  Resposta Correta!
                                </p>
                                <p className="text-sm text-green-700">
                                  Parabéns, você acertou!
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="glass rounded-2xl p-4 border-2 border-red-500 bg-red-50">
                            <div className="flex items-center gap-3">
                              <XCircle className="w-6 h-6 text-red-600" />
                              <div>
                                <p className="font-semibold text-red-900">
                                  Resposta Incorreta
                                </p>
                                <p className="text-sm text-red-700">
                                  A resposta correta é{" "}
                                  {currentQuestion.resposta_correta}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="glass rounded-2xl p-4 border-2 border-orange-500 bg-orange-50">
                          <div className="flex items-center gap-3">
                            <HelpCircle className="w-6 h-6 text-orange-600" />
                            <div>
                              <p className="font-semibold text-orange-900">
                                Não Sei
                              </p>
                              <p className="text-sm text-orange-700">
                                Tópico adicionado às dificuldades. A resposta
                                correta é {currentQuestion.resposta_correta}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Justificativa */}
                      {currentQuestion.justificativa && (
                        <div className="glass-dark rounded-2xl p-4 border border-gray-200">
                          <p className="text-sm font-semibold text-gray-900 mb-2">
                            💡 Explicação:
                          </p>
                          <p className="text-sm text-gray-700">
                            {currentQuestion.justificativa}
                          </p>
                        </div>
                      )}

                      {/* Dica */}
                      {currentQuestion.dica && !isCorrectOption(selectedOption || "") && (
                        <div className="glass rounded-2xl p-4 border border-[#BAE6FD] bg-[#F0F9FF]/50">
                          <p className="text-sm font-semibold text-[#0891B2] mb-1">
                            💭 Dica:
                          </p>
                          <p className="text-sm text-[#0891B2]">
                            {currentQuestion.dica}
                          </p>
                        </div>
                      )}

                      {/* Tópico */}
                      {currentQuestion.topico && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Tópico:</span>
                          <Badge variant="outline" className="rounded-lg">
                            {currentQuestion.topico}
                          </Badge>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6 border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
                <div className="max-w-3xl mx-auto">
                  {state === "question" ? (
                    <div className="flex gap-3">
                      <Button
                        onClick={handleNaoSei}
                        variant="outline"
                        className="flex-1 rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold"
                      >
                        <HelpCircle className="w-5 h-5 mr-2" />
                        NÃO SEI
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleNext}
                      className="w-full rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg"
                    >
                      {currentIndex < questions.length - 1
                        ? "Próxima Questão"
                        : "Ver Resultado"}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
