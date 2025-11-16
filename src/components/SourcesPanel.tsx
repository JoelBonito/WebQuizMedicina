import { FileText, Upload, Music, Image as ImageIcon, MoreVertical, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { motion } from "motion/react";

interface Source {
  id: string;
  name: string;
  type: "pdf" | "audio" | "text" | "image";
  generated: {
    quiz: number;
    flashcards: number;
    summaries: number;
  };
}

const mockSources: Source[] = [
  {
    id: "1",
    name: "Mecânica Quântica - Capítulo 1.pdf",
    type: "pdf",
    generated: { quiz: 12, flashcards: 24, summaries: 3 },
  },
  {
    id: "2",
    name: "Aula sobre Átomos.mp3",
    type: "audio",
    generated: { quiz: 8, flashcards: 16, summaries: 2 },
  },
  {
    id: "3",
    name: "Notas - Princípio da Incerteza.txt",
    type: "text",
    generated: { quiz: 5, flashcards: 10, summaries: 1 },
  },
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return <FileText className="w-5 h-5 text-red-500" />;
    case "audio":
      return <Music className="w-5 h-5 text-purple-500" />;
    case "image":
      return <ImageIcon className="w-5 h-5 text-blue-500" />;
    default:
      return <FileText className="w-5 h-5 text-gray-500" />;
  }
};

export function SourcesPanel() {
  return (
    <div className="h-full flex flex-col bg-gray-50/50 rounded-3xl p-4 border border-gray-200">
      {/* Header */}
      <div className="glass-dark rounded-2xl mb-4 p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900">Fontes</h3>
          <Button
            size="sm"
            className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        </div>

        {/* Upload Area */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all duration-300"
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-700">Arraste arquivos aqui</p>
          <p className="text-xs text-gray-500 mt-1">PDF, áudio, texto ou imagem</p>
        </motion.div>
      </div>

      {/* Sources List */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {mockSources.map((source, index) => (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              className="glass-hover glass-dark rounded-2xl p-4 cursor-pointer border border-gray-200"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getFileIcon(source.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate mb-2">{source.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {source.generated.quiz > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-lg bg-purple-50 text-purple-700 border-purple-200 text-xs"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {source.generated.quiz} Quiz
                      </Badge>
                    )}
                    {source.generated.flashcards > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-lg bg-blue-50 text-blue-700 border-blue-200 text-xs"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {source.generated.flashcards} Cards
                      </Badge>
                    )}
                    {source.generated.summaries > 0 && (
                      <Badge
                        variant="secondary"
                        className="rounded-lg bg-pink-50 text-pink-700 border-pink-200 text-xs"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {source.generated.summaries} Resumos
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-gray-100"
                >
                  <MoreVertical className="w-4 h-4 text-gray-600" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}