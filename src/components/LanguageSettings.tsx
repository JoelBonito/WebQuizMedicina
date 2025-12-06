import { useLanguage } from "../contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Languages, BookOpen, MessageSquare, Brain, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface LanguageSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LanguageSettings({ open, onOpenChange }: LanguageSettingsProps) {
  const { language, setLanguage, getLanguageName, isLoading } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);
  const [initialLanguage, setInitialLanguage] = useState(language);

  // Update initialLanguage ONLY when dialog opens (not when language changes)
  useEffect(() => {
    if (open) {
      setInitialLanguage(language);
    }
  }, [open]); // Removed 'language' from dependencies to prevent resetting on selection

  const hasChanges = language !== initialLanguage;

  const handleSave = async () => {
    if (!hasChanges) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);

    try {
      // setLanguage já salva no perfil
      const languageName = getLanguageName(language);
      toast.success(`Idioma atualizado para ${languageName}!`, {
        duration: 4000,
      });

      setTimeout(() => {
        onOpenChange(false);
        setIsSaving(false);
      }, 500);
    } catch (error) {
      toast.error('Erro ao salvar idioma');
      setIsSaving(false);
    }
  };

  const languages = [
    { value: "pt" as const, label: "Português (Brasil)", flag: "🇧🇷" },
    { value: "en" as const, label: "English", flag: "🇬🇧" },
    { value: "es" as const, label: "Español", flag: "🇪🇸" },
    { value: "fr" as const, label: "Français", flag: "🇫🇷" },
    { value: "de" as const, label: "Deutsch", flag: "🇩🇪" },
    { value: "it" as const, label: "Italiano", flag: "🇮🇹" },
    { value: "ja" as const, label: "日本語", flag: "🇯🇵" },
    { value: "zh" as const, label: "中文", flag: "🇨🇳" },
    { value: "ru" as const, label: "Русский", flag: "🇷🇺" },
    { value: "ar" as const, label: "العربية", flag: "🇸🇦" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-background rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl flex items-center gap-2">
            <Languages className="w-5 h-5 text-primary" />
            Idioma de Resposta
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Escolha o idioma para todo o conteúdo gerado pela IA
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Language Selection */}
          <div className="space-y-4">
            <Label className="text-muted-foreground font-medium">
              Selecione seu idioma preferido
            </Label>
            <RadioGroup value={language} onValueChange={(value) => setLanguage(value as any)}>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {languages.map((lang) => (
                  <div
                    key={lang.value}
                    className={`flex items-center space-x-3 rounded-xl p-4 border-2 transition-colors cursor-pointer ${
                      language === lang.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                    onClick={() => setLanguage(lang.value)}
                  >
                    <RadioGroupItem value={lang.value} id={lang.value} className="text-primary" />
                    <Label
                      htmlFor={lang.value}
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <span className="text-foreground font-medium">{lang.label}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </div>

          {/* Info Box */}
          <div className="glass-dark rounded-xl p-4 border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <h4 className="text-foreground font-semibold mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Como funciona?
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Este idioma será usado para gerar todo o conteúdo:
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span>Perguntas de Quiz</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Brain className="w-4 h-4 text-accent" />
                <span>Flashcards</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4 text-primary" />
                <span>Resumos</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4 text-accent" />
                <span>Respostas do Chat</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Seus arquivos de origem podem estar em qualquer idioma. O conteúdo gerado
              sempre estará no idioma selecionado.
            </p>
          </div>

          {/* Current Selection */}
          <div className="glass rounded-xl p-3 border border-border">
            <p className="text-sm text-muted-foreground">
              Idioma atual:{" "}
              <span className="font-semibold text-foreground">{getLanguageName(language)}</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white relative"
              disabled={isSaving || isLoading || !hasChanges}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  Salvar
                  {hasChanges && (
                    <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-background/80 animate-pulse" />
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
