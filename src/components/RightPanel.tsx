import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { MessageSquare, TrendingUp } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { DifficultiesPanel } from "./DifficultiesPanel";

interface RightPanelProps {
  projectId: string | null;
}

const PANEL_TABS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-700',
  },
  {
    id: 'difficulties',
    label: 'Dificuldades',
    icon: TrendingUp,
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-600',
    textColor: 'text-orange-700',
  },
];

export function RightPanel({ projectId }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState("chat");

  return (
    <div className="h-full w-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        {/* Tabs List - Melhorado com cores */}
        <TabsList className="glass-dark border border-gray-200 p-1 mb-4 rounded-2xl h-auto">
          {PANEL_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.icon;

            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={`
                  rounded-xl transition-all duration-300 flex items-center gap-2 px-4 py-2
                  ${isActive
                    ? `${tab.bgColor} shadow-md border border-gray-200`
                    : 'hover:bg-gray-50'
                  }
                `}
              >
                <TabIcon className={`
                  w-4 h-4 transition-colors
                  ${isActive ? tab.iconColor : 'text-gray-400'}
                `} />
                <span className={`
                  font-medium transition-colors
                  ${isActive ? tab.textColor : 'text-gray-600'}
                `}>
                  {tab.label}
                </span>
              </TabsTrigger>
            );
          })}
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
