import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertTriangle, CheckCircle, Sparkles, TrendingUp, BookOpen, MessageSquare, Brain, Loader2, Target } from "lucide-react";
import { useDifficulties } from "../hooks/useDifficulties";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { useSummaries } from "../hooks/useSummaries";
import { toast } from "sonner";
import { ScrollArea } from "./ui/scroll-area";
import { triggerContentRefresh } from "../lib/events";
import { useTranslation } from "react-i18next";

interface DifficultiesPanelProps {
  projectId: string | null;
  isFullscreenMode?: boolean;
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
      return "bg-blue-50 text-blue-700";
    case "flashcard":
      return "bg-green-50 text-green-700";
    case "chat":
      return "bg-[#F0F9FF] text-[#0891B2]";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getLevelColor = (level: number) => {
  if (level >= 5) return "bg-red-500";
  if (level >= 3) return "bg-orange-500";
  return "bg-yellow-500";
};

const getLevelBadgeColor = (level: number) => {
  if (level >= 5) return "bg-red-50 text-red-700";
  if (level >= 3) return "bg-orange-50 text-orange-700";
  return "bg-yellow-50 text-yellow-700";
};

import { StarProgress } from "./StarProgress";

// Remove renderStreakBadge helper as we now use StarProgress component


export function DifficultiesPanel({ projectId, isFullscreenMode = false }: DifficultiesPanelProps) {
  const [generatingContent, setGeneratingContent] = useState(false);
  const { t } = useTranslation();

  const { difficulties, loading, markAsResolved } = useDifficulties(projectId);
  const { generateRecoveryQuiz } = useQuestions(projectId);
  const { generateRecoveryFlashcards } = useFlashcards(projectId);
  const { generateFocusedSummary } = useSummaries(projectId);

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
      toast.success(t('difficulties.topicResolved', { topic: topico }));
    } catch (error) {
      toast.error(t('difficulties.errorResolving'));
    }
  };

  const handleGenerateFocusedSummary = async () => {
    if (topDifficulties.length === 0) {
      toast.error(t('difficulties.noDifficultyFound'));
      return;
    }

    try {
      setGeneratingContent(true);

      const topicsText = topDifficulties.map((d) => d.topico).join(", ");

      await toast.promise(
        generateFocusedSummary(),
        {
          loading: t('difficulties.generatingSummary', { topics: topicsText }),
          success: t('difficulties.summaryGenerated'),
          error: t('difficulties.errorGeneratingSummary'),
        }
      );

      // Notify ContentPanel to refresh (legacy event)
      window.dispatchEvent(new CustomEvent('content-generated'));

      // Trigger content refresh for all hooks (fallback for Realtime)
      triggerContentRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingContent(false);
    }
  };



  // Phase 4C: Generate Recovery Quiz
  const handleGenerateRecoveryQuiz = async () => {
    if (topDifficulties.length === 0) {
      toast.error(t('difficulties.noDifficultyFound'));
      return;
    }

    try {
      setGeneratingContent(true);

      const topicsText = topDifficulties.map((d) => d.topico).join(", ");

      const result = await toast.promise(
        generateRecoveryQuiz(undefined, 10), // difficulties will be fetched by backend if undefined
        {
          loading: t('difficulties.generatingQuiz', { topics: topicsText }),
          success: (data: any) => {
            const metadata = data?.recovery_metadata;
            const strategy = metadata?.strategy || 'focused';
            const focus = metadata?.focus_percentage || 100;

            return t('difficulties.quizGenerated', { strategy: strategy.toUpperCase(), focus });
          },
          error: t('difficulties.errorGeneratingQuiz'),
        }
      );

      // Mark session as recovery for title/badge display
      const data = (result as any).data;
      const sessionId = data?.session_id;
      if (sessionId) {
        const { markAsRecoverySession } = await import('../lib/recoverySessionTracker');
        markAsRecoverySession(sessionId);
      }

      // Notify ContentPanel to refresh (legacy event)
      window.dispatchEvent(new CustomEvent('content-generated'));

      // Trigger content refresh for all hooks (fallback for Realtime)
      triggerContentRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingContent(false);
    }
  };

  // Phase 4C: Generate Recovery Flashcards
  const handleGenerateRecoveryFlashcards = async () => {
    if (topDifficulties.length === 0) {
      toast.error(t('difficulties.noDifficultyFound'));
      return;
    }

    try {
      setGeneratingContent(true);

      const topicsText = topDifficulties.map((d) => d.topico).join(", ");

      const result = await toast.promise(
        generateRecoveryFlashcards(undefined, 20), // difficulties will be fetched by backend if undefined
        {
          loading: t('difficulties.generatingSummary', { topics: topicsText }),
          success: (data: any) => {
            const metadata = data?.recovery_metadata;
            const strategy = metadata?.strategy || 'focused';

            return t('difficulties.flashcardsGenerated', { strategy: strategy.toUpperCase() });
          },
          error: t('difficulties.errorGeneratingFlashcards'),
        }
      );

      // Mark session as recovery for title/badge display
      const data = (result as any).data;
      const sessionId = data?.session_id;
      if (sessionId) {
        const { markAsRecoverySession } = await import('../lib/recoverySessionTracker');
        markAsRecoverySession(sessionId);
      }

      // Notify ContentPanel to refresh (legacy event)
      window.dispatchEvent(new CustomEvent('content-generated'));

      // Trigger content refresh for all hooks (fallback for Realtime)
      triggerContentRefresh();
    } catch (error) {
      console.error(error);
    } finally {
      setGeneratingContent(false);
    }
  };

  if (!projectId) {
    return (
      <div className={`flex flex-col ${isFullscreenMode
        ? "bg-muted/50 p-6"
        : "bg-muted/50 rounded-3xl p-4 border border-border h-full"
        }`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-muted-foreground">{t('difficulties.selectProject')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isFullscreenMode
      ? "bg-muted/50 p-6"
      : "bg-muted/50 rounded-3xl p-4 border border-border h-full"
      }`}>
      {/* Header */}
      <div className="glass-dark rounded-2xl p-4 mb-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-foreground font-semibold">{t('difficulties.dashboard')}</h3>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="glass rounded-xl p-3 border border-border">
            <p className="text-xs text-muted-foreground mb-1">{t('difficulties.total')}</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-red-200 bg-red-50/50">
            <p className="text-xs text-red-600 mb-1">{t('difficulties.critical')}</p>
            <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-orange-200 bg-orange-50/50">
            <p className="text-xs text-orange-600 mb-1">{t('difficulties.moderate')}</p>
            <p className="text-2xl font-bold text-orange-700">{stats.moderate}</p>
          </div>
          <div className="glass rounded-xl p-3 border border-green-200 bg-green-50/50">
            <p className="text-xs text-green-600 mb-1">{t('difficulties.resolved')}</p>
            <p className="text-2xl font-bold text-green-700">{stats.resolved}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
        </div>
      ) : activeDifficulties.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h4 className="text-foreground font-semibold mb-2">{t('difficulties.noDifficulties')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('difficulties.noDifficultiesDesc')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Generate Focused Content Buttons */}
          {topDifficulties.length > 0 && (
            <div className="glass-dark rounded-2xl p-4 mb-4 border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50">
              <div className="mb-3">
                <h4 className="text-foreground font-semibold mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                  {t('difficulties.personalizedContent')}
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  {t('difficulties.focusedOn', { count: topDifficulties.length })}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {topDifficulties.slice(0, 3).map((d, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-background text-orange-700">
                      {d.topico}
                    </Badge>
                  ))}
                  {topDifficulties.length > 3 && (
                    <Badge variant="outline" className="text-xs bg-background text-orange-700">
                      +{topDifficulties.length - 3}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button
                  onClick={handleGenerateFocusedSummary}
                  disabled={generatingContent}
                  className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#2B3E6F] hover:from-[#0891B2] hover:to-[#2B3E6F] text-white shadow-lg flex flex-col items-center py-6 h-auto"
                >
                  {generatingContent ? (
                    <Loader2 className="w-5 h-5 mb-1 animate-spin" />
                  ) : (
                    <BookOpen className="w-5 h-5 mb-1" />
                  )}
                  <span className="text-sm font-semibold">{t('difficulties.focusedSummary')}</span>
                  <span className="text-xs opacity-90 mt-1">{t('difficulties.studyFirst')}</span>
                </Button>

                <Button
                  onClick={handleGenerateRecoveryQuiz}
                  disabled={generatingContent}
                  variant="outline"
                  className="rounded-xl border-2 border-orange-400 text-orange-700 hover:bg-orange-50 shadow-lg flex flex-col items-center py-6 h-auto"
                >
                  {generatingContent ? (
                    <Loader2 className="w-5 h-5 mb-1 animate-spin" />
                  ) : (
                    <Target className="w-5 h-5 mb-1" />
                  )}
                  <span className="text-sm font-semibold">{t('difficulties.recoveryQuiz')}</span>
                  <span className="text-xs opacity-90 mt-1">{t('difficulties.adaptive')}</span>
                </Button>

                <Button
                  onClick={handleGenerateRecoveryFlashcards}
                  disabled={generatingContent}
                  variant="outline"
                  className="rounded-xl border-2 border-orange-400 text-orange-700 hover:bg-orange-50 shadow-lg flex flex-col items-center py-6 h-auto"
                >
                  {generatingContent ? (
                    <Loader2 className="w-5 h-5 mb-1 animate-spin" />
                  ) : (
                    <Brain className="w-5 h-5 mb-1" />
                  )}
                  <span className="text-sm font-semibold">{t('difficulties.recoveryFlashcards')}</span>
                  <span className="text-xs opacity-90 mt-1">{t('difficulties.atomized')}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Difficulties List */}
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                {t('difficulties.activeDifficulties', { count: activeDifficulties.length })}
              </h4>

              {activeDifficulties
                .sort((a, b) => b.nivel - a.nivel)
                .map((difficulty, index) => (
                  <motion.div
                    key={difficulty.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-hover glass-dark rounded-2xl p-4 border border-border"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="text-foreground font-semibold">{difficulty.topico}</h5>
                          <Badge className={`rounded-lg ${getLevelBadgeColor(difficulty.nivel)}`}>
                            {t('difficulties.level', { level: difficulty.nivel })}
                          </Badge>
                          <Badge className={`rounded-lg ${getOriginColor(difficulty.tipo_origem)}`}>
                            {getOriginIcon(difficulty.tipo_origem)}
                            <span className="ml-1 capitalize">{difficulty.tipo_origem}</span>
                          </Badge>
                        </div>



                        {/* Level Bar */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((difficulty.nivel / 10) * 100, 100)}%` }}
                              transition={{ duration: 0.5, delay: index * 0.05 }}
                              className={`h-full ${getLevelColor(difficulty.nivel)} rounded-full`}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {Math.min(Math.round((difficulty.nivel / 10) * 100), 100)}%
                          </span>
                        </div>

                        <p className="text-xs text-gray-500">
                          {t('difficulties.identifiedOn')}{" "}
                          {new Date(difficulty.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-3 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsResolved(difficulty.id, difficulty.topico)}
                          className="rounded-lg border-green-300 text-green-700 hover:bg-green-50 w-full"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {t('difficulties.resolve')}
                        </Button>

                        {/* Star Progress Inline */}
                        <StarProgress
                          consecutiveCorrect={difficulty.consecutive_correct || 0}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}

              {/* Resolved Difficulties */}
              {resolvedDifficulties.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mt-6">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    {t('difficulties.resolved')} ({resolvedDifficulties.length})
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
                            <p className="text-sm text-muted-foreground font-medium">{difficulty.topico}</p>
                            <Badge variant="outline" className="text-xs text-green-700">
                              {t('difficulties.wasLevel', { level: difficulty.nivel })}
                            </Badge>
                            {/* Badge Inline se Auto-Resolvido */}
                            {difficulty.auto_resolved_at ? (
                              <div className="w-full">
                                <StarProgress
                                  consecutiveCorrect={3}
                                  showBadge={true}
                                />
                              </div>
                            ) : (
                              <Badge className="text-xs bg-muted text-muted-foreground border-border mt-2">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {t('difficulties.resolvedManually')}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
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
