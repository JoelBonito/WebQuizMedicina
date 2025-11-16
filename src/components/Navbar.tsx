import { Settings, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 glass border-b border-gray-200">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-gray-900 tracking-tight">EduAI</span>
        </div>

        {/* Project Name */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <div className="glass-dark px-4 py-2 rounded-2xl border border-gray-200">
            <span className="text-gray-800">Introdução à Física Quântica</span>
          </div>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-gray-100 transition-all duration-300"
          >
            <Settings className="w-5 h-5 text-gray-700" />
          </Button>
          <Avatar className="w-9 h-9 ring-2 ring-purple-200 ring-offset-2 ring-offset-white">
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
              US
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </nav>
  );
}