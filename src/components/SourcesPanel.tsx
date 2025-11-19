import { useState, useRef, DragEvent, ChangeEvent, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { motion } from "motion/react";
import { useSources } from "../hooks/useSources";
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
import { supabase } from "../lib/supabase";

interface SourcesPanelProps {
  projectId: string | null;
  onSelectedSourcesChange?: (sourceIds: string[]) => void;
}

const getFileIcon = (type: string) => {
  if (type === "pdf") return <FileText className="w-5 h-5 text-red-500" />;
  if (["mp3", "wav", "m4a"].includes(type))
    return <Music className="w-5 h-5 text-purple-500" />;
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

export function SourcesPanel({ projectId, onSelectedSourcesChange }: SourcesPanelProps) {
  const { sources, loading, uploading, uploadSource, deleteSource } =
    useSources(projectId);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [deletingSource, setDeletingSource] = useState<{ id: string; name: string } | null>(null);
  const [generatedCounts, setGeneratedCounts] = useState<
    Record<string, { quiz: number; flashcards: number; summaries: number }>
  >({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadedSourceIds, setUploadedSourceIds] = useState<string[]>([]);
  const [processingEmbeddings, setProcessingEmbeddings] = useState(false);
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
      const allSourceIds = new Set(sources.filter(s => s.status === 'ready').map(s => s.id));
      setSelectedSources(allSourceIds);
      onSelectedSourcesChange?.(Array.from(allSourceIds));
    }
  }, [sources.length]);

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

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (!projectId) {
      toast.error("Selecione um projeto primeiro");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
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
        toast.error(`Erro ao enviar ${file.name}`);
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
    <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.mp3,.wav,.m4a,.jpg,.jpeg,.png"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Header */}
      <div className="glass-dark rounded-2xl mb-4 p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900">Fontes</h3>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload
          </Button>
        </div>

        {/* Upload Area */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`glass border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? "border-purple-500 bg-purple-100/50 scale-105"
              : "border-gray-300 hover:border-purple-400 hover:bg-purple-50/30"
          }`}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-700">
            {isDragging ? "Solte os arquivos aqui" : "Arraste arquivos aqui"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PDF, áudio, texto ou imagem
          </p>
        </motion.div>
      </div>

      {/* Sources List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
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
          <div className="space-y-3 pr-2">
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
                          className="rounded-lg bg-purple-50 text-purple-700 border-purple-200 text-xs"
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
                          className="rounded-lg bg-pink-50 text-pink-700 border-pink-200 text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {generatedCounts[source.id].summaries} Resumos
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSource({ id: source.id, name: source.name });
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </ScrollArea>

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

      {/* Upload Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-3">
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
              className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6"
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
    </div>
  );
}
