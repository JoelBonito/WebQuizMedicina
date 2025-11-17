import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Sparkles, Loader2, ChevronRight, BookOpen, Trash2, Play } from "lucide-react";
import { motion } from "motion/react";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { useSummaries } from "../hooks/useSummaries";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { QuizSession } from "./QuizSession";
import { FlashcardSession } from "./FlashcardSession";
import { SummaryViewer } from "./SummaryViewer";

interface ContentPanelProps {
  projectId: string | null;
}

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

export function ContentPanel({ projectId }: ContentPanelProps) {
  const [activeTab, setActiveTab] = useState("quiz");
  const [selectedSummary, setSelectedSummary] = useState<any>(null);
  const [quizSessionOpen, setQuizSessionOpen] = useState(false);
  const [flashcardSessionOpen, setFlashcardSessionOpen] = useState(false);

  const handleAskChat = (selectedText: string) => {
    // Save selected text to localStorage for ChatPanel to pick up
    localStorage.setItem('chat_question', `Explique melhor: "${selectedText}"`);
    // Trigger custom event to notify ChatPanel
    window.dispatchEvent(new CustomEvent('ask-chat', { detail: selectedText }));
    // Close summary dialog
    setSelectedSummary(null);
    // Show toast
    toast.success("Pergunta enviada para o Chat! Alterne para a aba Chat.");
  };

  const { questions, loading: loadingQuiz, generating: generatingQuiz, generateQuiz } = useQuestions(projectId);
  const { flashcards, loading: loadingFlashcards, generating: generatingFlashcards, generateFlashcards } = useFlashcards(projectId);
  const { summaries, loading: loadingSummaries, generating: generatingSummary, generateSummary, deleteSummary } = useSummaries(projectId);

  const handleGenerateQuiz = async () => {
    try {
      await generateQuiz(undefined, 15);
      toast.success("Quiz gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar quiz. Verifique se há fontes disponíveis.");
    }
  };

  const handleGenerateFlashcards = async () => {
    try {
      await generateFlashcards(undefined, 20);
      toast.success("Flashcards gerados com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar flashcards. Verifique se há fontes disponíveis.");
    }
  };

  const handleGenerateSummary = async () => {
    try {
      await generateSummary();
      toast.success("Resumo gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar resumo. Verifique se há fontes disponíveis.");
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

  return (
    <>
      <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="glass-dark border border-gray-200 p-1 mb-4 rounded-2xl h-auto">
            <TabsTrigger
              value="quiz"
              className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
            >
              Quiz ({questions.length})
            </TabsTrigger>
            <TabsTrigger
              value="flashcards"
              className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
            >
              Flashcards ({flashcards.length})
            </TabsTrigger>
            <TabsTrigger
              value="summaries"
              className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
            >
              Resumos ({summaries.length})
            </TabsTrigger>
          </TabsList>

          {/* Quiz Tab */}
          <TabsContent value="quiz" className="flex-1 overflow-auto space-y-4 pr-2">
            {loadingQuiz ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : questions.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum quiz ainda
                </h3>
                <p className="text-gray-600 mb-6">
                  Gere perguntas a partir das suas fontes com IA
                </p>
                <Button
                  onClick={handleGenerateQuiz}
                  disabled={generatingQuiz}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  {generatingQuiz ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingQuiz ? "Gerando..." : "Gerar Quiz"}
                </Button>
              </div>
            ) : (
              <>
                {/* Start Quiz Button */}
                <div className="glass-dark rounded-2xl p-6 border border-gray-200 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-gray-900 font-semibold mb-1">
                        Quiz Pronto!
                      </h4>
                      <p className="text-sm text-gray-600">
                        {questions.length} questões disponíveis para testar seu conhecimento
                      </p>
                    </div>
                    <Button
                      onClick={() => setQuizSessionOpen(true)}
                      className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar Quiz
                    </Button>
                  </div>
                </div>

                {questions.map((question, index) => (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <Badge className={`rounded-lg ${getDifficultyColor(question.dificuldade)}`}>
                        {question.dificuldade}
                      </Badge>
                      <span className="text-sm text-gray-500">Questão {index + 1}</span>
                    </div>
                    <h4 className="text-gray-900 mb-4">{question.pergunta}</h4>
                    <div className="space-y-2">
                      {question.opcoes.map((option, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl glass border border-gray-200 text-sm text-gray-800"
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                    {question.topico && (
                      <Badge variant="outline" className="mt-4 rounded-lg text-xs">
                        {question.topico}
                      </Badge>
                    )}
                  </motion.div>
                ))}

                <Button
                  onClick={handleGenerateQuiz}
                  disabled={generatingQuiz}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
                >
                  {generatingQuiz ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingQuiz ? "Gerando..." : "Gerar Mais Questões"}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Flashcards Tab */}
          <TabsContent value="flashcards" className="flex-1 overflow-auto space-y-4 pr-2">
            {loadingFlashcards ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : flashcards.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum flashcard ainda
                </h3>
                <p className="text-gray-600 mb-6">
                  Gere flashcards a partir das suas fontes com IA
                </p>
                <Button
                  onClick={handleGenerateFlashcards}
                  disabled={generatingFlashcards}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  {generatingFlashcards ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingFlashcards ? "Gerando..." : "Gerar Flashcards"}
                </Button>
              </div>
            ) : (
              <>
                {/* Start Flashcards Button */}
                <div className="glass-dark rounded-2xl p-6 border border-gray-200 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-gray-900 font-semibold mb-1">
                        Flashcards Prontos!
                      </h4>
                      <p className="text-sm text-gray-600">
                        {flashcards.length} flashcards disponíveis para revisar com repetição espaçada
                      </p>
                    </div>
                    <Button
                      onClick={() => setFlashcardSessionOpen(true)}
                      className="rounded-xl bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white shadow-lg"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar Flashcards
                    </Button>
                  </div>
                </div>

                {flashcards.map((card, index) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Badge className={`rounded-lg ${getDifficultyColor(card.dificuldade)}`}>
                        {card.dificuldade}
                      </Badge>
                      {card.topico && (
                        <Badge variant="outline" className="rounded-lg text-xs">
                          {card.topico}
                        </Badge>
                      )}
                    </div>
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 mb-1">FRENTE</p>
                      <p className="text-gray-900">{card.frente}</p>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">VERSO</p>
                      <p className="text-sm text-gray-700">{card.verso}</p>
                    </div>
                  </motion.div>
                ))}

                <Button
                  onClick={handleGenerateFlashcards}
                  disabled={generatingFlashcards}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
                >
                  {generatingFlashcards ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingFlashcards ? "Gerando..." : "Gerar Mais Flashcards"}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Summaries Tab */}
          <TabsContent value="summaries" className="flex-1 overflow-auto space-y-4 pr-2">
            {loadingSummaries ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-300" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum resumo ainda
                </h3>
                <p className="text-gray-600 mb-6">
                  Gere resumos estruturados das suas fontes com IA
                </p>
                <Button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  {generatingSummary ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingSummary ? "Gerando..." : "Gerar Resumo"}
                </Button>
              </div>
            ) : (
              <>
                {summaries.map((summary, index) => (
                  <motion.div
                    key={summary.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="text-gray-900 flex-1">{summary.titulo}</h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-red-50"
                        onClick={() => handleDeleteSummary(summary.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                    <div className="mb-4">
                      {summary.topicos && summary.topicos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {summary.topicos.map((topico, i) => (
                            <Badge key={i} variant="outline" className="rounded-lg text-xs">
                              {topico}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div
                        className="text-sm text-gray-700 line-clamp-3"
                        dangerouslySetInnerHTML={{
                          __html: summary.conteudo_html.substring(0, 200) + "...",
                        }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg hover:bg-gray-100 text-purple-600"
                      onClick={() => setSelectedSummary(summary)}
                    >
                      Ler Completo
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </motion.div>
                ))}

                <Button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
                >
                  {generatingSummary ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {generatingSummary ? "Gerando..." : "Gerar Novo Resumo"}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Summary Dialog */}
      <Dialog open={!!selectedSummary} onOpenChange={() => setSelectedSummary(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedSummary?.titulo}</DialogTitle>
            <DialogDescription className="sr-only">
              Visualização completa do resumo. Selecione texto para enviar perguntas ao chat.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
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
