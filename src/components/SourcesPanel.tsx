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
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { motion } from "motion/react";
import { useSources } from "../hooks/useSources";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface SourcesPanelProps {
  projectId: string | null;
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

export function SourcesPanel({ projectId }: SourcesPanelProps) {
  const { sources, loading, uploading, uploadSource, deleteSource } =
    useSources(projectId);
  const [isDragging, setIsDragging] = useState(false);
  const [generatedCounts, setGeneratedCounts] = useState<
    Record<string, { quiz: number; flashcards: number; summaries: number }>
  >({});
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

    for (const file of files) {
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|md|mp3|wav|m4a|jpg|jpeg|png)$/i)) {
        toast.error(`Tipo de arquivo não suportado: ${file.name}`);
        continue;
      }

      try {
        await uploadSource(file);
        toast.success(`${file.name} enviado com sucesso!`);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteSource(id);
      toast.success(`${name} removido com sucesso`);
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
                  <div className="mt-1">{getFileIcon(source.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate mb-2">
                      {source.name}
                    </p>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-gray-100"
                      >
                        <Trash2 className="w-4 h-4 text-gray-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(source.id, source.name)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
