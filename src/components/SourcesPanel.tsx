import { useState, useRef, ChangeEvent, useEffect } from "react";
import {
  FileText,
  Upload,
  Music,
  Image as ImageIcon,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  X,
  MoreVertical,
  Edit,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { motion } from "motion/react";
import { useSources } from "../hooks/useSources";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { db, functions } from "../lib/firebase";
import { updateDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

interface SourcesPanelProps {
  projectId: string | null;
  onSelectedSourcesChange?: (sourceIds: string[]) => void;
  isFullscreenMode?: boolean;
}

const getFileIcon = (type: string) => {
  if (type === "pdf") return <FileText className="w-5 h-5 text-red-500" />;
  if (["mp3", "wav", "m4a"].includes(type))
    return <Music className="w-5 h-5 text-[#0891B2]" />;
  if (["jpg", "jpeg", "png"].includes(type))
    return <ImageIcon className="w-5 h-5 text-blue-500" />;
  return <FileText className="w-5 h-5 text-gray-500" />;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "ready":
      return (
        <Badge className="rounded-lg bg-green-50 text-green-700 border-green-200 text-xs">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Pronto
        </Badge>
      );
    case "processing":
      return (
        <Badge className="rounded-lg bg-blue-50 text-blue-700 border-blue-200 text-xs">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Processando
        </Badge>
      );
    case "error":
      return (
        <Badge className="rounded-lg bg-red-50 text-red-700 border-red-200 text-xs">
          <AlertCircle className="w-3 h-3 mr-1" />
          Erro
        </Badge>
      );
    default:
      return null;
  }
};

const truncateFileName = (name: string, maxLength: number = 20): string => {
  if (name.length <= maxLength) return name;

  const parts = name.split('.');
  const extension = parts.length > 1 ? parts.pop() || '' : '';
  const nameWithoutExt = parts.join('.');

  if (nameWithoutExt.length > maxLength - extension.length - 4) {
    const truncated = nameWithoutExt.substring(0, maxLength - extension.length - 4);
    return `${truncated}...${extension ? '.' + extension : ''}`;
  }

  return name;
};

export function SourcesPanel({ projectId, onSelectedSourcesChange, isFullscreenMode = false }: SourcesPanelProps) {
  const { t } = useTranslation();
  const { sources, loading, uploading, uploadSource, deleteSource, refetch } =
    useSources(projectId);
  const { user } = useAuth();
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [deletingSource, setDeletingSource] = useState<{ id: string; name: string } | null>(null);
  const [renamingSource, setRenamingSource] = useState<{ id: string; currentName: string } | null>(null);
  const [newSourceName, setNewSourceName] = useState<string>('');
  const [generatedCounts, setGeneratedCounts] = useState<
    Record<string, { quiz: number; flashcards: number; summaries: number }>
  >({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadedSourceIds, setUploadedSourceIds] = useState<string[]>([]);
  const [processingEmbeddings, setProcessingEmbeddings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch generated counts for all sources
  useEffect(() => {
    const fetchCounts = async () => {
      // TODO: Implement actual counting from database
      // For now, set to 0
      const counts: Record<
        string,
        { quiz: number; flashcards: number; summaries: number }
      > = {};
      sources.forEach((source) => {
        counts[source.id] = { quiz: 0, flashcards: 0, summaries: 0 };
      });
      setGeneratedCounts(counts);
    };
    fetchCounts();
  }, [sources]);

  // Sync selection with parent whenever it changes
  useEffect(() => {
    onSelectedSourcesChange?.(Array.from(selectedSources));
  }, [selectedSources]);

  // Initialize all sources as selected by default and update when new ready sources appear
  useEffect(() => {
    if (sources.length > 0) {
      const readySources = sources.filter(s => s.status === 'ready');
      const readyIds = readySources.map(s => s.id);

      console.log('🔄 [SourcesPanel] Checking auto-selection:', {
        totalSources: sources.length,
        readySources: readySources.length,
        currentSelection: Array.from(selectedSources)
      });

      // Add any new ready sources to the selection (keep existing selections)
      setSelectedSources(prev => {
        const newSelected = new Set(prev);
        let hasChanges = false;

        readyIds.forEach(id => {
          if (!newSelected.has(id)) {
            console.log('➕ [SourcesPanel] Auto-selecting new source:', id);
            newSelected.add(id);
            hasChanges = true;
          }
        });

        return hasChanges ? newSelected : prev;
      });
    }
  }, [sources]);

  const handleSourceToggle = (sourceId: string, checked: boolean) => {
    setSelectedSources(prev => {
      const newSelected = new Set(prev);
      if (checked) {
        newSelected.add(sourceId);
      } else {
        newSelected.delete(sourceId);
      }
      return newSelected;
    });
  };

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!projectId) {
      toast.error(t('toasts.selectProjectFirst'));
      return;
    }

    const files = e.target.files ? Array.from(e.target.files) : [];
    await handleFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFiles = async (files: File[]) => {
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "audio/mpeg",
      "audio/wav",
      "audio/x-m4a",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    const uploadedIds: string[] = [];
    let successCount = 0;

    for (const file of files) {
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|md|mp3|wav|m4a|jpg|jpeg|png|doc|docx|ppt|pptx)$/i)) {
        toast.error(t('toasts.unsupportedFileType', { filename: file.name }));
        continue;
      }

      try {
        const source = await uploadSource(file);
        if (source) {
          uploadedIds.push(source.id);
          successCount++;
        }
        toast.success(t('toasts.fileUploaded', { filename: file.name }));
      } catch (error) {
        console.error("Upload error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        toast.error(t('toasts.fileUploadError', { filename: file.name, error: errorMessage }), {
          duration: 6000, // Show for 6 seconds for longer messages
        });
      }
    }

    // Se pelo menos um arquivo foi enviado com sucesso, mostrar modal
    if (successCount > 0) {
      setUploadedSourceIds(uploadedIds);
      setShowSuccessModal(true);
    }
  };





  const processEmbeddings = async () => {
    setProcessingEmbeddings(true);

    try {
      console.log(`🚀 Iniciando processamento de embeddings para ${uploadedSourceIds.length} arquivos`);

      if (!projectId) {
        throw new Error("Project ID is missing");
      }

      // Chamar a Cloud Function para processar embeddings
      const processEmbeddingsFn = httpsCallable(functions, 'process_embeddings_queue');
      const result = await processEmbeddingsFn({
        project_id: projectId,
        max_items: 10
      });
      const data = result.data as any;

      if (!data) {
        throw new Error('No data returned from process_embeddings_queue');
      }

      console.log('✅ Embeddings processing result:', data);

      // Fechar modal e mostrar sucesso
      setShowSuccessModal(false);

      if (data?.processed > 0) {
        // Gerar lista de arquivos processados
        const processedSources = sources.filter(s => uploadedSourceIds.includes(s.id));
        const sourcesNames = processedSources.map(s => s.name).join(', ');

        toast.success(t('toasts.processingStarted', { count: data.processed }) + '\n' + sourcesNames, {
          duration: 5000,
        });

        // Refetch sources para garantir que o status está atualizado
        console.log('🔄 Fazendo refetch das fontes após processamento...');
        await refetch();
      } else {
        toast.success(t('toasts.embeddingsStarted'));
      }

      // Limpar IDs
      setUploadedSourceIds([]);
    } catch (error) {
      console.error('❌ Error calling process-embeddings-queue:', error);
      toast.error(t('toasts.processingError'));
    } finally {
      setProcessingEmbeddings(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSource) return;

    try {
      await deleteSource(deletingSource.id);
      toast.success(t('toasts.fileRemoved', { filename: deletingSource.name }));
      setDeletingSource(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(t('toasts.fileRemoveError'));
    }
  };

  const handleRenameConfirm = async () => {
    if (!renamingSource || !newSourceName.trim()) return;

    try {
      await updateDoc(doc(db, 'sources', renamingSource.id), {
        name: newSourceName.trim()
      });

      await refetch();
      toast.success(t('toasts.fileRenamed'));
      setRenamingSource(null);
      setNewSourceName('');
    } catch (error) {
      console.error("Rename error:", error);
      toast.error(t('toasts.fileRenameError'));
    }
  };

  if (!projectId) {
    return (
      <div className="h-full w-full flex flex-col bg-muted/50 rounded-3xl p-4 border border-border overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-muted-foreground">Selecione um projeto para ver as fontes</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-card rounded-3xl border border-border overflow-hidden">
      {/* Banda colorida do topo */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#0891B2] to-[#7CB342]" />

      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.jpg,.jpeg,.png,.doc,.docx,.ppt,.pptx"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Header */}
        <div className="bg-muted/40 rounded-2xl mb-4 p-4 border border-border flex-shrink-0">
          {/* Linha 1: Título e botão expand */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-foreground">{t('sources.title')}</h3>
            <button
              onClick={() => setIsFullscreen(true)}
              className="hidden md:flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Expandir"
            >
              <span className="material-symbols-outlined text-[20px]">expand_content</span>
            </button>
          </div>

          {/* Linha 2: Botões Upload e Processar Dados */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload
            </Button>
            <Button
              size="sm"
              onClick={processEmbeddings}
              disabled={processingEmbeddings || sources.filter(s => s.status !== 'ready' || s.embeddings_status === 'pending').length === 0}
              className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-950 hover:to-blue-900 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {processingEmbeddings ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('sources.processingAction')}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t('sources.processData')}
                </>
              )}
            </Button>
          </div>

          {/* File size info */}
          <p className="text-xs text-gray-500 mt-2">
            {t('sources.maxSize')}
          </p>
        </div>

        {/* Sources List - Com altura mínima 0 para permitir scroll correto */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm">{t('sources.noSources')}</p>
              <p className="text-gray-400 text-xs mt-1">
                {t('sources.uploadToStart')}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-2 pb-2">
              {sources.map((source, index) => (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted transition-colors"
                >
                  {/* Checkbox de seleção */}
                  {source.status === 'ready' && (
                    <Checkbox
                      checked={selectedSources.has(source.id)}
                      onCheckedChange={(checked) => handleSourceToggle(source.id, checked as boolean)}
                    />
                  )}

                  {/* Nome da fonte */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">
                      {source.name}
                    </h3>
                  </div>

                  {/* Menu de ações */}
                  <div className="relative z-30 pointer-events-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="p-2 hover:bg-border rounded-lg transition-opacity"
                        >
                          <MoreVertical className="w-5 h-5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48 z-[100] pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                        sideOffset={5}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setRenamingSource({ id: source.id, currentName: source.name });
                            setNewSourceName(source.name);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          {t('contentPanel.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setDeletingSource({ id: source.id, name: source.name });
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('contentPanel.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deletingSource !== null} onOpenChange={(open) => !open && setDeletingSource(null)}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-foreground">
                Excluir Fonte?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir "{deletingSource?.name}"? Esta ação não pode ser desfeita e todos os conteúdos gerados a partir desta fonte serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel className="rounded-xl border-gray-300 hover:bg-muted text-muted-foreground">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rename Dialog */}
        <Dialog open={renamingSource !== null} onOpenChange={(open) => {
          if (!open) {
            setRenamingSource(null);
            setNewSourceName('');
          }
        }}>
          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-foreground">
                {t('sources.renameSource')}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t('contentPanel.enterNewName', { name: renamingSource?.currentName })}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameConfirm();
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0891B2] focus:border-transparent"
                placeholder="Novo nome"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRenamingSource(null);
                  setNewSourceName('');
                }}
                className="rounded-xl"
              >
                {t('contentPanel.cancel')}
              </Button>
              <Button
                onClick={handleRenameConfirm}
                disabled={!newSourceName.trim()}
                className="rounded-xl bg-[#0891B2] hover:bg-[#0891B2]/90"
              >
                {t('contentPanel.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Success Modal */}
        <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="rounded-full bg-gradient-to-r from-[#0891B2] to-[#7CB342] p-3">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
              </div>
              <DialogTitle className="text-xl font-semibold text-foreground text-center">
                {t('sources.uploadSuccess')}
              </DialogTitle>
              <DialogDescription className="text-center text-muted-foreground">
                {uploadedSourceIds.length === 1
                  ? t('sources.uploadSuccessSingle')
                  : t('sources.uploadSuccessMultiple', { count: uploadedSourceIds.length })}
                {" "}
                {t('sources.enableSearch')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-center gap-3">
              <Button
                onClick={processEmbeddings}
                disabled={processingEmbeddings}
                className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-[0_8px_30px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_rgba(8,145,178,0.4),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.3)] transition-all duration-300 px-6 backdrop-blur-xl border-2 border-white/40 relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.3)_100%)] before:opacity-70 after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.6),transparent_60%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500 hover:scale-[1.05] [box-shadow:0_2px_4px_rgba(255,255,255,0.3)_inset,0_8px_30px_rgba(0,0,0,0.15)] hover:[box-shadow:0_2px_8px_rgba(255,255,255,0.4)_inset,0_15px_40px_rgba(8,145,178,0.4)]"
              >
                {processingEmbeddings ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin relative z-10" />
                    <span className="relative z-10">{t('sources.processingAction')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                    <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t('sources.processFiles')}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fullscreen Dialog */}
        {!isFullscreenMode && (
          <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
            <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !max-h-none !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
              <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-muted">
                <div className="flex items-center justify-between p-6 border-b bg-background">
                  <h2 className="text-2xl font-bold text-foreground">{t('sources.title')}</h2>
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
                  <SourcesPanel projectId={projectId} onSelectedSourcesChange={onSelectedSourcesChange} isFullscreenMode={true} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
