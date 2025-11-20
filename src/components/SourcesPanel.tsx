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
import { supabase } from "../lib/supabase";

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
  const extension = parts.length > 1 ? parts.pop() : '';
  const nameWithoutExt = parts.join('.');

  if (nameWithoutExt.length > maxLength - extension.length - 4) {
    const truncated = nameWithoutExt.substring(0, maxLength - extension.length - 4);
    return `${truncated}...${extension ? '.' + extension : ''}`;
  }

  return name;
};

export function SourcesPanel({ projectId, onSelectedSourcesChange, isFullscreenMode = false }: SourcesPanelProps) {
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

  // Initialize all sources as selected by default
  useEffect(() => {
    if (sources.length > 0) {
      const readySources = sources.filter(s => s.status === 'ready');
      const readyIds = readySources.map(s => s.id);

      // Add any new ready sources to the selection (keep existing selections)
      setSelectedSources(prev => {
        const newSelected = new Set(prev);
        readyIds.forEach(id => newSelected.add(id));
        return newSelected;
      });

      // Notify parent of all selected sources
      const allSelected = new Set(selectedSources);
      readyIds.forEach(id => allSelected.add(id));
      onSelectedSourcesChange?.(Array.from(allSelected));
    }
  }, [sources]);

  const handleSourceToggle = (sourceId: string, checked: boolean) => {
    const newSelected = new Set(selectedSources);
    if (checked) {
      newSelected.add(sourceId);
    } else {
      newSelected.delete(sourceId);
    }
    setSelectedSources(newSelected);
    onSelectedSourcesChange?.(Array.from(newSelected));
  };

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!projectId) {
      toast.error("Selecione um projeto primeiro");
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
    ];

    const uploadedIds: string[] = [];
    let successCount = 0;

    for (const file of files) {
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|md|mp3|wav|m4a|jpg|jpeg|png)$/i)) {
        toast.error(`Tipo de arquivo não suportado: ${file.name}`);
        continue;
      }

      try {
        const source = await uploadSource(file);
        if (source) {
          uploadedIds.push(source.id);
          successCount++;
        }
        toast.success(`${file.name} enviado com sucesso!`);
      } catch (error) {
        console.error("Upload error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        toast.error(`Erro ao enviar ${file.name}: ${errorMessage}`, {
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

  const addSourcesSummaryToChat = async () => {
    if (!projectId || !user) return;

    try {
      // Buscar fontes processadas
      const processedSources = sources.filter(s => uploadedSourceIds.includes(s.id));

      if (processedSources.length === 0) return;

      // Gerar resumo das fontes
      const sourcesText = processedSources.map(s => `📄 **${s.name}**`).join('\n');

      const summaryMessage = `✨ **Novas fontes adicionadas ao seu projeto!**\n\n${sourcesText}\n\n${processedSources.length} ${processedSources.length === 1 ? 'fonte processada' : 'fontes processadas'} e ${processedSources.length === 1 ? 'pronta' : 'prontas'} para consulta. Você pode fazer perguntas sobre ${processedSources.length === 1 ? 'este conteúdo' : 'estes conteúdos'} agora!`;

      // Preparar dados para inserção
      const insertData = {
        project_id: projectId,
        user_id: user.id,
        role: 'system',
        content: summaryMessage,
      };

      console.log('📝 Tentando inserir mensagem de sistema:', insertData);
      console.log('📝 User:', user);

      // Inserir mensagem de sistema no chat (usando estrutura correta: role + content)
      const { data, error } = await supabase.from('chat_messages').insert(insertData).select();

      if (error) {
        console.error('❌ Supabase error inserting summary:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        throw error;
      }

      console.log('✅ Resumo das fontes adicionado ao chat:', data);

      console.log('✅ Resumo das fontes adicionado ao chat');
    } catch (error) {
      console.error('❌ Error adding sources summary to chat:', error);
      // Não mostrar erro ao usuário, é uma feature nice-to-have
    }
  };

  const processEmbeddings = async () => {
    setProcessingEmbeddings(true);

    try {
      console.log(`🚀 Iniciando processamento de embeddings para ${uploadedSourceIds.length} arquivos`);

      // Chamar a Edge Function para processar embeddings
      const { data, error } = await supabase.functions.invoke('process-embeddings-queue', {
        body: { max_items: 10 }
      });

      if (error) {
        console.error('❌ Error processing embeddings:', error);
        toast.error('Erro ao processar embeddings. Tente novamente.');
        return;
      }

      console.log('✅ Embeddings processing result:', data);

      // Fechar modal e mostrar sucesso
      setShowSuccessModal(false);

      if (data?.processed > 0) {
        toast.success(`Processamento iniciado! ${data.processed} arquivo(s) sendo processado(s).`);

        // Refetch sources para garantir que o status está atualizado
        console.log('🔄 Fazendo refetch das fontes após processamento...');
        await refetch();

        // Adicionar resumo automático ao chat após processamento bem-sucedido
        await addSourcesSummaryToChat();
      } else {
        toast.success('Processamento de embeddings iniciado com sucesso!');
      }

      // Limpar IDs
      setUploadedSourceIds([]);
    } catch (error) {
      console.error('❌ Error calling process-embeddings-queue:', error);
      toast.error('Erro ao iniciar processamento. Tente novamente.');
    } finally {
      setProcessingEmbeddings(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSource) return;

    try {
      await deleteSource(deletingSource.id);
      toast.success(`${deletingSource.name} removido com sucesso`);
      setDeletingSource(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Erro ao remover arquivo");
    }
  };

  const handleRenameConfirm = async () => {
    if (!renamingSource || !newSourceName.trim()) return;

    try {
      const { error } = await supabase
        .from('sources')
        .update({ name: newSourceName.trim() })
        .eq('id', renamingSource.id);

      if (error) throw error;

      await refetch();
      toast.success("Nome alterado com sucesso");
      setRenamingSource(null);
      setNewSourceName('');
    } catch (error) {
      console.error("Rename error:", error);
      toast.error("Erro ao renomear arquivo");
    }
  };

  if (!projectId) {
    return (
      <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200 overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Selecione um projeto para ver as fontes</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl border border-gray-200 overflow-hidden">
      {/* Banda colorida do topo */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#0891B2] to-[#7CB342]" />

      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.jpg,.jpeg,.png"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Header */}
        <div className="glass-dark rounded-2xl mb-4 p-4 border border-gray-200 flex-shrink-0">
          {/* Linha 1: Título e botão expand */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Fontes</h3>
            <button
              onClick={() => setIsFullscreen(true)}
              className="hidden md:flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
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
              disabled={processingEmbeddings || sources.filter(s => s.status !== 'ready').length === 0}
              className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-800 hover:from-blue-950 hover:to-blue-900 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {processingEmbeddings ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Processar Dados
                </>
              )}
            </Button>
          </div>

          {/* File size info */}
          <p className="text-xs text-gray-500 mt-2">
            Tamanho máximo: 50 MB por arquivo
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
              <p className="text-gray-500 text-sm">Nenhuma fonte adicionada</p>
              <p className="text-gray-400 text-xs mt-1">
                Envie arquivos para começar
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-2 pb-2">
              {sources.map((source, index) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className="glass-hover glass-dark rounded-2xl p-4 border border-gray-200"
              >
                <div className="flex items-start gap-3">
                  {source.status === 'ready' && (
                    <Checkbox
                      checked={selectedSources.has(source.id)}
                      onCheckedChange={(checked) => handleSourceToggle(source.id, checked as boolean)}
                      className="mt-1"
                    />
                  )}
                  <div className="mt-1">{getFileIcon(source.type)}</div>
                  <div className="flex-1 min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm text-gray-900 cursor-default mb-2">
                          {truncateFileName(source.name)}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{source.name}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex flex-wrap gap-2">
                      {getStatusBadge(source.status)}
                      {generatedCounts[source.id]?.quiz > 0 && (
                        <Badge
                          variant="secondary"
                          className="rounded-lg bg-[#F0F9FF] text-[#0891B2] border-[#BAE6FD] text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {generatedCounts[source.id].quiz} Quiz
                        </Badge>
                      )}
                      {generatedCounts[source.id]?.flashcards > 0 && (
                        <Badge
                          variant="secondary"
                          className="rounded-lg bg-blue-50 text-blue-700 border-blue-200 text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {generatedCounts[source.id].flashcards} Cards
                        </Badge>
                      )}
                      {generatedCounts[source.id]?.summaries > 0 && (
                        <Badge
                          variant="secondary"
                          className="rounded-lg bg-[#F1F8E9] text-[#7CB342] border-[#D4E157] text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {generatedCounts[source.id].summaries} Resumos
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingSource({ id: source.id, currentName: source.name });
                          setNewSourceName(source.name);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setDeletingSource({ id: source.id, name: source.name });
                        }}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Deletar
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
            <AlertDialogTitle className="text-xl font-semibold text-gray-900">
              Excluir Fonte?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600">
              Tem certeza que deseja excluir "{deletingSource?.name}"? Esta ação não pode ser desfeita e todos os conteúdos gerados a partir desta fonte serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700">
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
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Renomear Fonte
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Digite o novo nome para "{renamingSource?.currentName}"
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
              Cancelar
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={!newSourceName.trim()}
              className="rounded-xl bg-[#0891B2] hover:bg-[#0891B2]/90"
            >
              Salvar
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
            <DialogTitle className="text-xl font-semibold text-gray-900 text-center">
              Upload Concluído com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-center text-gray-600">
              {uploadedSourceIds.length === 1
                ? "Seu arquivo foi enviado com sucesso."
                : `${uploadedSourceIds.length} arquivos foram enviados com sucesso.`}
              {" "}
              Clique no botão abaixo para processar os arquivos e habilitar a busca semântica.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-3">
            <Button
              onClick={processEmbeddings}
              disabled={processingEmbeddings}
              className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6"
            >
              {processingEmbeddings ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Processar Arquivos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Dialog */}
      {!isFullscreenMode && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !m-0 !rounded-none !p-0 overflow-hidden supports-[height:100dvh]:!h-dvh">
            <div className="h-screen supports-[height:100dvh]:h-dvh w-full flex flex-col bg-gray-50">
              <div className="flex items-center justify-between p-6 border-b bg-white">
                <h2 className="text-2xl font-bold text-gray-900">Fontes</h2>
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
