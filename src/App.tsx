import { useState, useEffect, lazy, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { useAuth } from "./hooks/useAuth";
import { useProjects } from "./hooks/useProjects";
import { useIsMobile } from "./hooks/useMediaQuery";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileProvider } from "./contexts/ProfileContext";
import "./lib/i18n"; // Initialize i18n

// Lazy load heavy components
const SourcesPanel = lazy(() => import("./components/SourcesPanel").then(module => ({ default: module.SourcesPanel })));
const ContentPanel = lazy(() => import("./components/ContentPanel").then(module => ({ default: module.ContentPanel })));
const RightPanel = lazy(() => import("./components/RightPanel").then(module => ({ default: module.RightPanel })));
const ResizableLayout = lazy(() => import("./components/ResizableLayout").then(module => ({ default: module.ResizableLayout })));
const MobileProjectLayout = lazy(() => import("./components/MobileProjectLayout").then(module => ({ default: module.MobileProjectLayout })));
const Dashboard = lazy(() => import("./components/Dashboard").then(module => ({ default: module.Dashboard })));
const Auth = lazy(() => import("./components/Auth").then(module => ({ default: module.Auth })));
const ProjectStats = lazy(() => import("./components/ProjectStats").then(module => ({ default: module.ProjectStats })));
const AdminDashboard = lazy(() => import("./components/AdminDashboard").then(module => ({ default: module.AdminDashboard })));



// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
  </div>
);

// Inner app component that uses auth context
function AppContent() {
  const { user, loading } = useAuth();
  const { projects } = useProjects();
  const isMobile = useIsMobile();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [view, setView] = useState<"dashboard" | "project" | "admin">("dashboard");
  const [showStats, setShowStats] = useState(false);

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

  const handleAdminClick = () => {
    console.log('[App] handleAdminClick called - navigating to admin');
    setView("admin");
    setSelectedProjectId(null);
  };

  const handleSelectedSourcesChange = (sourceIds: string[]) => {
    setSelectedSourceIds(sourceIds);
  };

  if (loading) {
    return <LoadingFallback />;
  }

  if (!user) {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          <Auth />
        </Suspense>
        <Toaster />
      </>
    );
  }

  if (view === "dashboard") {
    return (
      <>
        <Navbar onAdminClick={handleAdminClick} />
        <div className="min-h-screen bg-background pt-16">
          <Suspense fallback={<LoadingFallback />}>
            <Dashboard onSelectSubject={handleSelectProject} />
          </Suspense>
        </div>
        <Toaster />
      </>
    );
  }

  if (view === "admin") {
    return (
      <>
        <Navbar onBackClick={handleBackToDashboard} onAdminClick={handleAdminClick} />
        <div className="min-h-screen bg-background pt-16">
          <Suspense fallback={<LoadingFallback />}>
            <AdminDashboard />
          </Suspense>
        </div>
        <Toaster />
      </>
    );
  }

  // Busca o projeto atual
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectName = currentProject?.name || 'Matéria';

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        {isMobile ? (
          // Layout mobile com tabs em tela inteira
          <>
            <Navbar
              onBackClick={handleBackToDashboard}
              onAdminClick={handleAdminClick}
            />
            <MobileProjectLayout
              projectId={selectedProjectId!}
              projectName={projectName}
              onBack={handleBackToDashboard}
              onViewStats={() => setShowStats(true)}
            />
          </>
        ) : (
          // Layout desktop com 3 colunas
          <div className="min-h-screen bg-background">
            <Navbar
              onBackClick={handleBackToDashboard}
              projectName={projectName}
              onAdminClick={handleAdminClick}
            />

            {/* Main Content */}
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
                      onViewStats={() => setShowStats(true)}
                    />
                  }
                  rightPanel={
                    <RightPanel projectId={selectedProjectId} />
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Project Stats Modal */}
        {showStats && selectedProjectId && (
          <ProjectStats
            projectId={selectedProjectId}
            projectName={projectName}
            open={showStats}
            onClose={() => setShowStats(false)}
          />
        )}
      </Suspense>
      <Toaster />
    </>
  );
}

// Main App component - wraps everything with providers
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <LanguageProvider>
            <AppContent />
          </LanguageProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
