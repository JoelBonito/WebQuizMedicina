import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Sparkles, Play, Download, RotateCw, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number;
  difficulty: "easy" | "medium" | "hard";
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
  mastered: boolean;
}

interface Summary {
  id: string;
  title: string;
  content: string;
  source: string;
}

const mockQuizzes: QuizQuestion[] = [
  {
    id: "q1",
    question: "O que afirma o Princípio da Incerteza de Heisenberg?",
    options: [
      "A posição e o momento de uma partícula podem ser determinados simultaneamente com precisão infinita",
      "É impossível determinar simultaneamente a posição e o momento de uma partícula com precisão absoluta",
      "Todas as partículas têm comportamento determinístico",
      "A luz sempre se comporta como onda",
    ],
    correct: 1,
    difficulty: "medium",
  },
  {
    id: "q2",
    question: "Qual é a equação fundamental da mecânica quântica?",
    options: [
      "E = mc²",
      "F = ma",
      "Equação de Schrödinger",
      "Lei de Newton",
    ],
    correct: 2,
    difficulty: "easy",
  },
];

const mockFlashcards: Flashcard[] = [
  {
    id: "f1",
    front: "O que é a função de onda (ψ)?",
    back: "É uma descrição matemática do estado quântico de um sistema. O quadrado de seu módulo fornece a probabilidade de encontrar uma partícula em determinada posição.",
    mastered: false,
  },
  {
    id: "f2",
    front: "Defina: Superposição Quântica",
    back: "É o princípio de que um sistema quântico pode existir simultaneamente em múltiplos estados até que seja medido ou observado.",
    mastered: true,
  },
];

const mockSummaries: Summary[] = [
  {
    id: "s1",
    title: "Fundamentos da Mecânica Quântica",
    content: "A mecânica quântica é a teoria fundamental que descreve a natureza no nível atômico e subatômico. Diferentemente da física clássica, ela introduz conceitos como quantização de energia, dualidade onda-partícula e princípio da incerteza...",
    source: "Mecânica Quântica - Capítulo 1.pdf",
  },
  {
    id: "s2",
    title: "Estrutura Atômica e Números Quânticos",
    content: "A estrutura eletrônica dos átomos é descrita por quatro números quânticos: principal (n), azimutal (l), magnético (m) e de spin (s). Cada conjunto único define um orbital específico...",
    source: "Aula sobre Átomos.mp3",
  },
];

export function ContentPanel() {
  const [activeTab, setActiveTab] = useState("quiz");

  return (
    <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="glass-dark border border-gray-200 p-1 mb-4 rounded-2xl h-auto">
          <TabsTrigger
            value="quiz"
            className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
          >
            Quiz
          </TabsTrigger>
          <TabsTrigger
            value="flashcards"
            className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
          >
            Flashcards
          </TabsTrigger>
          <TabsTrigger
            value="summaries"
            className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 px-6"
          >
            Resumos
          </TabsTrigger>
        </TabsList>

        {/* Quiz Tab */}
        <TabsContent value="quiz" className="flex-1 overflow-auto space-y-4 pr-2">
          {/* Stats */}
          <div className="glass-dark rounded-2xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-700">Progresso do Quiz</span>
              <span className="text-sm text-purple-600">8/12 questões</span>
            </div>
            <Progress value={66} className="h-2" />
            <div className="flex gap-2 mt-3">
              <Badge className="rounded-lg bg-green-50 text-green-700 border-green-200">
                ✓ 6 Corretas
              </Badge>
              <Badge className="rounded-lg bg-red-50 text-red-700 border-red-200">
                ✗ 2 Erradas
              </Badge>
            </div>
          </div>

          {/* Quiz Questions */}
          {mockQuizzes.map((quiz, index) => (
            <motion.div
              key={quiz.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
            >
              <div className="flex items-start justify-between mb-4">
                <Badge
                  className={`rounded-lg ${
                    quiz.difficulty === "easy"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : quiz.difficulty === "medium"
                      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {quiz.difficulty === "easy" ? "Fácil" : quiz.difficulty === "medium" ? "Média" : "Difícil"}
                </Badge>
                <span className="text-sm text-gray-500">Questão {index + 1}</span>
              </div>
              <h4 className="text-gray-900 mb-4">{quiz.question}</h4>
              <div className="space-y-2">
                {quiz.options.map((option, i) => (
                  <button
                    key={i}
                    className="w-full text-left p-3 rounded-xl glass border border-gray-200 hover:border-purple-400 hover:bg-purple-50/30 transition-all duration-300 text-sm text-gray-800"
                  >
                    {String.fromCharCode(65 + i)}. {option}
                  </button>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300">
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Mais Questões
            </Button>
            <Button
              variant="outline"
              className="rounded-xl glass border-gray-300 hover:bg-gray-100"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </TabsContent>

        {/* Flashcards Tab */}
        <TabsContent value="flashcards" className="flex-1 overflow-auto space-y-4 pr-2">
          <div className="glass-dark rounded-2xl p-4 flex items-center justify-between border border-gray-200">
            <div>
              <p className="text-sm text-gray-700">Domínio dos Cards</p>
              <p className="text-gray-900 mt-1">12 / 24 cards</p>
            </div>
            <Button
              className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar Estudo
            </Button>
          </div>

          {mockFlashcards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
            >
              <div className="flex items-start justify-between mb-3">
                <Badge
                  className={`rounded-lg ${
                    card.mastered
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-gray-100 text-gray-700 border-gray-300"
                  }`}
                >
                  {card.mastered ? "✓ Dominado" : "Em Progresso"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-gray-100"
                >
                  <RotateCw className="w-4 h-4 text-gray-600" />
                </Button>
              </div>
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-1">FRENTE</p>
                <p className="text-gray-900">{card.front}</p>
              </div>
              <div className="pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-600 mb-1">VERSO</p>
                <p className="text-sm text-gray-700">{card.back}</p>
              </div>
            </motion.div>
          ))}

          <Button className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg">
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Mais Flashcards
          </Button>
        </TabsContent>

        {/* Summaries Tab */}
        <TabsContent value="summaries" className="flex-1 overflow-auto space-y-4 pr-2">
          {mockSummaries.map((summary, index) => (
            <motion.div
              key={summary.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-hover glass-dark rounded-2xl p-6 border border-gray-200"
            >
              <h4 className="text-gray-900 mb-2">{summary.title}</h4>
              <p className="text-sm text-gray-700 mb-4 line-clamp-3">{summary.content}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="rounded-lg text-xs text-gray-600 border-gray-300">
                  {summary.source}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg hover:bg-gray-100 text-purple-600"
                >
                  Ler Mais
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          ))}

          <Button className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg">
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Novos Resumos
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}