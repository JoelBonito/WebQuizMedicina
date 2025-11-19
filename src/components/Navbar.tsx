import { ArrowLeft, LogOut, Settings, User } from "lucide-react";
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

interface NavbarProps {
  onBackClick?: () => void;
  projectName?: string;
}

export function Navbar({ onBackClick, projectName }: NavbarProps) {
  const { user, signOut } = useAuth();

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
            <img 
              src="/logo.png" 
              alt="QuizMed Logo" 
              className="w-10 h-10 object-contain"
            />
            {!onBackClick ? (
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Minhas Matérias</h1>
                <p className="text-xs text-gray-600">Gerencie seus estudos e materiais</p>
              </div>
            ) : (
              <span className="text-xl font-medium bg-gradient-to-r from-[#2B3E6F] to-[#0891B2] bg-clip-text text-transparent">
                QuizMed
              </span>
            )}
          </div>
        </div>

        {/* Project Name */}
        {projectName && (
          <div className="absolute left-1/2 transform -translate-x-1/2">
            <div className="glass-dark px-4 py-2 rounded-2xl border border-gray-200">
              <span className="text-gray-800">{projectName}</span>
            </div>
          </div>
        )}

        {/* User Actions */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                <Avatar className="w-10 h-10 ring-2 ring-primary ring-offset-2 ring-offset-white">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {getUserName()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user?.email}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl bg-white">
              {/* User Info Header */}
              <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200">
                <Avatar className="w-12 h-12 ring-2 ring-primary">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold">
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
                <DropdownMenuItem onClick={() => toast.info("Perfil em desenvolvimento!")} className="cursor-pointer rounded-lg">
                  <User className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-700">Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Configurações em breve!")} className="cursor-pointer rounded-lg">
                  <Settings className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-gray-700">Configurações</span>
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
    </nav>
  );
}
