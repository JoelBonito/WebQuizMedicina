import { useState } from 'react';
import { SourcesPanel } from './SourcesPanel';
import { ContentPanel } from './ContentPanel';
import { RightPanel } from './RightPanel';
import { FileText, BookOpen, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

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
      <div className="flex flex-col h-full">
        {/* Cabeçalho fixo com tabs */}
        <div className="sticky top-16 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="px-4 py-3">
            <h1 className="text-lg font-semibold truncate mb-3">{projectName}</h1>

            <div className="grid w-full grid-cols-3 border-b border-gray-200">
              {/* Tab Fontes */}
              <button
                onClick={() => setActiveTab('fontes')}
                className={`
                  flex flex-col items-center gap-1 py-3 relative transition-colors
                  ${activeTab === 'fontes' ? 'text-[#0891B2]' : 'text-gray-500'}
                `}
              >
                <FileText className="h-5 w-5" />
                <span className="text-xs font-medium">Fontes</span>

                {/* Indicador ativo */}
                {activeTab === 'fontes' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#0891B2] rounded-t-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>

              {/* Tab Estudo */}
              <button
                onClick={() => setActiveTab('estudo')}
                className={`
                  flex flex-col items-center gap-1 py-3 relative transition-colors
                  ${activeTab === 'estudo' ? 'text-[#7C3AED]' : 'text-gray-500'}
                `}
              >
                <BookOpen className="h-5 w-5" />
                <span className="text-xs font-medium">Estudo</span>

                {/* Indicador ativo */}
                {activeTab === 'estudo' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#7C3AED] rounded-t-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>

              {/* Tab Chat */}
              <button
                onClick={() => setActiveTab('chat')}
                className={`
                  flex flex-col items-center gap-1 py-3 relative transition-colors
                  ${activeTab === 'chat' ? 'text-[#EC4899]' : 'text-gray-500'}
                `}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-xs font-medium">Chat</span>

                {/* Indicador ativo */}
                {activeTab === 'chat' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-[#EC4899] rounded-t-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo de cada tab em tela inteira */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'fontes' && (
            <div className="h-full overflow-auto">
              <SourcesPanel
                projectId={projectId}
                onSelectedSourcesChange={handleSelectedSourcesChange}
              />
            </div>
          )}

          {activeTab === 'estudo' && (
            <div className="h-full overflow-auto">
              <ContentPanel
                projectId={projectId}
                selectedSourceIds={selectedSourceIds}
              />
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="h-full overflow-auto">
              <RightPanel projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
