import { useTheme } from "../contexts/ThemeContext";
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
import { Sun, Moon, Monitor, Palette } from "lucide-react";

interface ThemeSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeSettings({ open, onOpenChange }: ThemeSettingsProps) {
  const { theme, setTheme, effectiveTheme } = useTheme();

  const handleSave = () => {
    onOpenChange(false);
  };

  const themes = [
    {
      value: "light" as const,
      label: "Modo Claro",
      description: "Interface clara sempre ativa",
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: "Modo Escuro",
      description: "Interface escura sempre ativa",
      icon: Moon,
    },
    {
      value: "system" as const,
      label: "Modo do Sistema",
      description: "Sincroniza com as preferências do dispositivo",
      icon: Monitor,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#0891B2]" />
            Aparência
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Personalize como o QuizMed aparece para você
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Theme Selection */}
          <div className="space-y-4">
            <Label className="text-gray-700 font-medium">
              Selecione o tema
            </Label>
            <RadioGroup value={theme} onValueChange={(value) => setTheme(value as any)}>
              <div className="space-y-3">
                {themes.map((themeOption) => {
                  const Icon = themeOption.icon;
                  return (
                    <div
                      key={themeOption.value}
                      className={`flex items-center space-x-3 rounded-xl p-4 border-2 transition-colors cursor-pointer ${
                        theme === themeOption.value
                          ? "border-[#0891B2] bg-[#F0F9FF]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setTheme(themeOption.value)}
                    >
                      <RadioGroupItem
                        value={themeOption.value}
                        id={themeOption.value}
                        className="text-[#0891B2]"
                      />
                      <Label
                        htmlFor={themeOption.value}
                        className="flex items-start gap-3 flex-1 cursor-pointer"
                      >
                        <div className={`mt-0.5 p-2 rounded-lg ${
                          theme === themeOption.value
                            ? "bg-[#0891B2] text-white"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium">{themeOption.label}</p>
                          <p className="text-sm text-gray-500">{themeOption.description}</p>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </RadioGroup>
          </div>

          {/* Preview */}
          <div className="glass-dark rounded-xl p-4 border border-[#BAE6FD] bg-gradient-to-br from-[#F0F9FF] to-white">
            <h4 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[#0891B2]" />
              Pré-visualização
            </h4>
            <div className="flex items-center gap-3">
              <div className={`flex-1 rounded-lg p-4 border-2 ${
                effectiveTheme === "light"
                  ? "bg-white border-gray-200"
                  : "bg-gray-900 border-gray-700"
              }`}>
                <div className={`space-y-2 ${
                  effectiveTheme === "light" ? "text-gray-900" : "text-gray-100"
                }`}>
                  <div className="h-2 bg-gradient-to-r from-[#0891B2] to-[#7CB342] rounded w-3/4"></div>
                  <div className={`h-2 rounded w-1/2 ${
                    effectiveTheme === "light" ? "bg-gray-200" : "bg-gray-700"
                  }`}></div>
                  <div className={`h-2 rounded w-2/3 ${
                    effectiveTheme === "light" ? "bg-gray-200" : "bg-gray-700"
                  }`}></div>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {theme === "system"
                ? `Atualmente usando: ${effectiveTheme === "light" ? "Claro" : "Escuro"} (do sistema)`
                : `Tema atual: ${theme === "light" ? "Claro" : "Escuro"}`}
            </p>
          </div>

          {/* Info */}
          {theme === "system" && (
            <div className="glass rounded-xl p-3 border border-gray-200">
              <p className="text-sm text-gray-600">
                💡 O tema mudará automaticamente baseado nas configurações do seu dispositivo
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
