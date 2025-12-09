import { ArrowLeft, LogOut, User, BookOpen, Shield, Palette, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
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
import { ThemeSettings } from "./ThemeSettings";
import { HelpModal } from "./HelpModal";
import { useTranslation } from "react-i18next";
import { useState } from "react";

interface NavbarProps {
  onBackClick?: () => void;
  projectName?: string;
  onAdminClick?: () => void;
  onTutorialClick?: () => void; // Callback para abrir tutorial da página atual
}

export function Navbar({ projectName, onBackClick, onAdminClick, onTutorialClick }: NavbarProps) {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Debug: log profile data
  // console.log('[Navbar] Profile data:', profile);
  // console.log('[Navbar] Profile loading:', profileLoading);
  // console.log('[Navbar] Profile role:', profile?.role);

  const isAdmin = profile?.role === 'admin';
  // console.log('[Navbar] isAdmin:', isAdmin);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error(t('toasts.logoutError'));
    } else {
      toast.success(t('toasts.logoutSuccess'));
    }
  };

  const getUserInitials = () => {
    // 1. Prioridade: Profile Display Name (Configurado pelo usuário)
    if (profile?.display_name) {
      return profile.display_name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }

    // 2. Fallback: Email (Auth)
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }

    return "US";
  };

  const getUserName = () => {
    // 1. Prioridade: Profile Display Name
    if (profile?.display_name) {
      return profile.display_name;
    }

    // 2. Fallback: Email
    if (user?.email) {
      return user.email.split("@")[0];
    }

    return "Usuário";
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo and Project Name */}
        <div className="flex items-center gap-3">
          {onBackClick && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackClick}
              className="rounded-xl hover:bg-muted"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <Logo
              variant="horizontal"
              className="h-12 w-auto"
            />
            {projectName && (
              <div className="flex items-center gap-2 ml-2 border-l-2 border-border pl-4 h-8">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground italic font-medium text-lg">{projectName}</span>
              </div>
            )}
          </div>
        </div>



        {/* User Actions */}
        <div className="flex items-center gap-4">
          {/* Help Button (SOS) */}
          <button
            onClick={() => setHelpOpen(true)}
            className="relative w-9 h-9 rounded-full bg-orange-50 dark:bg-orange-950 ring-2 ring-orange-400 hover:ring-orange-500 transition-all flex items-center justify-center"
            title={t('help.button.tooltip')}
          >
            <AlertTriangle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
            {/* Badge BETA */}
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full leading-none">
              {t('help.beta.badge')}
            </span>
          </button>

          {/* Tutorial Button */}
          <button
            onClick={onTutorialClick}
            disabled={!onTutorialClick}
            className="w-9 h-9 rounded-full bg-primary/10 ring-2 ring-primary hover:ring-[#0891B2] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('tutorial.common.helpButton')}
          >
            <span className="text-xl font-bold text-primary">?</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 p-1 rounded-xl hover:bg-muted transition-colors">
                <Avatar className="w-10 h-10 ring-2 ring-[#0891B2] ring-offset-2 ring-offset-background">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={getUserName()} className="object-cover" />}
                  <AvatarFallback className="bg-gradient-to-br from-[#0891B2] to-[#7CB342] text-white font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl bg-card border-border">
              {/* User Info Header */}
              <div className="flex items-center gap-3 px-3 py-3 border-b border-border">
                <Avatar className="w-12 h-12 ring-2 ring-[#0891B2]">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={getUserName()} className="object-cover" />}
                  <AvatarFallback className="bg-gradient-to-br from-[#0891B2] to-[#7CB342] text-white font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {getUserName()}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1 px-2">
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer rounded-lg">
                  <User className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('navbar.profile')}</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setThemeOpen(true)} className="cursor-pointer rounded-lg">
                  <Palette className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('navbar.appearance')}</span>
                </DropdownMenuItem>

                {/* Admin Button - Only visible for admins */}
                {isAdmin && onAdminClick && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onAdminClick} className="cursor-pointer rounded-lg bg-gradient-to-r from-[#0891B2]/10 to-[#7CB342]/10 hover:from-[#0891B2]/20 hover:to-[#7CB342]/20">
                      <Shield className="w-4 h-4 mr-2 text-[#0891B2]" />
                      <span className="text-[#0891B2] font-semibold">{t('navbar.adminDashboard')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.href = '/admin/bugs'} className="cursor-pointer rounded-lg">
                      <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                      <span className="text-foreground">{t('navbar.bugReports')}</span>
                    </DropdownMenuItem>
                  </>
                )}
              </div>

              <DropdownMenuSeparator />

              {/* Logout */}
              <div className="py-1 px-2">
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer rounded-lg">
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('navbar.logout')}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Settings Dialogs */}
      <ProfileSettings open={profileOpen} onOpenChange={setProfileOpen} />
      <ThemeSettings open={themeOpen} onOpenChange={setThemeOpen} />

      {/* Help Modal (moved from floating button) */}
      {helpOpen && (
        <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      )}
    </nav>
  );
}
