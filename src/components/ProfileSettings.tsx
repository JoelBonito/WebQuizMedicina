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
import { User, Mail, Calendar, Loader2, Upload, Languages, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "./ui/switch";
import { useTheme } from "../contexts/ThemeContext";
import { useUserPreferences } from "../hooks/useUserPreferences";

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGES = [
  { value: 'pt', label: 'Português' },
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
  const { user } = useAuth();
  const { profile, loading, updating, updateProfile, uploadAvatar } = useProfile();
  const { theme, setTheme } = useTheme();
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
  const hasUnsavedChanges = profile && (
    displayName.trim() !== (profile.display_name || user?.email?.split("@")[0] || "") ||
    responseLanguage !== profile.response_language
  );

  const getUserInitials = () => {
    if (!user?.email) return "US";
    return user.email.substring(0, 2).toUpperCase();
  };

  const getJoinDate = () => {
    if (!user?.created_at) return "N/A";
    return new Date(user.created_at).toLocaleDateString("pt-BR", {
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
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    const { error } = await uploadAvatar(file);
    if (error) {
      toast.error('Erro ao fazer upload da foto');
    } else {
      toast.success('Foto atualizada com sucesso!');
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error('Nome de exibição não pode estar vazio');
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
      toast.error('Erro ao atualizar perfil: ' + (error.message || 'Erro desconhecido'));
      console.error('Erro detalhado:', error);
    } else {
      const selectedLang = LANGUAGES.find(l => l.value === responseLanguage)?.label;
      toast.success(`Perfil atualizado! Idioma: ${selectedLang}`, {
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
      <DialogContent className="sm:max-w-[500px] bg-white rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 text-xl">
            Meu Perfil
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Visualize e edite suas informações pessoais
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
              className="rounded-lg text-gray-700"
              onClick={() => fileInputRef.current?.click()}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Alterar foto
            </Button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-gray-700 font-medium">
                Nome de exibição
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-lg bg-white border-gray-200 text-gray-900"
                placeholder="Como deseja ser chamado?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="rounded-lg bg-gray-50 border-gray-200 text-gray-600"
              />
              <p className="text-xs text-gray-500">
                Email não pode ser alterado
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language" className="text-gray-700 font-medium flex items-center gap-2">
                <Languages className="w-4 h-4" />
                Idioma de resposta
              </Label>
              <Select value={responseLanguage} onValueChange={setResponseLanguage}>
                <SelectTrigger id="language" className="rounded-lg bg-white border-gray-200 text-gray-900">
                  <SelectValue placeholder="Selecione um idioma" />
                </SelectTrigger>
                <SelectContent
                  className="bg-white rounded-lg border-gray-200 max-h-[300px] overflow-y-auto"
                  position="popper"
                  sideOffset={5}
                >
                  {LANGUAGES.map((lang) => (
                    <SelectItem
                      key={lang.value}
                      value={lang.value}
                      className="text-gray-900 focus:bg-gray-100 focus:text-gray-900 cursor-pointer"
                    >
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  Idioma usado nas respostas geradas pela IA
                </p>
                {profile?.response_language && (
                  <p className="text-xs text-primary font-medium">
                    Idioma salvo: {LANGUAGES.find(l => l.value === profile.response_language)?.label || 'Português'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme" className="text-gray-700 font-medium flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Aparência
              </Label>
              <Select value={theme} onValueChange={(value) => setTheme(value as any)}>
                <SelectTrigger id="theme" className="rounded-lg bg-white border-gray-200 text-gray-900">
                  <SelectValue placeholder="Selecione um tema" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-lg border-gray-200">
                  <SelectItem value="light" className="text-gray-900 focus:bg-gray-100 cursor-pointer">
                    ☀️ Modo Claro
                  </SelectItem>
                  <SelectItem value="dark" className="text-gray-900 focus:bg-gray-100 cursor-pointer">
                    🌙 Modo Escuro
                  </SelectItem>
                  <SelectItem value="system" className="text-gray-900 focus:bg-gray-100 cursor-pointer">
                    💻 Sistema
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Escolha como a interface será exibida
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="autoRemove" className="text-gray-700 font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Auto-remoção de Dificuldades
              </Label>
              <div className="flex items-center justify-between glass rounded-lg p-3 border border-gray-200">
                <div className="flex-1">
                  <p className="text-sm text-gray-700 font-medium">
                    Remover automaticamente ao dominar
                  </p>
                  <p className="text-xs text-gray-500">
                    Remove tópicos da lista de dificuldades após dominá-los
                  </p>
                </div>
                <Switch
                  id="autoRemove"
                  checked={preferences.autoRemoveDifficulties}
                  onCheckedChange={updateAutoRemove}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Membro desde
              </Label>
              <div className="glass rounded-lg p-3 border border-gray-200">
                <p className="text-sm text-gray-700">{getJoinDate()}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
              disabled={updating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white relative"
              disabled={updating || loading || !hasUnsavedChanges}
            >
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  Salvar alterações
                  {hasUnsavedChanges && (
                    <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-white/80 animate-pulse" />
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
