import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Mail, Calendar, Loader2, Upload, Languages, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "../hooks/useUserPreferences";

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGES = [
  { value: 'pt', label: 'Português (Brasil)' },
  { value: 'pt-PT', label: 'Português (Portugal)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
];

export function ProfileSettings({ open, onOpenChange }: ProfileSettingsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile, loading, updating, updateProfile, uploadAvatar } = useProfile();
  const { preferences, updateAutoRemove } = useUserPreferences();
  const [displayName, setDisplayName] = useState("");
  const [responseLanguage, setResponseLanguage] = useState("pt");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update displayName and responseLanguage when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || user?.email?.split("@")[0] || "");
      setResponseLanguage(profile.response_language || "pt");
    }
  }, [profile, user?.email]);

  // Check if there are unsaved changes
  const savedDisplayName = profile?.display_name || user?.email?.split("@")[0] || "";
  const savedLanguage = profile?.response_language || "pt";

  const hasUnsavedChanges = profile && (
    displayName.trim() !== savedDisplayName ||
    responseLanguage !== savedLanguage
  );

  const getUserInitials = () => {
    if (!user?.email) return "US";
    return user.email.substring(0, 2).toUpperCase();
  };

  const getJoinDate = () => {
    if (!profile?.created_at) return "N/A";

    // Handle Firestore timestamps
    const timestamp = profile.created_at;
    let date: Date;

    if (timestamp?.toDate) {
      // Firestore Timestamp object
      date = timestamp.toDate();
    } else if (timestamp?.seconds) {
      // Firestore Timestamp-like object with seconds
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp) {
      // Regular date or string
      date = new Date(timestamp);
    } else {
      return "N/A";
    }

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(t('toasts.invalidImage'));
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('toasts.imageTooLarge'));
      return;
    }

    const { error } = await uploadAvatar(file);
    if (error) {
      toast.error(t('toasts.photoUploadError'));
    } else {
      toast.success(t('toasts.photoUpdated'));
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error(t('toasts.displayNameEmpty'));
      return;
    }

    console.log('Salvando perfil:', {
      display_name: displayName.trim(),
      response_language: responseLanguage
    });

    const { data, error } = await updateProfile({
      display_name: displayName.trim(),
      response_language: responseLanguage
    });

    console.log('Resultado do save:', { data, error });

    if (error) {
      toast.error(t('toasts.profileUpdateError', { error: error.message || 'Erro desconhecido' }));
      console.error('Erro detalhado:', error);
    } else {
      toast.success(t('toasts.success.updated'), {
        duration: 4000,
      });
      // Não fechar o dialog imediatamente para mostrar o feedback visual
      setTimeout(() => {
        onOpenChange(false);
      }, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl">
            {t('profile.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('profile.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24 ring-4 ring-primary ring-offset-4 ring-offset-white">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt="Avatar" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold text-2xl">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {t('profile.changePhoto')}
            </Button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-foreground font-medium">
                {t('profile.displayName')}
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-lg bg-background border-border text-foreground"
                placeholder={t('profile.displayName')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {t('profile.email')}
              </Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="rounded-lg bg-muted border-border text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                {t('profile.emailReadonly')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language" className="text-foreground font-medium flex items-center gap-2">
                <Languages className="w-4 h-4" />
                {t('profile.responseLanguage')}
              </Label>
              <Select value={responseLanguage} onValueChange={setResponseLanguage}>
                <SelectTrigger id="language" className="rounded-lg bg-background border-border text-foreground">
                  <SelectValue placeholder={t('language.selectLanguage')} />
                </SelectTrigger>
                <SelectContent
                  className="bg-background rounded-lg border-border max-h-[300px] overflow-y-auto"
                  position="popper"
                  sideOffset={5}
                >
                  {LANGUAGES.map((lang) => (
                    <SelectItem
                      key={lang.value}
                      value={lang.value}
                      className="text-foreground focus:bg-muted focus:text-foreground cursor-pointer"
                    >
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t('profile.languageDescription')}
                </p>
                {profile?.response_language && (
                  <p className="text-xs text-primary font-medium">
                    {t('profile.languageSaved', {
                      language: LANGUAGES.find(l => l.value === profile.response_language)?.label || 'Português'
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoRemove" className="text-foreground font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {t('profile.autoRemoveDifficulties')}
              </Label>
              <div className="flex items-center justify-between glass rounded-lg p-3 border border-border">
                <div className="flex-1">
                  <p className="text-sm text-foreground font-medium">
                    {t('profile.autoRemoveDescription')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('profile.autoRemoveSubtext')}
                  </p>
                </div>
                <Switch
                  id="autoRemove"
                  checked={preferences.autoRemoveDifficulties}
                  onCheckedChange={(checked) => {
                    updateAutoRemove(checked);
                    toast.success(t('toasts.success.updated'), { duration: 2000 });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t('profile.memberSince')}
              </Label>
              <div className="glass rounded-lg p-3 border border-border">
                <p className="text-sm text-foreground">{getJoinDate()}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 w-full">
            <p className="text-xs text-muted-foreground italic">
              * {t('toasts.success.saved').replace('!', '')}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-lg text-foreground border-border hover:bg-muted"
                disabled={updating}
              >
                {t('profile.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white relative disabled:opacity-50"
                disabled={updating || loading || !hasUnsavedChanges}
                title={!hasUnsavedChanges ? t('toasts.success.saved') : t('profile.save')}
              >
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('sources.processing')}...
                  </>
                ) : (
                  <>
                    {t('profile.save')}
                    {hasUnsavedChanges && (
                      <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-background/80 animate-pulse" />
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
