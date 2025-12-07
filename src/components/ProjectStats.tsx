import { X, BookOpen, HelpCircle, Layers, FileText, AlertTriangle, Award, Target, BarChart3 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion } from "motion/react";
import { useProjectStats } from "../hooks/useProjectStats";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "./ui/dialog";

interface ProjectStatsProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

interface StatCardProps {
  icon: React.ElementType;
  title: string;
  value: string | number;
  subtitle?: string;
  iconColor: string;
  bgColor: string;
}

const StatCard = ({ icon: Icon, title, value, subtitle, iconColor, bgColor }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className={`${bgColor} rounded-2xl p-6 border border-border`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-12 h-12 rounded-xl ${iconColor} bg-opacity-10 flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
    </div>
    <div>
      <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  </motion.div>
);

export function ProjectStats({ projectId, projectName, open, onClose }: ProjectStatsProps) {
  const { stats } = useProjectStats(projectId);
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
        <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-muted overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 bg-background border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  {t('stats.title', { project: projectName })}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-1">
                  {t('stats.subtitle')}
                </DialogDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-10 w-10 p-0 rounded-xl hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Principais Métricas */}
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#0891B2]" />
                  {t('stats.overview')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    icon={BookOpen}
                    title={t('stats.sources')}
                    value={stats.totalSources}
                    subtitle={t('stats.readySources', { count: stats.readySources })}
                    iconColor="text-[#0891B2] dark:text-[#22d3ee]"
                    bgColor="bg-[#F0F9FF] dark:bg-cyan-950/30"
                  />
                  <StatCard
                    icon={HelpCircle}
                    title={t('stats.questions')}
                    value={stats.totalQuestions}
                    subtitle={t('stats.quizzesCount', { count: stats.totalQuizzes })}
                    iconColor="text-blue-600 dark:text-blue-400"
                    bgColor="bg-blue-50 dark:bg-blue-900/20"
                  />
                  <StatCard
                    icon={Layers}
                    title={t('stats.flashcards')}
                    value={stats.totalFlashcards}
                    iconColor="text-red-600 dark:text-red-400"
                    bgColor="bg-red-50 dark:bg-red-900/20"
                  />
                  <StatCard
                    icon={FileText}
                    title={t('stats.summaries')}
                    value={stats.totalSummaries}
                    iconColor="text-purple-600 dark:text-purple-400"
                    bgColor="bg-purple-50 dark:bg-purple-900/20"
                  />
                </div>
              </section>

              {/* Desempenho em Quiz */}
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  {t('stats.quizPerformance')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Taxa de Acerto */}
                  <div className="bg-background rounded-2xl p-6 border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-foreground">{t('stats.accuracy')}</h4>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                        {stats.quizAccuracy}%
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{t('stats.progress')}</span>
                          <span className="font-medium text-foreground">{stats.quizAccuracy}%</span>
                        </div>
                        <div className="w-full bg-border rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${stats.quizAccuracy}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">
                        {t('stats.attempts', { count: stats.totalQuizAttempts })}
                      </p>
                    </div>
                  </div>

                  {/* Distribuição por Dificuldade */}
                  <div className="bg-background rounded-2xl p-6 border border-border">
                    <h4 className="font-semibold text-foreground mb-4">{t('stats.questionsByDifficulty')}</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-sm text-muted-foreground">{t('stats.easy')}</span>
                        </div>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                          {stats.quizzesByDifficulty.fácil}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                          <span className="text-sm text-muted-foreground">{t('stats.medium')}</span>
                        </div>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
                          {stats.quizzesByDifficulty.médio}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-sm text-muted-foreground">{t('stats.hard')}</span>
                        </div>
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                          {stats.quizzesByDifficulty.difícil}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Flashcards */}
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-red-600" />
                  {t('stats.flashcards')}
                </h3>
                <div className="bg-background rounded-2xl p-6 border border-border">
                  <h4 className="font-semibold text-foreground mb-4">{t('stats.flashcardsDistribution')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-green-50 rounded-xl dark:bg-green-900/20">
                      <p className="text-3xl font-bold text-green-700 mb-1 dark:text-green-400">{stats.flashcardsByDifficulty.fácil}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.easy')}</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-xl dark:bg-yellow-900/20">
                      <p className="text-3xl font-bold text-yellow-700 mb-1 dark:text-yellow-400">{stats.flashcardsByDifficulty.médio}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.medium')}</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-xl dark:bg-red-900/20">
                      <p className="text-3xl font-bold text-red-700 mb-1 dark:text-red-400">{stats.flashcardsByDifficulty.difícil}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.hard')}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dificuldades */}
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  {t('stats.identifiedDifficulties')}
                </h3>
                <div className="bg-background rounded-2xl p-6 border border-border">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4">
                      <p className="text-3xl font-bold text-orange-700 mb-1 dark:text-orange-400">{stats.totalDifficulties}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-xl dark:bg-green-900/20">
                      <p className="text-2xl font-bold text-green-700 mb-1 dark:text-green-400">{stats.difficultiesByLevel.baixa}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.low')}</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-xl dark:bg-yellow-900/20">
                      <p className="text-2xl font-bold text-yellow-700 mb-1 dark:text-yellow-400">{stats.difficultiesByLevel.média}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.medium')}</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-xl dark:bg-red-900/20">
                      <p className="text-2xl font-bold text-red-700 mb-1 dark:text-red-400">{stats.difficultiesByLevel.alta}</p>
                      <p className="text-sm text-muted-foreground">{t('stats.high')}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
