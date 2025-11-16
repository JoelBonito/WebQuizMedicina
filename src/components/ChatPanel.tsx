import { useState } from "react";
import { Send, Sparkles, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { motion } from "motion/react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sourceReference?: string;
}

const mockMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Olá! Estou aqui para ajudar você com suas fontes carregadas. Posso responder perguntas, criar resumos ou gerar conteúdo de estudo. Como posso ajudar?",
    timestamp: "10:30",
  },
  {
    id: "2",
    role: "user",
    content: "Explique o Princípio da Incerteza de forma simples",
    timestamp: "10:32",
  },
  {
    id: "3",
    role: "assistant",
    content: "O Princípio da Incerteza de Heisenberg afirma que é impossível conhecer simultaneamente com precisão absoluta a posição e o momento (velocidade) de uma partícula. Quanto mais precisamente medimos uma dessas propriedades, menos precisamente conhecemos a outra.",
    timestamp: "10:32",
    sourceReference: "Notas - Princípio da Incerteza.txt",
  },
];

const suggestions = [
  "Gere um quiz sobre dualidade onda-partícula",
  "Resuma os conceitos principais",
  "Explique a equação de Schrödinger",
];

interface ChatPanelProps {
  projectId: string | null;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("");

  return (
    <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
      {/* Header */}
      <div className="glass-dark rounded-2xl p-4 mb-4 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-gray-900">Chat</h3>
          </div>
        </div>
        <Badge className="rounded-lg bg-blue-50 text-blue-700 border-blue-200">
          <FileText className="w-3 h-3 mr-1" />
          3 fontes carregadas
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 mb-4">
        <div className="space-y-4 pr-2">
          {mockMessages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] ${
                  message.role === "user"
                    ? "glass rounded-2xl rounded-tr-md p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
                    : "glass-dark rounded-2xl rounded-tl-md p-4 border border-gray-200"
                }`}
              >
                <p className="text-sm text-gray-800 mb-2">{message.content}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">{message.timestamp}</span>
                  {message.sourceReference && (
                    <Badge
                      variant="outline"
                      className="rounded-md text-xs bg-white border-gray-300 text-gray-600"
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Fonte
                    </Badge>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Suggestions */}
      <div className="mb-4 space-y-2">
        <p className="text-xs text-gray-600 mb-2">Sugestões:</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="glass px-3 py-2 rounded-xl text-xs text-gray-700 hover:bg-purple-50/50 transition-all duration-300 border border-gray-200"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="glass-dark rounded-2xl p-3 flex items-center gap-2 border border-gray-200">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Pergunte qualquer coisa..."
          className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-800 placeholder:text-gray-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim()) {
              setInputValue("");
            }
          }}
        />
        <Button
          size="icon"
          className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300"
          disabled={!inputValue.trim()}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}