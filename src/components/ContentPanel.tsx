import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  HelpCircle,
  Layers,
  FileText,
  Loader2,
  BookOpen,
  MoreVertical,
  Sparkles,
  X,
  TrendingUp,
  Trash2,
  Edit,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Zap,
  Lightbulb,
  Network,
  BarChart3,

} from "lucide-react";
import { motion } from "motion/react";
import { useQuestions } from "../hooks/useQuestions";
import { useFlashcards } from "../hooks/useFlashcards";
import { useSummaries } from "../hooks/useSummaries";
import { useDifficulties } from "../hooks/useDifficulties";
import { useMindMaps } from "../hooks/useMindMaps";
import { useUserPreferences } from "../hooks/useUserPreferences";

import { db } from "../lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from "firebase/firestore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
type TFunction = ReturnType<typeof useTranslation>['t'];
import { isRecoverySession } from "../lib/recoverySessionTracker";
import { triggerContentRefresh } from "../lib/events";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { QuizSession } from "./QuizSession";
import { FlashcardSession } from "./FlashcardSession";
import { SummaryViewer } from "./SummaryViewer";
import { MindMapViewer } from "./MindMapViewer";
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
  onViewStats?: () => void;
}

interface GeneratedContent {
  id: string;
  type: 'quiz' | 'flashcards' | 'summary' | 'mindmap';
  title: string;
  sourceCount: number;
  createdAt: Date;
  difficulty?: 'fácil' | 'médio' | 'difícil' | 'misto';
  isRecovery?: boolean; // Indicates if content was generated from recovery mode
}

const ACTION_CARDS = [
  {
    id: 'quiz',
    titleKey: 'study.teste',
    icon: HelpCircle,
    bgColor: 'bg-gradient-to-br from-blue-600 to-blue-500',
    textColor: 'text-white',
    iconColor: 'text-white',
  },
  {
    id: 'flashcards',
    titleKey: 'study.flashcards',
    icon: Layers,
    bgColor: 'bg-gradient-to-br from-red-600 to-rose-500',
    textColor: 'text-white',
    iconColor: 'text-white',
  },
  {
    id: 'summary',
    titleKey: 'study.summary',
    icon: FileText,
    bgColor: 'bg-gradient-to-br from-purple-600 to-purple-500',
    textColor: 'text-white',
    iconColor: 'text-white',
  },
  {
    id: 'mindmap',
    titleKey: 'study.mindMap',
    icon: Network,
    bgColor: 'bg-gradient-to-br from-teal-600 to-cyan-500',
    textColor: 'text-white',
    iconColor: 'text-white',
  },
];

const getContentStyle = (type: string) => {
  switch (type) {
    case 'quiz':
      return {
        icon: HelpCircle,
        bgColor: 'bg-blue-50 dark:bg-blue-950',
        iconColor: 'text-blue-600 dark:text-blue-400',
        label: 'Quiz'
      };
    case 'flashcards':
      return {
        icon: Layers,
        bgColor: 'bg-red-50 dark:bg-red-950',
        iconColor: 'text-red-600 dark:text-red-400',
        label: 'Flashcards'
      };
    case 'summary':
      return {
        icon: FileText,
        bgColor: 'bg-purple-50 dark:bg-purple-950',
        iconColor: 'text-purple-600 dark:text-purple-400',
        label: 'Resumo'
      };
    case 'mindmap':
      return {
        icon: Network,
        bgColor: 'bg-teal-50 dark:bg-teal-950',
        iconColor: 'text-teal-600 dark:text-teal-400',
        label: 'Mapa Mental'
      };
    default:
      return {
        icon: FileText,
        bgColor: 'bg-muted',
        iconColor: 'text-muted-foreground',
        label: 'Conteúdo'
      };
  }
};

const formatTimeAgo = (date: Date, t: TFunction) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return t('contentPanel.now');
  if (seconds < 3600) return t('contentPanel.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('contentPanel.hoursAgo', { count: Math.floor(seconds / 3600) });
  return t('contentPanel.daysAgo', { count: Math.floor(seconds / 86400) });
};

// Helper function to get badge color based on difficulty
const getDifficultyBadgeStyle = (difficulty: 'fácil' | 'médio' | 'difícil' | 'misto') => {
  switch (difficulty) {
    case 'fácil':
      return 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 text-green-700 dark:text-green-400';
    case 'médio':
      return 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 text-orange-700 dark:text-orange-400';
    case 'difícil':
      return 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950 text-red-700 dark:text-red-400';
    case 'misto':
      return 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 text-amber-800 dark:text-amber-400';
  }
};

// Helper function to get icon based on difficulty
const getDifficultyIcon = (difficulty: 'fácil' | 'médio' | 'difícil' | 'misto') => {
  switch (difficulty) {
    case 'fácil':
      return CheckCircle;
    case 'médio':
      return AlertCircle;
    case 'difícil':
      return AlertTriangle;
    case 'misto':
      return Zap;
  }
};

export function ContentPanel({ projectId, selectedSourceIds = [], isFullscreenMode = false, onViewStats }: ContentPanelProps) {
  const { t } = useTranslation();
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<any>(null);
  const [selectedMindMap, setSelectedMindMap] = useState<any>(null);
  const [quizSessionOpen, setQuizSessionOpen] = useState(false);
  const [flashcardSessionOpen, setFlashcardSessionOpen] = useState(false);
  const [difficultiesOpen, setDifficultiesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQuizSession, setSelectedQuizSession] = useState<string | null>(null);
  const [selectedFlashcardSession, setSelectedFlashcardSession] = useState<string | null>(null);
  const [quizDifficulty, setQuizDifficulty] = useState<'todos' | 'fácil' | 'médio' | 'difícil'>('todos');
  const [flashcardDifficulty, setFlashcardDifficulty] = useState<'todos' | 'fácil' | 'médio' | 'difícil'>('todos');

  // Rename dialog state
  const [renamingContent, setRenamingContent] = useState<{ id: string; currentName: string; type: string } | null>(null);
  const [newContentName, setNewContentName] = useState<string>('');
  const { preferences, updateAutoRemove } = useUserPreferences();


  // Store custom names for quiz/flashcards (visualization only) - persist in localStorage
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  // Load custom names from localStorage when projectId changes
  useEffect(() => {
    if (projectId && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`custom-names-${projectId}`);
      if (saved) {
        try {
          setCustomNames(JSON.parse(saved));
        } catch (e) {
          console.error('Error loading custom names:', e);
          setCustomNames({});
        }
      } else {
        setCustomNames({});
      }
    }
  }, [projectId]);

  const handleAskChat = (selectedText: string) => {
    localStorage.setItem('chat_question', `Explique melhor: "${selectedText}"`);
    window.dispatchEvent(new CustomEvent('ask-chat', { detail: selectedText }));
    setSelectedSummary(null);
    toast.success(t('toasts.questionSentToChat'));
  };

  const { questions, loading: loadingQuiz, generating: generatingQuiz, generateQuiz, refetch: fetchQuestions } = useQuestions(projectId);
  const { flashcards, loading: loadingFlashcards, generating: generatingFlashcards, generateFlashcards, refetch: fetchFlashcards } = useFlashcards(projectId);
  const { summaries, loading: loadingSummaries, generating: generatingSummary, generateSummary, deleteSummary, refetch: fetchSummaries } = useSummaries(projectId);
  const { mindMaps, loading: loadingMindMaps, generating: generatingMindMap, generateMindMap, deleteMindMap, refetch: fetchMindMaps } = useMindMaps(projectId);
  const { difficulties } = useDifficulties(projectId);

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

    // Helper to safely convert Firestore timestamp to Date
    const getSafeDate = (timestamp: any): Date => {
      if (!timestamp) return new Date();
      // Handle Firestore Timestamp (has toDate method)
      if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
      }
      // Handle serialized Timestamp (has seconds property)
      if (timestamp && typeof timestamp.seconds === 'number') {
        return new Date(timestamp.seconds * 1000);
      }
      // Handle standard Date string/number/object
      return new Date(timestamp);
    };

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
      const contentId = `quiz-${sessionId}`;
      // Check content_type from database as source of truth (with fallback to localStorage for legacy content)
      const isRecovery = mostRecent.content_type === 'recovery' ||
        (mostRecent.content_type === undefined && isRecoverySession(sessionId));
      const defaultTitle = isRecovery
        ? `${t('contentPanel.quiz')} ${t('contentPanel.recovery')} - ${t('contentPanel.questions', { count: sessionQuestions.length })}`
        : `${t('contentPanel.quiz')} - ${t('contentPanel.questions', { count: sessionQuestions.length })}`;
      // Use customName only if it exists and is not empty, otherwise use default
      const customName = customNames[contentId];
      const finalTitle = (customName && customName.trim()) ? customName : defaultTitle;
      newContent.push({
        id: contentId,
        type: 'quiz',
        title: finalTitle,
        sourceCount: selectedSourceIds.length,
        createdAt: getSafeDate(mostRecent.created_at),
        difficulty,
        isRecovery,
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
      const contentId = `flashcards-${sessionId}`;
      // Check content_type from database as source of truth (with fallback to localStorage for legacy content)
      const isRecovery = mostRecent.content_type === 'recovery' ||
        (mostRecent.content_type === undefined && isRecoverySession(sessionId));
      const defaultTitle = isRecovery
        ? `${t('contentPanel.flashcards')} ${t('contentPanel.recovery')} - ${t('contentPanel.cards', { count: sessionFlashcards.length })}`
        : `${t('contentPanel.flashcards')} - ${t('contentPanel.cards', { count: sessionFlashcards.length })}`;
      // Use customName only if it exists and is not empty, otherwise use default
      const customName = customNames[contentId];
      const finalTitle = (customName && customName.trim()) ? customName : defaultTitle;
      newContent.push({
        id: contentId,
        type: 'flashcards',
        title: finalTitle,
        sourceCount: selectedSourceIds.length,
        createdAt: getSafeDate(mostRecent.created_at),
        difficulty,
        isRecovery,
      });
    });

    // Add summaries
    summaries.forEach(summary => {
      // Check if this is recovery/focused content (tipo === 'personalizado')
      const isRecovery = summary.tipo === 'personalizado';
      newContent.push({
        id: summary.id,
        type: 'summary',
        title: customNames[summary.id] || summary.titulo,
        sourceCount: summary.source_ids?.length || 0,
        createdAt: getSafeDate(summary.created_at),
        isRecovery,
      });
    });

    // Add mind maps
    mindMaps.forEach(mindMap => {
      // Check if this is recovery content (tipo === 'recovery')
      const isRecovery = mindMap.tipo === 'recovery';
      newContent.push({
        id: mindMap.id,
        type: 'mindmap',
        title: customNames[mindMap.id] || mindMap.title,
        sourceCount: mindMap.source_ids?.length || 0,
        createdAt: getSafeDate(mindMap.created_at),
        isRecovery,
      });
    });

    // Sort by date (most recent first)
    newContent.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    setGeneratedContent(newContent);
  }, [questions, flashcards, summaries, mindMaps, projectId, selectedSourceIds, customNames]);

  // Persist custom names to localStorage
  useEffect(() => {
    if (projectId && typeof window !== 'undefined') {
      localStorage.setItem(`custom-names-${projectId}`, JSON.stringify(customNames));
    }
  }, [customNames, projectId]);

  // Listen for content generation events from DifficultiesPanel
  useEffect(() => {
    const handleContentGenerated = () => {
      // Add a small delay to ensure database has finished processing
      setTimeout(() => {
        fetchQuestions();
        fetchFlashcards();
        fetchSummaries();
        fetchMindMaps();
      }, 800); // 800ms delay to ensure data is available
    };

    window.addEventListener('content-generated', handleContentGenerated);

    return () => {
      window.removeEventListener('content-generated', handleContentGenerated);
    };
  }, [fetchQuestions, fetchFlashcards, fetchSummaries, fetchMindMaps]);

  const handleGenerateContent = async (type: 'quiz' | 'flashcards' | 'summary' | 'mindmap') => {
    if (selectedSourceIds.length === 0) {
      toast.error(t('toasts.selectSourceFirst'));
      return;
    }

    try {
      switch (type) {
        case 'quiz':
          const quizDiff = quizDifficulty !== 'todos' ? quizDifficulty : undefined;
          const quizResult = (await generateQuiz(selectedSourceIds, 20, quizDiff)) as any;
          toast.success(quizDiff
            ? t('toasts.quizGeneratedWithDiff', { difficulty: quizDiff })
            : t('toasts.quizGenerated')
          );

          // Trigger content refresh for all hooks (fallback for Realtime)
          triggerContentRefresh();

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
            ? t('toasts.flashcardsGeneratedWithDiff', { difficulty: flashcardDiff })
            : t('toasts.flashcardsGenerated')
          );

          // Trigger content refresh for all hooks (fallback for Realtime)
          triggerContentRefresh();
          break;
        case 'summary':
          await generateSummary(selectedSourceIds);
          toast.success(t('toasts.summaryGenerated'));

          // Trigger content refresh for all hooks (fallback for Realtime)
          triggerContentRefresh();
          break;
        case 'mindmap':
          await generateMindMap(selectedSourceIds, 'standard');
          toast.success(t('toasts.mindmapGenerated'));
          break;
      }
    } catch (error) {
      toast.error(t('toasts.contentGenerationError'));
      console.error(error);
    }
  };

  const handleOpenContent = (content: GeneratedContent) => {
    switch (content.type) {
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
      case 'mindmap':
        const mindMap = mindMaps.find(m => m.id === content.id);
        if (mindMap) {
          setSelectedMindMap(mindMap);
        }
        break;
    }
  };

  const handleDeleteSummary = async (id: string) => {
    try {
      await deleteSummary(id);
      toast.success(t('toasts.summaryRemoved'));
    } catch (error) {
      toast.error(t('toasts.summaryRemoveError'));
    }
  };



  const handleDeleteQuiz = async (sessionId: string) => {
    try {
      const q = query(collection(db, 'questions'), where('session_id', '==', sessionId));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Refetch questions to update UI
      await fetchQuestions();
      toast.success(t('toasts.quizRemoved'));
    } catch (error) {
      console.error('Error deleting quiz:', error);
      toast.error(t('toasts.quizRemoveError'));
    }
  };

  const handleDeleteFlashcards = async (sessionId: string) => {
    try {
      const q = query(collection(db, 'flashcards'), where('session_id', '==', sessionId));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Refetch flashcards to update UI
      await fetchFlashcards();
      toast.success(t('toasts.flashcardsRemoved'));
    } catch (error) {
      console.error('Error deleting flashcards:', error);
      toast.error(t('toasts.flashcardsRemoveError'));
    }
  };

  const handleDeleteMindMap = async (id: string) => {
    try {
      await deleteMindMap(id);
      toast.success(t('toasts.mindmapRemoved'));
    } catch (error) {
      toast.error(t('toasts.mindmapRemoveError'));
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
    } else if (content.type === 'mindmap') {
      await handleDeleteMindMap(content.id);
    }
  };

  const handleRenameConfirm = async () => {
    if (!renamingContent || !newContentName.trim()) return;

    try {
      if (renamingContent.type === 'summary') {
        // For summaries, update in database
        await updateDoc(doc(db, 'summaries', renamingContent.id), {
          titulo: newContentName.trim()
        });

        // Remove from custom names if exists
        const newCustomNames = { ...customNames };
        delete newCustomNames[renamingContent.id];
        setCustomNames(newCustomNames);

        toast.success(t('toasts.summaryRenamed'));
      } else if (renamingContent.type === 'mindmap') {
        // For mind maps, update in database
        await updateDoc(doc(db, 'mindmaps', renamingContent.id), {
          title: newContentName.trim()
        });

        // Remove from custom names if exists
        const newCustomNames = { ...customNames };
        delete newCustomNames[renamingContent.id];
        setCustomNames(newCustomNames);

        toast.success(t('toasts.mindmapRenamed'));
      } else {
        // For quiz/flashcards, store in local state (visualization only)
        setCustomNames({
          ...customNames,
          [renamingContent.id]: newContentName.trim()
        });
        toast.success(renamingContent.type === 'quiz' ? "Quiz renomeado" : "Flashcards renomeados");
      }

      setRenamingContent(null);
      setNewContentName('');
    } catch (error) {
      console.error('Error renaming content:', error);
      toast.error(t('toasts.renameError'));
    }
  };

  if (!projectId) {
    return (
      <div className="h-full w-full flex flex-col bg-muted/50 rounded-3xl p-4 border border-border overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-muted-foreground">Selecione um projeto para ver o conteúdo</p>
          </div>
        </div>
      </div>
    );
  }

  const loading = loadingQuiz || loadingFlashcards || loadingSummaries || loadingMindMaps;

  return (
    <>
      <div className={`w-full flex flex-col ${isFullscreenMode
        ? "bg-card"
        : "bg-card rounded-3xl border border-border h-full overflow-hidden"
        }`}>
        {/* Banda colorida do topo */}
        <div className="h-1.5 w-full bg-gradient-to-r from-green-500 to-emerald-500" />

        <div className="flex-1 overflow-hidden p-6 flex flex-col">
          {/* Header - Oculto em fullscreen para evitar duplicidade */}
          {!isFullscreenMode && (
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold text-foreground">{t('contentPanel.study')}</h1>
              <button
                onClick={() => setIsFullscreen(true)}
                className="hidden md:flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Expandir"
              >
                <span className="material-symbols-outlined text-[20px]">expand_content</span>
              </button>
            </div>
          )}

          {/* Grid de Botões de Ação */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {ACTION_CARDS.map(card => {
              const CardIcon = card.icon;
              const showSettings = card.id === 'quiz' || card.id === 'flashcards';
              const currentDifficulty = card.id === 'quiz' ? quizDifficulty : flashcardDifficulty;
              const setDifficulty = card.id === 'quiz' ? setQuizDifficulty : setFlashcardDifficulty;

              // Each button is disabled only when its own content is generating
              const isButtonGenerating =
                (card.id === 'quiz' && generatingQuiz) ||
                (card.id === 'flashcards' && generatingFlashcards) ||
                (card.id === 'summary' && generatingSummary) ||
                (card.id === 'mindmap' && generatingMindMap);

              return (
                <div key={card.id} className="relative">
                  <button
                    onClick={() => handleGenerateContent(card.id as 'quiz' | 'flashcards' | 'summary' | 'mindmap')}
                    disabled={isButtonGenerating}
                    className={`
                    ${card.bgColor}
                    relative p-4 md:p-3.5 rounded-2xl w-full
                    flex flex-col items-start gap-1.5 md:gap-2
                    shadow-[0_8px_30px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.2)]
                    hover:shadow-[0_15px_40px_rgb(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.3)]
                    transition-all duration-300
                    hover:scale-[1.03]
                    active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    group
                    overflow-hidden
                    backdrop-blur-xl
                    border-2 border-white/40
                    before:absolute before:inset-0
                    before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.3)_100%)]
                    before:opacity-70
                    after:absolute after:inset-0
                    after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.6),transparent_60%)]
                    after:opacity-0 hover:after:opacity-100
                    after:transition-opacity after:duration-500
                    [box-shadow:0_2px_4px_rgba(255,255,255,0.3)_inset,0_8px_30px_rgba(0,0,0,0.15)]
                    hover:[box-shadow:0_2px_8px_rgba(255,255,255,0.4)_inset,0_15px_40px_rgba(0,0,0,0.25)]
                  `}
                  >
                    {/* Ícone */}
                    <CardIcon className={`w-6 h-6 md:w-5 md:h-5 ${card.iconColor} relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] mt-[-2px]`} />

                    {/* Título */}
                    <span className={`font-semibold text-sm md:text-xs ${card.textColor} relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]`}>
                      {t(card.titleKey)}
                    </span>

                    {/* Loading indicator - only for this specific button */}
                    {isButtonGenerating && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-md rounded-2xl z-20">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </button>

                  {/* Badge de dificuldade - canto inferior direito sem fundo */}
                  {showSettings && (() => {
                    const diffLevel = currentDifficulty === 'todos' ? 'misto' : (currentDifficulty as 'fácil' | 'médio' | 'difícil');
                    const DiffIcon = getDifficultyIcon(diffLevel);
                    return (
                      <div className="absolute bottom-2 md:bottom-2 right-2 md:right-2 text-[9px] md:text-[8px] font-bold text-white/90 flex items-center gap-0.5 md:gap-1 z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                        <DiffIcon className="w-2 h-2 md:w-2 md:h-2" />
                        <span>{currentDifficulty === 'todos' ? t('contentPanel.mixed') : t(`contentPanel.${currentDifficulty === 'fácil' ? 'easy' : currentDifficulty === 'médio' ? 'medium' : 'hard'}`)}</span>
                      </div>
                    );
                  })()}

                  {/* Botão de configuração - sem fundo */}
                  {showSettings && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 md:top-2 right-2 md:right-2 p-1 md:p-1 rounded-lg hover:scale-110 transition-all z-10 group/edit"
                          aria-label="Editar dificuldade"
                        >
                          <Edit className="w-3.5 h-3.5 md:w-3 md:h-3 text-white/90 group-hover/edit:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>{t('contentPanel.difficultyLevel')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                          value={currentDifficulty}
                          onValueChange={(value) => setDifficulty(value as typeof currentDifficulty)}
                        >
                          <DropdownMenuRadioItem value="todos">
                            {t('contentPanel.allLevels')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="fácil">
                            {t('contentPanel.easy')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="médio">
                            {t('contentPanel.medium')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="difícil">
                            {t('contentPanel.hard')}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botões Centrais: Análise das Dificuldades e Estatísticas */}
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={() => setDifficultiesOpen(true)}
              className="text-sm rounded-xl px-4 py-2 min-w-[200px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-[0_8px_30px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_rgba(251,146,60,0.4),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.3)] transition-all duration-300 backdrop-blur-xl border-2 border-white/40 relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.3)_100%)] before:opacity-70 after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.6),transparent_60%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500 hover:scale-[1.05] [box-shadow:0_2px_4px_rgba(255,255,255,0.3)_inset,0_8px_30px_rgba(0,0,0,0.15)] hover:[box-shadow:0_2px_8px_rgba(255,255,255,0.4)_inset,0_15px_40px_rgba(251,146,60,0.4)]"
            >
              <div className="flex items-center justify-center gap-2 mb-1 relative z-10">
                <TrendingUp className="w-4 h-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                <span className="font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t('study.difficulties')}</span>
              </div>
              {difficulties.length > 0 && (
                <div className="flex items-center justify-center gap-1 text-[10px] opacity-90 relative z-10">
                  <Lightbulb className="w-3 h-3" />
                  <span>{t('difficulties.trackedCount', { count: difficulties.length })}</span>
                </div>
              )}
            </button>

            {onViewStats && (
              <button
                onClick={onViewStats}
                className="text-sm rounded-xl px-4 py-2 min-w-[200px] bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-[0_8px_30px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_rgba(59,130,246,0.4),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.3)] transition-all duration-300 backdrop-blur-xl border-2 border-white/40 relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.3)_100%)] before:opacity-70 after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.6),transparent_60%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500 hover:scale-[1.05] [box-shadow:0_2px_4px_rgba(255,255,255,0.3)_inset,0_8px_30px_rgba(0,0,0,0.15)] hover:[box-shadow:0_2px_8px_rgba(255,255,255,0.4)_inset,0_15px_40px_rgba(59,130,246,0.4)]"
              >
                <div className="flex items-center justify-center gap-2 mb-1 relative z-10">
                  <BarChart3 className="w-4 h-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                  <span className="font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t('study.statistics')}</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-[10px] opacity-90 relative z-10">
                  <span>{t('study.viewPerformance')}</span>
                </div>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border my-4" />

          {/* Lista de Conteúdo Gerado */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
              </div>
            ) : generatedContent.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium mb-1">{t('contentPanel.noContent')}</p>
                <p className="text-sm">{t('contentPanel.clickToStart')}</p>
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
                      className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors cursor-pointer group"
                    >
                      {/* Ícone */}
                      <div className={`w-12 h-12 rounded-xl ${style.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${style.iconColor}`} />
                      </div>

                      {/* Informações */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground truncate">
                            {content.title}
                          </h3>
                          {/* Recovery Badge */}
                          {content.isRecovery && (
                            <Badge className="text-xs px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 border border-orange-200 shrink-0 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {t('contentPanel.recovery')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {style.label} · {t('contentPanel.sources', { count: content.sourceCount })} · {formatTimeAgo(content.createdAt, t)}
                        </p>
                      </div>

                      {/* Badge de dificuldade */}
                      {content.difficulty && (() => {
                        const DiffIcon = getDifficultyIcon(content.difficulty);
                        return (
                          <Badge className={`text-xs px-2.5 py-1 rounded-lg font-medium shadow-sm shrink-0 flex items-center gap-1 ${getDifficultyBadgeStyle(content.difficulty)}`}>
                            <DiffIcon className="w-3 h-3" />
                            {t(`contentPanel.${content.difficulty === 'fácil' ? 'easy' : content.difficulty === 'médio' ? 'medium' : content.difficulty === 'difícil' ? 'hard' : 'mixed'}`)}
                          </Badge>
                        );
                      })()}

                      {/* Menu de ações */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            className="p-2 hover:bg-border rounded-lg transition-opacity"
                          >
                            <MoreVertical className="w-5 h-5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setRenamingContent({ id: content.id, currentName: content.title, type: content.type });
                              setNewContentName(content.title);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            {t('contentPanel.rename')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              handleDeleteContent(content);
                            }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('contentPanel.delete')}
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
        <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
          <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <DialogTitle className="text-2xl font-bold text-foreground">
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
                summaryId={selectedSummary?.id || ""}
                projectId={projectId || ""}
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

      {/* Mind Map Dialog - Fullscreen */}
      <Dialog open={!!selectedMindMap} onOpenChange={() => setSelectedMindMap(null)}>
        <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
          <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col">
            <div className="flex items-center justify-between p-6 border-b bg-background">
              <DialogTitle className="text-2xl font-bold text-foreground">
                {selectedMindMap?.title}
              </DialogTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedMindMap(null)}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <DialogDescription className="sr-only">
              Visualização do mapa mental gerado. Use os controles de zoom para ajustar a visualização.
            </DialogDescription>
            <div className="flex-1 min-h-0">
              {selectedMindMap && (
                <MindMapViewer
                  content={selectedMindMap.content_markdown || selectedMindMap.content_mermaid}
                  title={selectedMindMap.title}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Difficulties Dialog - Fullscreen */}
      <Dialog open={difficultiesOpen} onOpenChange={setDifficultiesOpen}>
        <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
          <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-muted">
            <div className="flex items-center justify-between p-6 border-b bg-background gap-6">
              <h2 className="text-2xl font-bold text-foreground">{t('study.difficulties')}</h2>
              <div className="flex items-center gap-4">
                {/* Toggle Auto-Remove - Compacto */}
                <div className="flex items-center gap-3 px-3 py-1.5 bg-background rounded-lg border border-border">
                  <div className="flex flex-col">
                    <label
                      htmlFor="difficulty-auto-remove"
                      className="text-xs font-medium text-muted-foreground cursor-pointer"
                    >
                      {t('contentPanel.autoRemoveTitle')}
                    </label>
                    <span className="text-[10px] text-gray-500">
                      {t('contentPanel.autoRemoveDesc')}
                    </span>
                  </div>

                  {/* Toggle Button Customizado - Tamanho Reduzido */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.autoRemoveDifficulties}
                    onClick={async () => {
                      try {
                        const newValue = !preferences.autoRemoveDifficulties;
                        await updateAutoRemove(newValue);
                        toast.success(
                          newValue
                            ? t('contentPanel.autoRemoveEnabled')
                            : t('contentPanel.autoRemoveDisabled')
                        );
                      } catch (error) {
                        console.error('Error toggling auto-remove:', error);
                        toast.error(t('contentPanel.autoRemoveError'));
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${preferences.autoRemoveDifficulties
                      ? 'bg-green-500'
                      : 'bg-muted'
                      }`}
                  >
                    <span className="sr-only">Auto-remoção de dificuldades</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${preferences.autoRemoveDifficulties
                        ? 'translate-x-5'
                        : 'translate-x-0'
                        }`}
                    />
                  </button>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDifficultiesOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <DialogTitle className="sr-only">{t('study.difficulties')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('difficulties.noDifficultiesDesc')}
            </DialogDescription>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
              <DifficultiesPanel projectId={projectId} isFullscreenMode={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renamingContent !== null} onOpenChange={(open) => {
        if (!open) {
          setRenamingContent(null);
          setNewContentName('');
        }
      }}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogTitle className="text-xl font-semibold text-foreground">
            {t('contentPanel.renameContent', {
              type: renamingContent?.type === 'quiz' ? 'Quiz' : renamingContent?.type === 'flashcards' ? 'Flashcards' : 'Resumo'
            })}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('contentPanel.enterNewName', { name: renamingContent?.currentName })}
          </DialogDescription>
          <div className="py-4">
            <Input
              type="text"
              value={newContentName}
              onChange={(e) => setNewContentName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameConfirm();
                }
              }}
              placeholder="Novo nome..."
              className="w-full rounded-xl"
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setRenamingContent(null);
                setNewContentName('');
              }}
              className="rounded-xl border-gray-300 hover:bg-muted text-muted-foreground"
            >
              {t('contentPanel.cancel')}
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!newContentName.trim()}
              className="rounded-xl bg-[#0891B2] hover:bg-[#0891B2]/90"
            >
              {t('contentPanel.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Dialog */}
      {!isFullscreenMode && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
            <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-muted">
              <div className="flex items-center justify-between p-6 border-b bg-background">
                <h2 className="text-2xl font-bold text-foreground">{t('contentPanel.study')}</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                <ContentPanel projectId={projectId} selectedSourceIds={selectedSourceIds} isFullscreenMode={true} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Achievement Badge de Teste */}

    </>
  );
}
