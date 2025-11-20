import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  HelpCircle,
  Layers,
  FileText,
  Loader2,
  BookOpen,
  MoreVertical,
  Pencil,
  LayoutGrid,
  Sparkles,
  X
} from "lucide-react";
import { motion } from "motion/react";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { useSummaries } from "../hooks/useSummaries";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { QuizSession } from "./QuizSession";
import { FlashcardSession } from "./FlashcardSession";
import { SummaryViewer } from "./SummaryViewer";
import { Badge } from "./ui/badge";

interface ContentPanelProps {
  projectId: string | null;
  selectedSourceIds?: string[];
}

interface GeneratedContent {
  id: string;
  type: 'quiz' | 'flashcards' | 'summary';
  title: string;
  sourceCount: number;
  createdAt: Date;
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

export function ContentPanel({ projectId, selectedSourceIds = [] }: ContentPanelProps) {
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<any>(null);
  const [quizSessionOpen, setQuizSessionOpen] = useState(false);
  const [flashcardSessionOpen, setFlashcardSessionOpen] = useState(false);

  const handleAskChat = (selectedText: string) => {
    localStorage.setItem('chat_question', `Explique melhor: "${selectedText}"`);
    window.dispatchEvent(new CustomEvent('ask-chat', { detail: selectedText }));
    setSelectedSummary(null);
    toast.success("Pergunta enviada para o Chat! Alterne para a aba Chat.");
  };

  const { questions, loading: loadingQuiz, generating: generatingQuiz, generateQuiz } = useQuestions(projectId);
  const { flashcards, loading: loadingFlashcards, generating: generatingFlashcards, generateFlashcards } = useFlashcards(projectId);
  const { summaries, loading: loadingSummaries, generating: generatingSummary, generateSummary, deleteSummary } = useSummaries(projectId);

  // Update generated content list when data changes
  useEffect(() => {
    if (!projectId) return;

    const newContent: GeneratedContent[] = [];

    // Add quizzes
    if (questions.length > 0) {
      newContent.push({
        id: `quiz-${projectId}`,
        type: 'quiz',
        title: `Quiz - ${questions.length} questões`,
        sourceCount: selectedSourceIds.length,
        createdAt: new Date(questions[0].created_at || new Date()),
      });
    }

    // Add flashcards
    if (flashcards.length > 0) {
      newContent.push({
        id: `flashcards-${projectId}`,
        type: 'flashcards',
        title: `Flashcards - ${flashcards.length} cards`,
        sourceCount: selectedSourceIds.length,
        createdAt: new Date(flashcards[0].created_at || new Date()),
      });
    }

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

    setIsGenerating(true);

    try {
      switch(type) {
        case 'quiz':
          await generateQuiz(selectedSourceIds, 15);
          toast.success("Quiz gerado com sucesso!");
          break;
        case 'flashcards':
          await generateFlashcards(selectedSourceIds, 20);
          toast.success("Flashcards gerados com sucesso!");
          break;
        case 'summary':
          await generateSummary(selectedSourceIds);
          toast.success("Resumo gerado com sucesso!");
          break;
      }
    } catch (error) {
      toast.error("Erro ao gerar conteúdo. Verifique se há fontes disponíveis.");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenContent = (content: GeneratedContent) => {
    switch(content.type) {
      case 'quiz':
        setQuizSessionOpen(true);
        break;
      case 'flashcards':
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
  const generating = generatingQuiz || generatingFlashcards || generatingSummary;

  return (
    <>
      <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl p-6 border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Estúdio</h1>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <LayoutGrid className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Grid de Botões de Ação */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {ACTION_CARDS.map(card => {
            const CardIcon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => handleGenerateContent(card.id as 'quiz' | 'flashcards' | 'summary')}
                disabled={isGenerating || generating}
                className={`
                  ${card.bgColor}
                  relative p-5 rounded-2xl
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

                {/* Loading indicator */}
                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                  </div>
                )}

                {/* Botão de editar (canto superior direito) - aparece no hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Ação de editar configurações do card (futuro)
                  }}
                  className="absolute top-3 right-3 p-2 rounded-full bg-white/60 hover:bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-4 h-4 text-gray-600" />
                </button>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 my-4" />

        {/* Lista de Conteúdo Gerado */}
        <div className="flex-1 overflow-y-auto pr-2">
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
                      <h3 className="font-medium text-gray-900 truncate">
                        {content.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {style.label} · {content.sourceCount} fontes · {formatTimeAgo(content.createdAt)}
                      </p>
                    </div>

                    {/* Menu de ações */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (content.type === 'summary') {
                          handleDeleteSummary(content.id);
                        }
                      }}
                      className="p-2 hover:bg-gray-200 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-600" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Summary Dialog */}
      <Dialog open={!!selectedSummary} onOpenChange={() => setSelectedSummary(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {selectedSummary?.titulo}
            </DialogTitle>
            <button
              onClick={() => setSelectedSummary(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogDescription className="sr-only">
            Visualização completa do resumo. Selecione texto para enviar perguntas ao chat.
          </DialogDescription>
          <div>
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
        </DialogContent>
      </Dialog>

      {/* Quiz Session Modal */}
      <QuizSession
        questions={questions}
        projectId={projectId || ''}
        open={quizSessionOpen}
        onClose={() => setQuizSessionOpen(false)}
      />

      {/* Flashcard Session Modal */}
      <FlashcardSession
        flashcards={flashcards}
        projectId={projectId || ''}
        open={flashcardSessionOpen}
        onClose={() => setFlashcardSessionOpen(false)}
      />
    </>
  );
}
