import { MessageSquare, Maximize, X } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

interface RightPanelProps {
  projectId: string | null;
}

export function RightPanel({ projectId }: RightPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl border border-gray-200 overflow-hidden">
        {/* Banda colorida do topo */}
        <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 to-pink-500" />

        <div className="flex-1 overflow-hidden p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Chat</h3>
            </div>
            <button
              onClick={() => setIsFullscreen(true)}
              className="hidden md:flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Expandir"
            >
              <span className="material-symbols-outlined text-[20px]">expand_content</span>
            </button>
          </div>

          {/* Chat Panel */}
          <div className="h-[calc(100%-3.5rem)]">
            <ChatPanel projectId={projectId} />
          </div>
        </div>
      </div>

      {/* Expanded Dialog - 95% da tela */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] !p-0 rounded-2xl">
          <div className="h-full w-full flex flex-col bg-gray-50">
            <div className="flex items-center justify-between p-6 border-b bg-white flex-shrink-0">
              <h2 className="text-2xl font-bold text-gray-900">Chat</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsFullscreen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ChatPanel projectId={projectId} isFullscreenMode={true} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
