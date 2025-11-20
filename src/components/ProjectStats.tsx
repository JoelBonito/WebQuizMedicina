import { X, TrendingUp, BookOpen, HelpCircle, Layers, FileText, AlertTriangle, Award, Target, BarChart3 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion } from "motion/react";
import { useProjectStats } from "../hooks/useProjectStats";
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
    className={`${bgColor} rounded-2xl p-6 border border-gray-200`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-12 h-12 rounded-xl ${iconColor} bg-opacity-10 flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
    </div>
    <div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  </motion.div>
);

export function ProjectStats({ projectId, projectName, open, onClose }: ProjectStatsProps) {
  const { stats, loading } = useProjectStats(projectId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
        <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-gray-50">
          {/* Header */}
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  Estatísticas - {projectName}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-1">
                  Visão geral do seu progresso e desempenho
                </DialogDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-10 w-10 p-0 rounded-xl hover:bg-gray-100"
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#0891B2]" />
                  Visão Geral
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    icon={BookOpen}
                    title="Fontes"
                    value={stats.totalSources}
                    subtitle={`${stats.readySources} prontas`}
                    iconColor="text-[#0891B2]"
                    bgColor="bg-[#F0F9FF]"
                  />
                  <StatCard
                    icon={HelpCircle}
                    title="Questões"
                    value={stats.totalQuestions}
                    subtitle={`${stats.totalQuizzes} quizzes`}
                    iconColor="text-blue-600"
                    bgColor="bg-blue-50"
                  />
                  <StatCard
                    icon={Layers}
                    title="Flashcards"
                    value={stats.totalFlashcards}
                    iconColor="text-red-600"
                    bgColor="bg-red-50"
                  />
                  <StatCard
                    icon={FileText}
                    title="Resumos"
                    value={stats.totalSummaries}
                    iconColor="text-purple-600"
                    bgColor="bg-purple-50"
                  />
                </div>
              </section>

              {/* Desempenho em Quiz */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  Desempenho em Quizzes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Taxa de Acerto */}
                  <div className="bg-white rounded-2xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Taxa de Acerto</h4>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {stats.quizAccuracy}%
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Progresso</span>
                          <span className="font-medium text-gray-900">{stats.quizAccuracy}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${stats.quizAccuracy}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">
                        {stats.totalQuizAttempts} tentativas realizadas
                      </p>
                    </div>
                  </div>

                  {/* Distribuição por Dificuldade */}
                  <div className="bg-white rounded-2xl p-6 border border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-4">Questões por Dificuldade</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-sm text-gray-700">Fácil</span>
                        </div>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {stats.quizzesByDifficulty.fácil}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                          <span className="text-sm text-gray-700">Médio</span>
                        </div>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          {stats.quizzesByDifficulty.médio}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-sm text-gray-700">Difícil</span>
                        </div>
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          {stats.quizzesByDifficulty.difícil}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Flashcards */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-red-600" />
                  Flashcards
                </h3>
                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-4">Distribuição por Dificuldade</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-green-50 rounded-xl">
                      <p className="text-3xl font-bold text-green-700 mb-1">{stats.flashcardsByDifficulty.fácil}</p>
                      <p className="text-sm text-gray-600">Fácil</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-xl">
                      <p className="text-3xl font-bold text-yellow-700 mb-1">{stats.flashcardsByDifficulty.médio}</p>
                      <p className="text-sm text-gray-600">Médio</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-xl">
                      <p className="text-3xl font-bold text-red-700 mb-1">{stats.flashcardsByDifficulty.difícil}</p>
                      <p className="text-sm text-gray-600">Difícil</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dificuldades */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Dificuldades Identificadas
                </h3>
                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4">
                      <p className="text-3xl font-bold text-orange-700 mb-1">{stats.totalDifficulties}</p>
                      <p className="text-sm text-gray-600">Total</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-xl">
                      <p className="text-2xl font-bold text-green-700 mb-1">{stats.difficultiesByLevel.baixa}</p>
                      <p className="text-sm text-gray-600">Baixa</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-xl">
                      <p className="text-2xl font-bold text-yellow-700 mb-1">{stats.difficultiesByLevel.média}</p>
                      <p className="text-sm text-gray-600">Média</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-xl">
                      <p className="text-2xl font-bold text-red-700 mb-1">{stats.difficultiesByLevel.alta}</p>
                      <p className="text-sm text-gray-600">Alta</p>
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
