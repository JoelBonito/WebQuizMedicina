import { ArrowLeft, LogOut, User, Languages, Palette, BarChart3, BookOpen } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Logo } from "./Logo";
import { ProfileSettings } from "./ProfileSettings";
import { LanguageSettings } from "./LanguageSettings";
import { ThemeSettings } from "./ThemeSettings";
import { useState } from "react";

interface NavbarProps {
  onBackClick?: () => void;
  projectName?: string;
  projectId?: string | null;
  onViewStats?: () => void;
}

export function Navbar({ onBackClick, projectName, projectId, onViewStats }: NavbarProps) {
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Até logo!");
    }
  };

  const getUserInitials = () => {
    if (!user?.email) return "US";
    return user.email.substring(0, 2).toUpperCase();
  };

  const getUserName = () => {
    if (!user?.email) return "Usuário";
    return user.email.split("@")[0];
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 glass border-b border-gray-200">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {onBackClick && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackClick}
              className="rounded-xl hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <Logo
              variant="horizontal"
              className="h-12 w-auto"
            />
          </div>
        </div>

        {/* Project Name */}
        {projectName && (
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2">
            <div className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#0891B2] to-[#0891B2]/80 text-white shadow-[0_8px_30px_rgb(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(0,0,0,0.2)] hover:shadow-[0_15px_40px_rgba(8,145,178,0.4),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.3)] transition-all duration-300 flex items-center gap-2 backdrop-blur-xl border-2 border-white/40 relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.3)_100%)] before:opacity-70 after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.6),transparent_60%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500 [box-shadow:0_2px_4px_rgba(255,255,255,0.3)_inset,0_8px_30px_rgba(0,0,0,0.15)] hover:[box-shadow:0_2px_8px_rgba(255,255,255,0.4)_inset,0_15px_40px_rgba(8,145,178,0.4)]">
              <BookOpen className="w-4 h-4 relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
              <span className="font-medium relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{projectName}</span>
            </div>
            {projectId && onViewStats && (
              <button
                onClick={onViewStats}
                className="px-3 py-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_4px_20px_rgba(59,130,246,0.3)] hover:shadow-[0_8px_30px_rgba(59,130,246,0.5)] transition-all duration-300 flex items-center gap-1.5 hover:scale-105 border border-white/30 backdrop-blur-sm relative overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0)_50%)] before:opacity-70 group"
                title="Ver estatísticas"
              >
                <BarChart3 className="w-4 h-4 relative z-10 drop-shadow-md" />
                <span className="text-xs font-medium relative z-10 drop-shadow-sm">Estatísticas</span>
              </button>
            )}
          </div>
        )}

        {/* User Actions */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 p-1 rounded-xl hover:bg-gray-50 transition-colors">
                <Avatar className="w-10 h-10 ring-2 ring-[#0891B2] ring-offset-2 ring-offset-white">
                  <AvatarFallback className="bg-gradient-to-br from-[#0891B2] to-[#7CB342] text-white font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl bg-white">
              {/* User Info Header */}
              <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200">
                <Avatar className="w-12 h-12 ring-2 ring-[#0891B2]">
                  <AvatarFallback className="bg-gradient-to-br from-[#0891B2] to-[#7CB342] text-white font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {getUserName()}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1 px-2">
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer rounded-lg">
                  <User className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-700">Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLanguageOpen(true)} className="cursor-pointer rounded-lg">
                  <Languages className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-700">Idioma de Resposta</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setThemeOpen(true)} className="cursor-pointer rounded-lg">
                  <Palette className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-700">Aparência</span>
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator />

              {/* Logout */}
              <div className="py-1 px-2">
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Settings Dialogs */}
      <ProfileSettings open={profileOpen} onOpenChange={setProfileOpen} />
      <LanguageSettings open={languageOpen} onOpenChange={setLanguageOpen} />
      <ThemeSettings open={themeOpen} onOpenChange={setThemeOpen} />
    </nav>
  );
}
