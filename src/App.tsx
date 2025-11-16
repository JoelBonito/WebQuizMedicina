import { Navbar } from "./components/Navbar";
import { SourcesPanel } from "./components/SourcesPanel";
import { ContentPanel } from "./components/ContentPanel";
import { ChatPanel } from "./components/ChatPanel";

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Main Content */}
      <div className="pt-20 px-6 pb-6 h-screen">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Panel - Sources (25%) */}
          <div className="lg:col-span-3 h-full flex items-stretch">
            <SourcesPanel />
          </div>

          {/* Center Panel - Content (50%) */}
          <div className="lg:col-span-6 h-full flex items-stretch">
            <ContentPanel />
          </div>

          {/* Right Panel - Chat (25%) */}
          <div className="lg:col-span-3 h-full flex items-stretch">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}