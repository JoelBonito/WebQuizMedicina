import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, FileText, Loader2, Trash2, AlertCircle, Bot, User, Lightbulb } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { useChat, CitedSource } from "../hooks/useChat";
import { useSources } from "../hooks/useSources";
import { useDifficulties } from "../hooks/useDifficulties";
import { toast } from "sonner";

interface ChatPanelProps {
  projectId: string | null;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [currentCitedSources, setCurrentCitedSources] = useState<CitedSource[]>([]);
  const [currentSuggestedTopics, setCurrentSuggestedTopics] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, sending, sendMessage, clearHistory } = useChat(projectId);
  const { sources } = useSources(projectId);
  const { difficulties } = useDifficulties(projectId);

  // Monitor projectId changes for debugging
  useEffect(() => {
    console.log('[ChatPanel] ProjectId changed:', projectId);
    if (projectId === null || projectId === undefined) {
      console.warn('[ChatPanel] ⚠️ ProjectId is now null/undefined - chat will not work');
    }
  }, [projectId]);

  // Debug: Monitor sources changes
  useEffect(() => {
    console.log('[ChatPanel] Sources updated:', {
      total: sources.length,
      ready: sources.filter(s => s.status === 'ready').length,
      sources: sources.map(s => ({ id: s.id, name: s.name, status: s.status }))
    });
  }, [sources]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for questions from summary text selection
  useEffect(() => {
    const handleAskChat = () => {
      const question = localStorage.getItem('chat_question');
      if (question) {
        setInputValue(question);
        localStorage.removeItem('chat_question');
      }
    };

    window.addEventListener('ask-chat', handleAskChat);

    // Check on mount
    handleAskChat();

    return () => {
      window.removeEventListener('ask-chat', handleAskChat);
    };
  }, []);

  const handleSend = async () => {
    // Debug logging to catch state issues
    if (!projectId) {
      console.error('[ChatPanel] Cannot send - projectId is null/undefined:', { projectId, inputValue: inputValue.trim() });
      toast.error("Projeto não selecionado. Por favor, selecione um projeto.");
      return;
    }

    if (!inputValue.trim() || sending) return;

    const messageText = inputValue.trim();
    setInputValue("");

    try {
      const response = await sendMessage(messageText);

      if (response) {
        setCurrentCitedSources(response.cited_sources);
        setCurrentSuggestedTopics(response.suggested_topics);

        if (response.has_difficulties_context) {
          toast.success("Resposta personalizada com base nas suas dificuldades!");
        }
      }
    } catch (error) {
      toast.error("Erro ao enviar mensagem. Verifique se há fontes disponíveis.");
      console.error(error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistory();
      setCurrentCitedSources([]);
      setCurrentSuggestedTopics([]);
      toast.success("Histórico limpo");
    } catch (error) {
      toast.error("Erro ao limpar histórico");
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
  };

  // Generate smart suggestions based on difficulties
  const smartSuggestions = difficulties
    .slice(0, 3)
    .map((d) => `Explique melhor sobre ${d.topico}`);

  const defaultSuggestions = [
    "Faça um resumo dos principais conceitos",
    "Quais são os pontos mais importantes?",
    "Explique de forma mais simples",
  ];

  const suggestions = smartSuggestions.length > 0 ? smartSuggestions : defaultSuggestions;

  const readySources = sources.filter((s) => s.status === 'ready');

  if (!projectId) {
    return (
      <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Selecione um projeto para começar a conversar</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
      {/* Header */}
      <div className="glass-dark rounded-2xl p-4 mb-4 border border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-gray-900 font-semibold">Chat com IA</h3>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              className="rounded-lg hover:bg-red-50 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-lg bg-blue-50 text-blue-700 border-blue-200">
            <FileText className="w-3 h-3 mr-1" />
            {readySources.length} fonte{readySources.length !== 1 ? 's' : ''} disponível{readySources.length !== 1 ? 'is' : ''}
          </Badge>
          {difficulties.length > 0 && (
            <Badge className="rounded-lg bg-orange-50 text-orange-700 border-orange-200">
              <Lightbulb className="w-3 h-3 mr-1" />
              {difficulties.length} dificuldade{difficulties.length !== 1 ? 's' : ''} rastreada{difficulties.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {readySources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            <h4 className="text-gray-900 font-semibold mb-2">Nenhuma fonte disponível</h4>
            <p className="text-sm text-gray-600">
              Faça upload de fontes (PDFs, textos) no painel "Fontes" para começar a conversar com a IA
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto mb-4 pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
            <div className="space-y-4">
              {loading && messages.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 mx-auto mb-4 text-[#0891B2]" />
                  <p className="text-gray-600 mb-2">Olá! Estou aqui para ajudar você.</p>
                  <p className="text-sm text-gray-500">
                    Faça perguntas sobre suas fontes e eu responderei com base no conteúdo delas.
                  </p>
                </div>
              ) : (
                <>
                  <AnimatePresence>
                    {messages.map((message, index) => (
                      <div key={message.id}>
                        {message.is_system ? (
                          /* System notification message */
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex justify-center mb-4"
                          >
                            <div className="max-w-[90%] glass rounded-2xl p-4 bg-gradient-to-br from-blue-50 via-[#F0F9FF] to-[#F1F8E9] border-2 border-[#0891B2] shadow-lg">
                              <div className="flex items-start gap-3">
                                <Sparkles className="w-5 h-5 text-[#0891B2] mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                    {message.response}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <>
                            {/* User message */}
                            {message.message && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="flex justify-end mb-4"
                              >
                                <div className="max-w-[85%] glass rounded-2xl rounded-tr-md p-4 bg-gradient-to-br from-[#F0F9FF] to-[#F1F8E9] border border-[#BAE6FD]">
                                  <div className="flex items-start gap-2 mb-2">
                                    <User className="w-4 h-4 text-[#0891B2] mt-0.5" />
                                    <p className="text-sm text-gray-800 flex-1">{message.message}</p>
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </motion.div>
                            )}

                            {/* AI response */}
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 + 0.1 }}
                              className="flex justify-start mb-4"
                            >
                              <div className="max-w-[85%] glass-dark rounded-2xl rounded-tl-md p-4 border border-gray-200">
                                <div className="flex items-start gap-2 mb-2">
                                  <Bot className="w-4 h-4 text-[#0891B2] mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-800 whitespace-pre-wrap mb-3">
                                      {message.response}
                                    </p>
                                    {message.sources_cited && message.sources_cited.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mb-2">
                                        {message.sources_cited.map((sourceId, idx) => {
                                          const source = sources.find((s) => s.id === sourceId);
                                          return source ? (
                                            <Badge
                                              key={idx}
                                              variant="outline"
                                              className="rounded-md text-xs bg-blue-50 border-blue-200 text-blue-700"
                                            >
                                              <FileText className="w-3 h-3 mr-1" />
                                              {source.name}
                                            </Badge>
                                          ) : null;
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(message.created_at).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </motion.div>
                          </>
                        )}
                      </div>
                    ))}
                  </AnimatePresence>

                  {sending && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="glass-dark rounded-2xl rounded-tl-md p-4 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#0891B2]" />
                          <p className="text-sm text-gray-600">Pensando...</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Suggestions */}
          {messages.length === 0 && suggestions.length > 0 && (
            <div className="mb-4 space-y-2 flex-shrink-0">
              <p className="text-xs text-gray-600 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                Sugestões{smartSuggestions.length > 0 ? ' baseadas nas suas dificuldades' : ''}:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSuggestion(suggestion)}
                    className="glass px-3 py-2 rounded-xl text-xs text-gray-700 hover:bg-[#F0F9FF]/50 transition-all duration-300 border border-gray-200"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="glass-dark rounded-2xl p-3 flex items-center gap-2 border border-gray-200 flex-shrink-0">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Pergunte qualquer coisa sobre suas fontes..."
              className="flex-1 bg-transparent border-0 outline-none text-sm text-gray-800 placeholder:text-gray-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
            />
            <Button
              size="icon"
              onClick={handleSend}
              className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg hover:shadow-xl transition-all duration-300"
              disabled={!inputValue.trim() || sending}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
