import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertTriangle, CheckCircle, Sparkles, TrendingUp, BookOpen, MessageSquare, Brain, Loader2 } from "lucide-react";
import { useDifficulties } from "../hooks/useDifficulties";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";

interface DifficultiesPanelProps {
  projectId: string | null;
}

const getOriginIcon = (origin: string) => {
  switch (origin) {
    case "quiz":
      return <BookOpen className="w-3 h-3" />;
    case "flashcard":
      return <Brain className="w-3 h-3" />;
    case "chat":
      return <MessageSquare className="w-3 h-3" />;
    default:
      return <AlertTriangle className="w-3 h-3" />;
  }
};

const getOriginColor = (origin: string) => {
  switch (origin) {
    case "quiz":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "flashcard":
      return "bg-green-50 text-green-700 border-green-200";
    case "chat":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
};

const getLevelColor = (level: number) => {
  if (level >= 5) return "bg-red-500";
  if (level >= 3) return "bg-orange-500";
  return "bg-yellow-500";
};

const getLevelBadgeColor = (level: number) => {
  if (level >= 5) return "bg-red-50 text-red-700 border-red-200";
  if (level >= 3) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-yellow-50 text-yellow-700 border-yellow-200";
};

export function DifficultiesPanel({ projectId }: DifficultiesPanelProps) {
  const [generatingFocused, setGeneratingFocused] = useState(false);

  const { difficulties, loading, markAsResolved } = useDifficulties(projectId);
  const { generateQuiz } = useQuestions(projectId);
  const { generateFlashcards } = useFlashcards(projectId);

  const activeDifficulties = difficulties.filter((d) => !d.resolvido);
  const resolvedDifficulties = difficulties.filter((d) => d.resolvido);

  // Statistics
  const stats = {
    total: activeDifficulties.length,
    critical: activeDifficulties.filter((d) => d.nivel >= 5).length,
    moderate: activeDifficulties.filter((d) => d.nivel >= 3 && d.nivel < 5).length,
    low: activeDifficulties.filter((d) => d.nivel < 3).length,
    resolved: resolvedDifficulties.length,
  };

  const topDifficulties = activeDifficulties
    .sort((a, b) => b.nivel - a.nivel)
    .slice(0, 5);

  const handleMarkAsResolved = async (difficultyId: string, topico: string) => {
    try {
      await markAsResolved(difficultyId);
      toast.success(`Tópico "${topico}" marcado como resolvido!`);
    } catch (error) {
      toast.error("Erro ao marcar como resolvido");
    }
  };

  const handleGenerateFocusedContent = async () => {
    if (topDifficulties.length === 0) {
      toast.error("Nenhuma dificuldade encontrada");
      return;
    }

    try {
      setGeneratingFocused(true);

      // Generate both quiz and flashcards focused on top difficulties
      const topicsText = topDifficulties.map((d) => d.topico).join(", ");

      toast.promise(
        Promise.all([
          generateQuiz(undefined, 10),
          generateFlashcards(undefined, 15),
        ]),
        {
          loading: `Gerando conteúdo focado em: ${topicsText}...`,
          success: "Conteúdo personalizado gerado com sucesso! Confira no painel de Conteúdo.",
          error: "Erro ao gerar conteúdo personalizado",
        }
      );
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingFocused(false);
    }
  };

  if (!projectId) {
    return (
      <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Selecione um projeto para ver suas dificuldades</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
      {/* Header */}
      <div className="glass-dark rounded-2xl p-4 mb-4 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-gray-900 font-semibold">Dashboard de Dificuldades</h3>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="glass rounded-xl p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-red-200 bg-red-50/50">
            <p className="text-xs text-red-600 mb-1">Críticas</p>
            <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-orange-200 bg-orange-50/50">
            <p className="text-xs text-orange-600 mb-1">Moderadas</p>
            <p className="text-2xl font-bold text-orange-700">{stats.moderate}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-green-200 bg-green-50/50">
            <p className="text-xs text-green-600 mb-1">Resolvidas</p>
            <p className="text-2xl font-bold text-green-700">{stats.resolved}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : activeDifficulties.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h4 className="text-gray-900 font-semibold mb-2">Nenhuma dificuldade encontrada!</h4>
            <p className="text-sm text-gray-600">
              Continue estudando com quiz e flashcards. Quando você clicar em "NÃO SEI" ou avaliar como "Difícil",
              os tópicos aparecerão aqui.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Generate Focused Content Button */}
          {topDifficulties.length > 0 && (
            <div className="glass-dark rounded-2xl p-4 mb-4 border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-gray-900 font-semibold mb-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    Conteúdo Personalizado
                  </h4>
                  <p className="text-sm text-gray-700 mb-2">
                    Gere quiz e flashcards focados nos seus {topDifficulties.length} tópicos mais difíceis
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {topDifficulties.slice(0, 3).map((d, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs bg-white border-orange-300 text-orange-700">
                        {d.topico}
                      </Badge>
                    ))}
                    {topDifficulties.length > 3 && (
                      <Badge variant="outline" className="text-xs bg-white border-orange-300 text-orange-700">
                        +{topDifficulties.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleGenerateFocusedContent}
                  disabled={generatingFocused}
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg ml-4"
                >
                  {generatingFocused ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Gerar Conteúdo Focado
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Difficulties List */}
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-2">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                Dificuldades Ativas ({activeDifficulties.length})
              </h4>

              {activeDifficulties
                .sort((a, b) => b.nivel - a.nivel)
                .map((difficulty, index) => (
                  <motion.div
                    key={difficulty.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-hover glass-dark rounded-2xl p-4 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="text-gray-900 font-semibold">{difficulty.topico}</h5>
                          <Badge className={`rounded-lg ${getLevelBadgeColor(difficulty.nivel)}`}>
                            Nível {difficulty.nivel}
                          </Badge>
                          <Badge className={`rounded-lg ${getOriginColor(difficulty.tipo_origem)}`}>
                            {getOriginIcon(difficulty.tipo_origem)}
                            <span className="ml-1 capitalize">{difficulty.tipo_origem}</span>
                          </Badge>
                        </div>

                        {/* Level Bar */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((difficulty.nivel / 10) * 100, 100)}%` }}
                              transition={{ duration: 0.5, delay: index * 0.05 }}
                              className={`h-full ${getLevelColor(difficulty.nivel)} rounded-full`}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-12 text-right">
                            {Math.min(Math.round((difficulty.nivel / 10) * 100), 100)}%
                          </span>
                        </div>

                        <p className="text-xs text-gray-500">
                          Identificada em{" "}
                          {new Date(difficulty.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkAsResolved(difficulty.id, difficulty.topico)}
                        className="rounded-lg border-green-300 text-green-700 hover:bg-green-50 ml-4"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Resolver
                      </Button>
                    </div>
                  </motion.div>
                ))}

              {/* Resolved Difficulties */}
              {resolvedDifficulties.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mt-6">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Resolvidas ({resolvedDifficulties.length})
                  </h4>

                  {resolvedDifficulties
                    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
                    .slice(0, 5)
                    .map((difficulty, index) => (
                      <motion.div
                        key={difficulty.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="glass rounded-2xl p-3 border border-green-200 bg-green-50/30 opacity-75"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <p className="text-sm text-gray-700 font-medium">{difficulty.topico}</p>
                            <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                              Era nível {difficulty.nivel}
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(difficulty.updated_at || difficulty.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                </>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
