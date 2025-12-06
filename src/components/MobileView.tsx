import { useState } from "react";
import { SourcesPanel } from "./SourcesPanel";
import { ContentPanel } from "./ContentPanel";
import { RightPanel } from "./RightPanel";
import { MobileNavigation } from "./MobileNavigation";

interface MobileViewProps {
  projectId: string | null;
  selectedSourceIds: string[];
  onSelectedSourcesChange: (sourceIds: string[]) => void;
}

export function MobileView({
  projectId,
  selectedSourceIds,
  onSelectedSourcesChange
}: MobileViewProps) {
  const [activeTab, setActiveTab] = useState<'sources' | 'studio' | 'chat'>('studio');

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Content Area - with bottom padding for navigation and safe area */}
      <div className="flex-1 overflow-hidden" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        {/* Sources Panel */}
        <div className={activeTab === 'sources' ? 'h-full' : 'hidden'}>
          <div className="h-full p-3">
            <SourcesPanel
              projectId={projectId}
              onSelectedSourcesChange={onSelectedSourcesChange}
            />
          </div>
        </div>

        {/* Studio Panel (ContentPanel) */}
        <div className={activeTab === 'studio' ? 'h-full' : 'hidden'}>
          <div className="h-full p-3">
            <ContentPanel
              projectId={projectId}
              selectedSourceIds={selectedSourceIds}
            />
          </div>
        </div>

        {/* Chat Panel (RightPanel) */}
        <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}>
          <div className="h-full p-3">
            <RightPanel projectId={projectId} />
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <MobileNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
