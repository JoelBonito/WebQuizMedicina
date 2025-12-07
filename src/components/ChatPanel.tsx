import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Sparkles, FileText, Loader2, Trash2, AlertCircle, Bot, User, Lightbulb } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { useChat, CitedSource } from "../hooks/useChat";
import { useSources } from "../hooks/useSources";
import { useDifficulties } from "../hooks/useDifficulties";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface ChatPanelProps {
  projectId: string | null;
  isFullscreenMode?: boolean;
}

export function ChatPanel({ projectId, isFullscreenMode = false }: ChatPanelProps) {
  const { t } = useTranslation();
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
      toast.error(t("chat.projectNotSelected"));
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
          toast.success(t("chat.difficultyResponse"));
        }
      }
    } catch (error) {
      toast.error(t("chat.sendError"));
      console.error(error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistory();
      setCurrentCitedSources([]);
      setCurrentSuggestedTopics([]);
      toast.success(t("chat.historyCleared"));
    } catch (error) {
      toast.error(t("chat.historyClearError"));
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
  };

  // Generate smart suggestions based on difficulties
  const smartSuggestions = difficulties
    .slice(0, 3)
    .map((d) => t("chat.explainBetter", { topic: d.topico }));

  const defaultSuggestions = [
    t("chat.summarizeConcepts"),
    t("chat.mainPoints"),
    t("chat.explainSimpler"),
  ];

  const suggestions = smartSuggestions.length > 0 ? smartSuggestions : defaultSuggestions;

  const readySources = sources.filter((s) => s.status === 'ready');

  if (!projectId) {
    return (
      <div className="flex flex-col bg-muted/50 rounded-3xl p-4 border border-gray-200 h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-muted-foreground">{t("chat.selectProject")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${isFullscreenMode ? "bg-muted/50" : "bg-card rounded-3xl border border-border"} overflow-hidden relative`}>
      {/* Header */}
      <div className="bg-muted/30 rounded-2xl p-4 mb-4 border border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-gray-900 font-semibold">{t("chat.aiChatTitle")}</h3>
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
            {t("chat.sourcesAvailable", { count: readySources.length })}
          </Badge>
        </div>
      </div>

      {readySources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center max-w-sm">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            <h4 className="text-gray-900 font-semibold mb-2">{t("chat.noSourcesTitle")}</h4>
            <p className="text-sm text-muted-foreground">
              {t("chat.noSourcesDescription")}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Container - CRITICAL: This is where scroll should be */}
          <div className={`flex-1 min-h-0 mb-4 ${!isFullscreenMode ? 'overflow-y-auto' : ''}`} style={!isFullscreenMode ? { scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' } : {}}>
            <div className="space-y-4 pr-2 pb-4">
              {loading && messages.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 mx-auto mb-4 text-[#0891B2]" />
                  <p className="text-muted-foreground mb-2">{t("chat.greeting")}</p>
                  <p className="text-sm text-gray-500">
                    {t("chat.greetingDescription")}
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
                                <div className="flex-1 chat-message prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:p-2 prose-pre:rounded-lg prose-headings:font-semibold prose-a:text-blue-600">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                  >
                                    {message.response}
                                  </ReactMarkdown>
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
                                <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm bg-[#0891B2] text-white rounded-tr-sm ml-8 max-w-[85%]`}>
                                  <div className="flex items-start gap-2 mb-2">
                                    <User className="w-4 h-4 text-white mt-0.5" />
                                    <p className="chat-message flex-1">{message.message}</p>
                                  </div>
                                  <span className="text-xs text-gray-200">
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
                              <div className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm bg-card border border-border text-foreground rounded-tl-sm mr-8 max-w-[85%]`}>
                                <div className="flex items-start gap-2 mb-2">
                                  <Bot className="w-4 h-4 text-[#0891B2] mt-0.5" />
                                  <div className="flex-1">
                                    <div className="chat-message mb-3 prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:p-2 prose-pre:rounded-lg prose-headings:font-semibold prose-a:text-blue-600">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                      >
                                        {message.response}
                                      </ReactMarkdown>
                                    </div>
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
                      <div className="bg-card border border-border rounded-2xl rounded-tl-md p-4">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#0891B2]" />
                          <p className="text-sm text-muted-foreground">{t("chat.thinking")}</p>
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
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                {smartSuggestions.length > 0 ? t('chat.suggestionsDifficulties') : t('chat.suggestionsTitle')}:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSuggestion(suggestion)}
                    className="bg-card px-3 py-2 rounded-xl text-xs text-muted-foreground hover:bg-accent transition-all duration-300 border border-border"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="bg-card/50 p-3 rounded-2xl border border-border flex gap-2 items-center flex-shrink-0">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("chat.placeholder")}
              className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
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
