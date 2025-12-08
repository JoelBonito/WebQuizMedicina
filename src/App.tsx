import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useParams, useNavigate } from "react-router-dom";
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

// Dashboard Route Component
function DashboardRoute() {
  const navigate = useNavigate();

  const handleSelectProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

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

// Admin Route Component
function AdminRoute() {
  const navigate = useNavigate();

  const handleBackToDashboard = () => {
    navigate('/');
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

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

// Project Route Component
function ProjectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const isMobile = useIsMobile();
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);

  // Redirect se projectId não existe
  if (!projectId) {
    navigate('/');
    return null;
  }

  const handleBackToDashboard = () => {
    navigate('/');
  };

  const handleAdminClick = () => {
    navigate('/admin');
  };

  const handleSelectedSourcesChange = (sourceIds: string[]) => {
    setSelectedSourceIds(sourceIds);
  };

  // Busca o projeto atual
  const currentProject = projects.find(p => p.id === projectId);
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
              projectId={projectId}
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
                      projectId={projectId}
                      onSelectedSourcesChange={handleSelectedSourcesChange}
                    />
                  }
                  centerPanel={
                    <ContentPanel
                      projectId={projectId}
                      selectedSourceIds={selectedSourceIds}
                      onViewStats={() => setShowStats(true)}
                    />
                  }
                  rightPanel={
                    <RightPanel projectId={projectId} />
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Project Stats Modal */}
        {showStats && projectId && (
          <ProjectStats
            projectId={projectId}
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

// Inner app component that uses auth context
function AppContent() {
  const { user, loading } = useAuth();

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

  return (
    <Routes>
      <Route path="/" element={<DashboardRoute />} />
      <Route path="/project/:projectId" element={<ProjectRoute />} />
      <Route path="/admin" element={<AdminRoute />} />
    </Routes>
  );
}

// Main App component - wraps everything with providers
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <LanguageProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </LanguageProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
