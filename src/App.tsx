import { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { SourcesPanel } from "./components/SourcesPanel";
import { ContentPanel } from "./components/ContentPanel";
import { RightPanel } from "./components/RightPanel";
import { ResizableLayout } from "./components/ResizableLayout";
import { MobileView } from "./components/MobileView";
import { Dashboard } from "./components/Dashboard";
import { Auth } from "./components/Auth";
import { useAuth } from "./hooks/useAuth";
import { useIsMobile } from "./hooks/useMediaQuery";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";

export default function App() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [view, setView] = useState<"dashboard" | "project">("dashboard");

  // Debug logging for selectedProjectId changes
  useEffect(() => {
    console.log('[App] Selected Project ID changed:', selectedProjectId);
  }, [selectedProjectId]);

  const handleSelectProject = (projectId: string) => {
    console.log('[App] handleSelectProject called with:', projectId);
    setSelectedProjectId(projectId);
    setView("project");
  };

  const handleBackToDashboard = () => {
    console.log('[App] handleBackToDashboard called - clearing projectId');
    setView("dashboard");
    setSelectedProjectId(null);
  };

  const handleSelectedSourcesChange = (sourceIds: string[]) => {
    setSelectedSourceIds(sourceIds);
  };

  if (loading) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <div className="min-h-screen bg-white flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
          </div>
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <Auth />
          <Toaster />
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  if (view === "dashboard") {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <Navbar />
          <div className="min-h-screen bg-white pt-16">
            <Dashboard onSelectSubject={handleSelectProject} />
          </div>
          <Toaster />
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <div className="min-h-screen bg-white">
          <Navbar onBackClick={handleBackToDashboard} />

          {/* Main Content */}
          {isMobile ? (
            // Mobile View with Bottom Navigation
            <div className="pt-16 h-screen overflow-hidden">
              <MobileView
                projectId={selectedProjectId}
                selectedSourceIds={selectedSourceIds}
                onSelectedSourcesChange={handleSelectedSourcesChange}
              />
            </div>
          ) : (
            // Desktop View with Resizable Panels
            <div className="pt-20 px-6 pb-6 h-screen overflow-hidden">
              <div className="h-full overflow-hidden gap-4">
                <ResizableLayout
                  leftPanel={
                    <SourcesPanel
                      projectId={selectedProjectId}
                      onSelectedSourcesChange={handleSelectedSourcesChange}
                    />
                  }
                  centerPanel={
                    <ContentPanel
                      projectId={selectedProjectId}
                      selectedSourceIds={selectedSourceIds}
                    />
                  }
                  rightPanel={
                    <RightPanel projectId={selectedProjectId} />
                  }
                />
              </div>
            </div>
          )}
        </div>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
  );
}
