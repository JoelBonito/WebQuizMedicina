import { useState } from "react";
import { Navbar } from "./components/Navbar";
import { SourcesPanel } from "./components/SourcesPanel";
import { ContentPanel } from "./components/ContentPanel";
import { RightPanel } from "./components/RightPanel";
import { Dashboard } from "./components/Dashboard";
import { Auth } from "./components/Auth";
import { useAuth } from "./hooks/useAuth";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const { user, loading } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [view, setView] = useState<"dashboard" | "project">("dashboard");

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setView("project");
  };

  const handleBackToDashboard = () => {
    setView("dashboard");
    setSelectedProjectId(null);
  };

  const handleSelectedSourcesChange = (sourceIds: string[]) => {
    setSelectedSourceIds(sourceIds);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Auth />
        <Toaster />
      </>
    );
  }

  if (view === "dashboard") {
    return (
      <>
        <div className="min-h-screen bg-white">
          <Dashboard onSelectSubject={handleSelectProject} />
        </div>
        <Toaster />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-white">
        <Navbar onBackClick={handleBackToDashboard} />

        {/* Main Content */}
        <div className="pt-20 px-6 pb-6 h-screen overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
            {/* Left Panel - Sources (25%) */}
            <div className="lg:col-span-3 h-full flex items-stretch overflow-hidden">
              <SourcesPanel
                projectId={selectedProjectId}
                onSelectedSourcesChange={handleSelectedSourcesChange}
              />
            </div>

            {/* Center Panel - Content (50%) */}
            <div className="lg:col-span-6 h-full flex items-stretch overflow-hidden">
              <ContentPanel
                projectId={selectedProjectId}
                selectedSourceIds={selectedSourceIds}
              />
            </div>

            {/* Right Panel - Chat & Difficulties (25%) */}
            <div className="lg:col-span-3 h-full flex items-stretch overflow-hidden">
              <RightPanel projectId={selectedProjectId} />
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
