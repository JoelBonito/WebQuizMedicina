import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  HelpCircle,
  Layers,
  FileText,
  Loader2,
  BookOpen,
  MoreVertical,
  Settings,
  Sparkles,
  X,
  TrendingUp,
  Trash2,
  Edit
} from "lucide-react";
import { motion } from "motion/react";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { useSummaries } from "../hooks/useSummaries";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { QuizSession } from "./QuizSession";
import { FlashcardSession } from "./FlashcardSession";
import { SummaryViewer } from "./SummaryViewer";
import { Badge } from "./ui/badge";
import { DifficultiesPanel } from "./DifficultiesPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

interface ContentPanelProps {
  projectId: string | null;
  selectedSourceIds?: string[];
  isFullscreenMode?: boolean;
}

interface GeneratedContent {
  id: string;
  type: 'quiz' | 'flashcards' | 'summary';
  title: string;
  sourceCount: number;
  createdAt: Date;
  difficulty?: 'fácil' | 'médio' | 'difícil' | 'misto';
}

const ACTION_CARDS = [
  {
    id: 'quiz',
    title: 'Teste',
    icon: HelpCircle,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    iconColor: 'text-blue-600',
  },
  {
    id: 'flashcards',
    title: 'Cartões de Estudo',
    icon: Layers,
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    iconColor: 'text-red-600',
  },
  {
    id: 'summary',
    title: 'Resumo',
    icon: FileText,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    iconColor: 'text-purple-600',
  },
];

const getContentStyle = (type: string) => {
  switch(type) {
    case 'quiz':
      return {
        icon: HelpCircle,
        bgColor: 'bg-blue-50',
        iconColor: 'text-blue-600',
        label: 'Quiz'
      };
    case 'flashcards':
      return {
        icon: Layers,
        bgColor: 'bg-red-50',
        iconColor: 'text-red-600',
        label: 'Flashcards'
      };
    case 'summary':
      return {
        icon: FileText,
        bgColor: 'bg-purple-50',
        iconColor: 'text-purple-600',
        label: 'Resumo'
      };
    default:
      return {
        icon: FileText,
        bgColor: 'bg-gray-50',
        iconColor: 'text-gray-600',
        label: 'Conteúdo'
      };
  }
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min atrás`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
  return `${Math.floor(seconds / 86400)}d atrás`;
};

export function ContentPanel({ projectId, selectedSourceIds = [], isFullscreenMode = false }: ContentPanelProps) {
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<any>(null);
  const [quizSessionOpen, setQuizSessionOpen] = useState(false);
  const [flashcardSessionOpen, setFlashcardSessionOpen] = useState(false);
  const [difficultiesOpen, setDifficultiesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQuizSession, setSelectedQuizSession] = useState<string | null>(null);
  const [selectedFlashcardSession, setSelectedFlashcardSession] = useState<string | null>(null);
  const [quizDifficulty, setQuizDifficulty] = useState<'todos' | 'fácil' | 'médio' | 'difícil'>('todos');
  const [flashcardDifficulty, setFlashcardDifficulty] = useState<'todos' | 'fácil' | 'médio' | 'difícil'>('todos');

  const handleAskChat = (selectedText: string) => {
    localStorage.setItem('chat_question', `Explique melhor: "${selectedText}"`);
    window.dispatchEvent(new CustomEvent('ask-chat', { detail: selectedText }));
    setSelectedSummary(null);
    toast.success("Pergunta enviada para o Chat! Alterne para a aba Chat.");
  };

  const { questions, loading: loadingQuiz, generating: generatingQuiz, generateQuiz, refetch: fetchQuestions } = useQuestions(projectId);
  const { flashcards, loading: loadingFlashcards, generating: generatingFlashcards, generateFlashcards, refetch: fetchFlashcards } = useFlashcards(projectId);
  const { summaries, loading: loadingSummaries, generating: generatingSummary, generateSummary, deleteSummary } = useSummaries(projectId);

  // Helper function to determine difficulty level
  const getDifficultyLevel = (items: { dificuldade: string }[]): 'fácil' | 'médio' | 'difícil' | 'misto' => {
    if (items.length === 0) return 'médio';

    const difficulties = [...new Set(items.map(item => item.dificuldade))];

    if (difficulties.length === 1) {
      const diff = difficulties[0];
      if (diff === 'fácil' || diff === 'médio' || diff === 'difícil') {
        return diff;
      }
    }

    return 'misto';
  };

  // Update generated content list when data changes
  useEffect(() => {
    if (!projectId) return;

    const newContent: GeneratedContent[] = [];

    // Group questions by session_id
    const questionsBySession = questions.reduce((acc, question) => {
      const sessionId = question.session_id || 'no-session';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(question);
      return acc;
    }, {} as Record<string, typeof questions>);

    // Add each quiz session as a separate entry
    Object.entries(questionsBySession).forEach(([sessionId, sessionQuestions]) => {
      const mostRecent = sessionQuestions[0];
      const difficulty = getDifficultyLevel(sessionQuestions);
      newContent.push({
        id: `quiz-${sessionId}`,
        type: 'quiz',
        title: `Quiz - ${sessionQuestions.length} questões`,
        sourceCount: selectedSourceIds.length,
        createdAt: new Date(mostRecent.created_at || new Date()),
        difficulty,
      });
    });

    // Group flashcards by session_id
    const flashcardsBySession = flashcards.reduce((acc, flashcard) => {
      const sessionId = flashcard.session_id || 'no-session';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(flashcard);
      return acc;
    }, {} as Record<string, typeof flashcards>);

    // Add each flashcard session as a separate entry
    Object.entries(flashcardsBySession).forEach(([sessionId, sessionFlashcards]) => {
      const mostRecent = sessionFlashcards[0];
      const difficulty = getDifficultyLevel(sessionFlashcards);
      newContent.push({
        id: `flashcards-${sessionId}`,
        type: 'flashcards',
        title: `Flashcards - ${sessionFlashcards.length} cards`,
        sourceCount: selectedSourceIds.length,
        createdAt: new Date(mostRecent.created_at || new Date()),
        difficulty,
      });
    });

    // Add summaries
    summaries.forEach(summary => {
      newContent.push({
        id: summary.id,
        type: 'summary',
        title: summary.titulo,
        sourceCount: summary.source_ids?.length || 0,
        createdAt: new Date(summary.created_at || new Date()),
      });
    });

    // Sort by date (most recent first)
    newContent.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    setGeneratedContent(newContent);
  }, [questions, flashcards, summaries, projectId, selectedSourceIds]);

  const handleGenerateContent = async (type: 'quiz' | 'flashcards' | 'summary') => {
    if (selectedSourceIds.length === 0) {
      toast.error("Selecione pelo menos uma fonte para gerar conteúdo");
      return;
    }

    try {
      switch(type) {
        case 'quiz':
          const quizDiff = quizDifficulty !== 'todos' ? quizDifficulty : undefined;
          const quizResult = await generateQuiz(selectedSourceIds, 20, quizDiff);
          toast.success(quizDiff
            ? `Quiz gerado com sucesso (nível ${quizDiff})!`
            : "Quiz gerado com sucesso!"
          );

          // Show warning if relevance is low
          if (quizResult?.warning) {
            toast.warning(quizResult.warning.message, {
              description: quizResult.warning.recommendation,
              duration: 7000,
            });
          }
          break;
        case 'flashcards':
          const flashcardDiff = flashcardDifficulty !== 'todos' ? flashcardDifficulty : undefined;
          await generateFlashcards(selectedSourceIds, 20, flashcardDiff);
          toast.success(flashcardDiff
            ? `Flashcards gerados com sucesso (nível ${flashcardDiff})!`
            : "Flashcards gerados com sucesso!"
          );
          break;
        case 'summary':
          await generateSummary(selectedSourceIds);
          toast.success("Resumo gerado com sucesso!");
          break;
      }
    } catch (error) {
      toast.error("Erro ao gerar conteúdo. Verifique se há fontes disponíveis.");
      console.error(error);
    }
  };

  const handleOpenContent = (content: GeneratedContent) => {
    switch(content.type) {
      case 'quiz':
        // Extract session_id from content.id (format: "quiz-{sessionId}")
        const quizSessionId = content.id.replace('quiz-', '');
        setSelectedQuizSession(quizSessionId);
        setQuizSessionOpen(true);
        break;
      case 'flashcards':
        // Extract session_id from content.id (format: "flashcards-{sessionId}")
        const flashcardSessionId = content.id.replace('flashcards-', '');
        setSelectedFlashcardSession(flashcardSessionId);
        setFlashcardSessionOpen(true);
        break;
      case 'summary':
        const summary = summaries.find(s => s.id === content.id);
        if (summary) {
          setSelectedSummary(summary);
        }
        break;
    }
  };

  const handleDeleteSummary = async (id: string) => {
    try {
      await deleteSummary(id);
      toast.success("Resumo removido");
    } catch (error) {
      toast.error("Erro ao remover resumo");
    }
  };

  const handleDeleteQuiz = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;

      // Refetch questions to update UI
      await fetchQuestions();
      toast.success("Quiz removido");
    } catch (error) {
      console.error('Error deleting quiz:', error);
      toast.error("Erro ao remover quiz");
    }
  };

  const handleDeleteFlashcards = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('flashcards')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;

      // Refetch flashcards to update UI
      await fetchFlashcards();
      toast.success("Flashcards removidos");
    } catch (error) {
      console.error('Error deleting flashcards:', error);
      toast.error("Erro ao remover flashcards");
    }
  };

  const handleDeleteContent = async (content: GeneratedContent) => {
    if (content.type === 'summary') {
      await handleDeleteSummary(content.id);
    } else if (content.type === 'quiz') {
      const sessionId = content.id.replace('quiz-', '');
      await handleDeleteQuiz(sessionId);
    } else if (content.type === 'flashcards') {
      const sessionId = content.id.replace('flashcards-', '');
      await handleDeleteFlashcards(sessionId);
    }
  };

  if (!projectId) {
    return (
      <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200 overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Selecione um projeto para ver o conteúdo</p>
          </div>
        </div>
      </div>
    );
  }

  const loading = loadingQuiz || loadingFlashcards || loadingSummaries;

  return (
    <>
      <div className={`h-full w-full flex flex-col overflow-hidden ${
        isFullscreenMode
          ? "bg-gray-50/50"
          : "bg-gray-50/50 rounded-3xl border border-gray-200"
      }`}>
        {/* Banda colorida do topo */}
        <div className="h-1.5 w-full bg-gradient-to-r from-green-500 to-emerald-500" />

        <div className="flex-1 overflow-hidden p-6 flex flex-col">
          {/* Header - Oculto em fullscreen para evitar duplicidade */}
          {!isFullscreenMode && (
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold text-gray-900">Estudo</h1>
              <button
                onClick={() => setIsFullscreen(true)}
                className="hidden md:flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Expandir"
              >
                <span className="material-symbols-outlined text-[20px]">expand_content</span>
              </button>
            </div>
          )}

        {/* Grid de Botões de Ação */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {ACTION_CARDS.map(card => {
            const CardIcon = card.icon;
            const showSettings = card.id === 'quiz' || card.id === 'flashcards';
            const currentDifficulty = card.id === 'quiz' ? quizDifficulty : flashcardDifficulty;
            const setDifficulty = card.id === 'quiz' ? setQuizDifficulty : setFlashcardDifficulty;

            // Each button is disabled only when its own content is generating
            const isButtonGenerating =
              (card.id === 'quiz' && generatingQuiz) ||
              (card.id === 'flashcards' && generatingFlashcards) ||
              (card.id === 'summary' && generatingSummary);

            return (
              <div key={card.id} className="relative">
                <button
                  onClick={() => handleGenerateContent(card.id as 'quiz' | 'flashcards' | 'summary')}
                  disabled={isButtonGenerating}
                  className={`
                    ${card.bgColor}
                    relative p-5 rounded-2xl w-full
                    flex flex-col items-start gap-2
                    transition-all duration-200
                    hover:shadow-md hover:scale-[1.02]
                    active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    group
                  `}
                >
                  {/* Ícone */}
                  <CardIcon className={`w-7 h-7 ${card.iconColor}`} />

                  {/* Título */}
                  <span className={`font-semibold text-base ${card.textColor}`}>
                    {card.title}
                  </span>

                  {/* Badge de dificuldade selecionada */}
                  {showSettings && currentDifficulty !== 'todos' && (
                    <Badge className="text-xs px-2.5 py-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg font-medium shadow-sm">
                      {currentDifficulty}
                    </Badge>
                  )}

                  {/* Loading indicator - only for this specific button */}
                  {isButtonGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                    </div>
                  )}
                </button>

                {/* Botão de configuração (apenas para Quiz e Flashcards) */}
                {showSettings && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-3 right-3 p-2 rounded-full bg-white/80 hover:bg-white/95 shadow-sm transition-all z-10"
                      >
                        <Settings className="w-4 h-4 text-gray-600" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Nível de Dificuldade</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={currentDifficulty}
                        onValueChange={(value) => setDifficulty(value as typeof currentDifficulty)}
                      >
                        <DropdownMenuRadioItem value="todos">
                          Todos os níveis
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="fácil">
                          Fácil
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="médio">
                          Médio
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="difícil">
                          Difícil
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>

        {/* Botão Análise das Dificuldades - Centralizado */}
        <div className="flex justify-center mb-4">
          <Button
            onClick={() => setDifficultiesOpen(true)}
            size="sm"
            variant="outline"
            className="rounded-xl flex items-center gap-2 bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:text-orange-800"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Análise das Dificuldades</span>
          </Button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 my-4" />

        {/* Lista de Conteúdo Gerado */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
            </div>
          ) : generatedContent.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="font-medium mb-1">Nenhum conteúdo gerado ainda</p>
              <p className="text-sm">Clique em um dos botões acima para começar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {generatedContent.map((content, index) => {
                const style = getContentStyle(content.type);
                const Icon = style.icon;

                return (
                  <motion.div
                    key={content.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleOpenContent(content)}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    {/* Ícone */}
                    <div className={`w-12 h-12 rounded-xl ${style.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${style.iconColor}`} />
                    </div>

                    {/* Informações */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 truncate">
                          {content.title}
                        </h3>
                        {content.difficulty && (
                          <Badge className="text-xs px-2.5 py-1 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 text-blue-700 rounded-lg font-medium shadow-sm shrink-0">
                            {content.difficulty}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {style.label} · {content.sourceCount} fontes · {formatTimeAgo(content.createdAt)}
                      </p>
                    </div>

                    {/* Menu de ações */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-opacity"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-600" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {/* TODO: Implementar renomear para quiz/flashcards (requer migration) */}
                        {content.type === 'summary' && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                // TODO: Implementar renomear summary
                                toast.info("Funcionalidade de renomear em desenvolvimento");
                              }}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Renomear
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            handleDeleteContent(content);
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Summary Dialog */}
      <Dialog open={!!selectedSummary} onOpenChange={() => setSelectedSummary(null)}>
        <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
          <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <DialogTitle className="text-2xl font-bold text-gray-900">
                {selectedSummary?.titulo}
              </DialogTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedSummary(null)}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <DialogDescription className="sr-only">
              Visualização completa do resumo. Selecione texto para enviar perguntas ao chat.
            </DialogDescription>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
              {selectedSummary?.topicos && selectedSummary.topicos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedSummary.topicos.map((topico: string, i: number) => (
                    <Badge key={i} variant="outline" className="rounded-lg">
                      {topico}
                    </Badge>
                  ))}
                </div>
              )}
              <SummaryViewer
                html={selectedSummary?.conteudo_html || ""}
                onAskChat={handleAskChat}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quiz Session Modal */}
      <QuizSession
        questions={questions.filter(q => q.session_id === selectedQuizSession)}
        projectId={projectId || ''}
        open={quizSessionOpen}
        onClose={() => {
          setQuizSessionOpen(false);
          setSelectedQuizSession(null);
        }}
      />

      {/* Flashcard Session Modal */}
      <FlashcardSession
        flashcards={flashcards.filter(f => f.session_id === selectedFlashcardSession)}
        projectId={projectId || ''}
        open={flashcardSessionOpen}
        onClose={() => {
          setFlashcardSessionOpen(false);
          setSelectedFlashcardSession(null);
        }}
      />

      {/* Difficulties Dialog - 95% da tela */}
      <Dialog open={difficultiesOpen} onOpenChange={setDifficultiesOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] !p-0 rounded-2xl overflow-hidden">
          <div className="h-full w-full flex flex-col bg-gray-50">
            <div className="flex items-center justify-between p-6 border-b bg-white flex-shrink-0">
              <h2 className="text-2xl font-bold text-gray-900">Análise das Dificuldades</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDifficultiesOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <DialogTitle className="sr-only">Análise das Dificuldades</DialogTitle>
            <DialogDescription className="sr-only">
              Visualize e gerencie suas dificuldades de aprendizado identificadas durante quizzes e flashcards.
            </DialogDescription>
            <div className="flex-1 min-h-0 overflow-auto">
              <DifficultiesPanel projectId={projectId} isFullscreenMode={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded Dialog - 95% da tela */}
      {!isFullscreenMode && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] !p-0 rounded-2xl overflow-hidden">
            <div className="h-full w-full flex flex-col bg-gray-50">
              <div className="flex items-center justify-between p-6 border-b bg-white flex-shrink-0">
                <h2 className="text-2xl font-bold text-gray-900">Estudo</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <ContentPanel projectId={projectId} selectedSourceIds={selectedSourceIds} isFullscreenMode={true} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
