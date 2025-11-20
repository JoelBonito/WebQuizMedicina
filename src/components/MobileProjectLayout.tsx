import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SourcesPanel } from './SourcesPanel';
import { ContentPanel } from './ContentPanel';
import { RightPanel } from './RightPanel';
import { FileText, BookOpen, MessageSquare } from 'lucide-react';

interface MobileProjectLayoutProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

/**
 * Layout mobile otimizado para iPad/iPhone
 * Exibe Fontes, Estudo e Chat em tabs de tela inteira
 */
export function MobileProjectLayout({ projectId, projectName, onBack }: MobileProjectLayoutProps) {
  const [activeTab, setActiveTab] = useState<string>('fontes');
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const handleSelectedSourcesChange = (sourceIds: string[]) => {
    setSelectedSourceIds(sourceIds);
  };

  return (
    <div className="h-screen flex flex-col bg-background pt-16">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        {/* Cabeçalho fixo com tabs */}
        <div className="sticky top-16 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="px-4 py-3">
            <h1 className="text-lg font-semibold truncate mb-3">{projectName}</h1>

            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger
                value="fontes"
                className="flex flex-col items-center gap-1 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <FileText className="h-5 w-5" />
                <span className="text-xs">Fontes</span>
              </TabsTrigger>

              <TabsTrigger
                value="estudo"
                className="flex flex-col items-center gap-1 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <BookOpen className="h-5 w-5" />
                <span className="text-xs">Estudo</span>
              </TabsTrigger>

              <TabsTrigger
                value="chat"
                className="flex flex-col items-center gap-1 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-xs">Chat</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Conteúdo de cada tab em tela inteira */}
        <div className="flex-1 overflow-hidden">
          <TabsContent
            value="fontes"
            className="h-full m-0 data-[state=inactive]:hidden"
          >
            <div className="h-full overflow-auto">
              <SourcesPanel
                projectId={projectId}
                onSelectedSourcesChange={handleSelectedSourcesChange}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="estudo"
            className="h-full m-0 data-[state=inactive]:hidden"
          >
            <div className="h-full overflow-auto">
              <ContentPanel
                projectId={projectId}
                selectedSourceIds={selectedSourceIds}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="chat"
            className="h-full m-0 data-[state=inactive]:hidden"
          >
            <div className="h-full overflow-auto">
              <RightPanel projectId={projectId} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
