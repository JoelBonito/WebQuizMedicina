import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { X, RotateCw, ChevronRight, Trophy, Smile, Meh, Frown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Progress } from "./ui/progress";
import { useProgress } from "../hooks/useProgress";
import { useDifficulties } from "../hooks/useDifficulties";
import { toast } from "sonner";

interface Flashcard {
  id: string;
  frente: string;
  verso: string;
  topico: string;
  dificuldade: string;
}

interface FlashcardSessionProps {
  flashcards: Flashcard[];
  projectId: string;
  open: boolean;
  onClose: () => void;
}

type CardState = "front" | "back" | "rating";
type SessionState = "studying" | "summary";
type Rating = "facil" | "medio" | "dificil";

interface CardProgress {
  flashcardId: string;
  rating: Rating;
  topico: string;
}

// SM-2 Algorithm for spaced repetition
interface SM2Result {
  interval: number; // days until next review
  repetitions: number;
  easeFactor: number;
}

function calculateSM2(quality: number, prevData?: SM2Result): SM2Result {
  // quality: 0-5 (0=worst, 5=best)
  // We'll map: difícil=1, médio=3, fácil=5

  const prevInterval = prevData?.interval || 0;
  const prevRepetitions = prevData?.repetitions || 0;
  const prevEaseFactor = prevData?.easeFactor || 2.5;

  let newEaseFactor = prevEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }

  let newRepetitions = prevRepetitions;
  let newInterval = prevInterval;

  if (quality < 3) {
    // Reset if quality is too low
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = prevRepetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(prevInterval * newEaseFactor);
    }
  }

  return {
    interval: newInterval,
    repetitions: newRepetitions,
    easeFactor: newEaseFactor,
  };
}

export function FlashcardSession({ flashcards, projectId, open, onClose }: FlashcardSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardState, setCardState] = useState<CardState>("front");
  const [sessionState, setSessionState] = useState<SessionState>("studying");
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<CardProgress[]>([]);
  const [startTime] = useState<number>(Date.now());

  const { saveFlashcardProgress } = useProgress();
  const { addDifficulty } = useDifficulties(projectId);

  const currentCard = flashcards[currentIndex];
  const progressPercentage = ((currentIndex + 1) / flashcards.length) * 100;

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setCardState(isFlipped ? "front" : "back");
  };

  const handleRating = async (rating: Rating) => {
    if (!currentCard) return;

    // Convert rating to quality for SM-2
    const quality = rating === "facil" ? 5 : rating === "medio" ? 3 : 1;
    const sm2Result = calculateSM2(quality);

    // Save progress
    const clicouNaoSei = rating === "dificil";
    const tempoTotal = Math.floor((Date.now() - startTime) / 1000);

    try {
      await saveFlashcardProgress(
        currentCard.id,
        rating,
        sm2Result.interval,
        tempoTotal
      );

      // Add to difficulties if marked as difficult
      if (clicouNaoSei && currentCard.topico) {
        await addDifficulty(currentCard.topico, "flashcard");
        toast.success(`Tópico "${currentCard.topico}" adicionado às dificuldades`);
      }
    } catch (error) {
      console.error("Error saving flashcard progress:", error);
    }

    // Update local progress
    setProgress([
      ...progress,
      {
        flashcardId: currentCard.id,
        rating,
        topico: currentCard.topico,
      },
    ]);

    // Move to next card or show summary
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setCardState("front");
      setIsFlipped(false);
    } else {
      setSessionState("summary");
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setCardState("front");
    setSessionState("studying");
    setIsFlipped(false);
    setProgress([]);
  };

  const handleClose = () => {
    handleRestart();
    onClose();
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "fácil":
        return "bg-green-50 text-green-700 border-green-200";
      case "médio":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "difícil":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  // Calculate statistics
  const stats = {
    facil: progress.filter((p) => p.rating === "facil").length,
    medio: progress.filter((p) => p.rating === "medio").length,
    dificil: progress.filter((p) => p.rating === "dificil").length,
    total: flashcards.length,
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-full h-screen m-0 rounded-none p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {sessionState === "summary"
            ? "Resumo da Sessão de Flashcards"
            : `Flashcard ${currentIndex + 1} de ${flashcards.length}`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {sessionState === "summary"
            ? "Visualização dos resultados da sessão de flashcards com estatísticas de desempenho"
            : "Estude os flashcards virando as cartas e avalie seu conhecimento"}
        </DialogDescription>
        {sessionState === "studying" ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  Flashcard {currentIndex + 1} de {flashcards.length}
                </h3>
                {currentCard && (
                  <Badge className={`rounded-lg ${getDifficultyColor(currentCard.dificuldade)}`}>
                    {currentCard.dificuldade}
                  </Badge>
                )}
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="px-6 pt-4">
              <Progress value={progressPercentage} className="h-2" />
              <p className="text-xs text-gray-600 mt-2 text-center">
                {Math.round(progressPercentage)}% completo
              </p>
            </div>

            {/* Flashcard */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 overflow-y-auto">
              <motion.div
                className="relative w-full max-w-2xl"
                style={{ perspective: 1000 }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isFlipped ? "back" : "front"}
                    initial={{ rotateY: isFlipped ? -180 : 0, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ rotateY: isFlipped ? 180 : -180, opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className="glass-dark rounded-3xl p-12 border-2 border-gray-200 shadow-2xl min-h-[400px] flex flex-col items-center justify-center cursor-pointer"
                    onClick={handleFlip}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div className="text-center">
                      <p className="text-xs font-semibold text-[#0891B2] mb-4 uppercase tracking-wider">
                        {isFlipped ? "VERSO" : "FRENTE"}
                      </p>
                      <p className="text-2xl text-gray-900 leading-relaxed">
                        {isFlipped ? currentCard?.verso : currentCard?.frente}
                      </p>
                      {currentCard?.topico && !isFlipped && (
                        <Badge variant="outline" className="mt-8 rounded-lg">
                          {currentCard.topico}
                        </Badge>
                      )}
                    </div>

                    {/* Flip hint */}
                    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <RotateCw className="w-4 h-4" />
                        <span>Clique para virar</span>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Rating Buttons */}
            {cardState === "back" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 border-t border-gray-200 bg-gray-50/50"
              >
                <p className="text-sm text-gray-700 mb-4 text-center font-medium">
                  Como foi a dificuldade deste flashcard?
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <Button
                    onClick={() => handleRating("dificil")}
                    variant="outline"
                    className="h-auto py-4 rounded-xl border-2 border-gray-300 text-red-700 hover:bg-red-50 hover:border-red-400 flex flex-col gap-2"
                  >
                    <Frown className="w-6 h-6" />
                    <span className="font-semibold">Difícil</span>
                    <span className="text-xs text-red-600">Revisar em 1 dia</span>
                  </Button>
                  <Button
                    onClick={() => handleRating("medio")}
                    variant="outline"
                    className="h-auto py-4 rounded-xl border-2 border-gray-300 text-yellow-700 hover:bg-yellow-50 hover:border-yellow-400 flex flex-col gap-2"
                  >
                    <Meh className="w-6 h-6" />
                    <span className="font-semibold">Médio</span>
                    <span className="text-xs text-yellow-600">Revisar em 6 dias</span>
                  </Button>
                  <Button
                    onClick={() => handleRating("facil")}
                    variant="outline"
                    className="h-auto py-4 rounded-xl border-2 border-gray-300 text-green-700 hover:bg-green-50 hover:border-green-400 flex flex-col gap-2"
                  >
                    <Smile className="w-6 h-6" />
                    <span className="font-semibold">Fácil</span>
                    <span className="text-xs text-green-600">Revisar quando precisar</span>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Next hint for front */}
            {cardState === "front" && (
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600 text-center">
                  Vire o card para ver a resposta e avaliar sua compreensão
                </p>
              </div>
            )}
          </div>
        ) : (
          // Summary Screen
          <div className="flex flex-col items-center justify-center p-12 overflow-y-auto h-full max-h-screen">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.6 }}
              className="mb-8"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
                <Trophy className="w-12 h-12 text-white" />
              </div>
            </motion.div>

            <h2 className="text-3xl font-bold text-gray-900 mb-2">Sessão Concluída!</h2>
            <p className="text-gray-600 mb-8">Você revisou todos os flashcards</p>

            <div className="grid grid-cols-3 gap-6 w-full max-w-2xl mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-dark rounded-2xl p-6 text-center border border-green-200"
              >
                <Smile className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <p className="text-3xl font-bold text-green-700 mb-1">{stats.facil}</p>
                <p className="text-sm text-gray-600">Fácil</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-dark rounded-2xl p-6 text-center border border-yellow-200"
              >
                <Meh className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                <p className="text-3xl font-bold text-yellow-700 mb-1">{stats.medio}</p>
                <p className="text-sm text-gray-600">Médio</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-dark rounded-2xl p-6 text-center border border-red-200"
              >
                <Frown className="w-8 h-8 mx-auto mb-2 text-red-600" />
                <p className="text-3xl font-bold text-red-700 mb-1">{stats.dificil}</p>
                <p className="text-sm text-gray-600">Difícil</p>
              </motion.div>
            </div>

            <div className="glass rounded-2xl p-6 mb-8 max-w-2xl w-full border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Próximas Revisões</h3>
              <div className="space-y-2 text-sm">
                {stats.dificil > 0 && (
                  <p className="text-red-700">
                    • {stats.dificil} flashcard{stats.dificil > 1 ? "s" : ""} para revisar amanhã
                  </p>
                )}
                {stats.medio > 0 && (
                  <p className="text-yellow-700">
                    • {stats.medio} flashcard{stats.medio > 1 ? "s" : ""} para revisar em 6 dias
                  </p>
                )}
                {stats.facil > 0 && (
                  <p className="text-green-700">
                    • {stats.facil} flashcard{stats.facil > 1 ? "s" : ""} dominado{stats.facil > 1 ? "s" : ""}!
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={handleRestart}
                variant="outline"
                className="rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700"
              >
                <RotateCw className="w-4 h-4 mr-2" />
                Revisar Novamente
              </Button>
              <Button
                onClick={handleClose}
                className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg"
              >
                Concluir
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
