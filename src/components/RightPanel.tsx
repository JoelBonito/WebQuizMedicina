import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { MessageSquare, TrendingUp } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { DifficultiesPanel } from "./DifficultiesPanel";

interface RightPanelProps {
  projectId: string | null;
}

export function RightPanel({ projectId }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState("chat");

  return (
    <div className="h-full w-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="glass-dark border border-gray-200 p-1 mb-4 rounded-2xl h-auto">
          <TabsTrigger
            value="chat"
            className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </TabsTrigger>
          <TabsTrigger
            value="difficulties"
            className="rounded-xl data-[state=active]:glass data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-gray-200 transition-all duration-300 flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Dificuldades</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 mt-0 h-full overflow-hidden">
          <ChatPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="difficulties" className="flex-1 mt-0 h-full overflow-hidden">
          <DifficultiesPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
