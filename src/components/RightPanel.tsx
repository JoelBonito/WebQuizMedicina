import { MessageSquare } from "lucide-react";
import { ChatPanel } from "./ChatPanel";

interface RightPanelProps {
  projectId: string | null;
}

export function RightPanel({ projectId }: RightPanelProps) {
  return (
    <div className="h-full w-full flex flex-col bg-gray-50/50 rounded-3xl border border-gray-200 overflow-hidden">
      {/* Banda colorida do topo */}
      <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 to-pink-500" />

      <div className="flex-1 overflow-hidden p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 px-2">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">Chat</h3>
        </div>

        {/* Chat Panel */}
        <div className="h-[calc(100%-3rem)] overflow-hidden">
          <ChatPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
