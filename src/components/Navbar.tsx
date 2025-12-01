import { ArrowLeft, LogOut, User, Languages, Palette, BookOpen, Shield } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
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
  onAdminClick?: () => void;
}

export function Navbar({ onBackClick, projectName, onAdminClick }: NavbarProps) {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  // Debug: log profile data
  // console.log('[Navbar] Profile data:', profile);
  // console.log('[Navbar] Profile loading:', profileLoading);
  // console.log('[Navbar] Profile role:', profile?.role);

  const isAdmin = profile?.role === 'admin';
  // console.log('[Navbar] isAdmin:', isAdmin);

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
        {/* Logo and Project Name */}
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
            {projectName && (
              <div className="flex items-center gap-2 ml-2 border-l-2 border-gray-200 pl-4 h-8">
                <BookOpen className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900 italic font-medium text-lg">{projectName}</span>
              </div>
            )}
          </div>
        </div>



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

                {/* Admin Button - Only visible for admins */}
                {isAdmin && onAdminClick && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onAdminClick} className="cursor-pointer rounded-lg bg-gradient-to-r from-[#0891B2]/10 to-[#7CB342]/10 hover:from-[#0891B2]/20 hover:to-[#7CB342]/20">
                      <Shield className="w-4 h-4 mr-2 text-[#0891B2]" />
                      <span className="text-[#0891B2] font-semibold">Admin Dashboard</span>
                    </DropdownMenuItem>
                  </>
                )}
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
