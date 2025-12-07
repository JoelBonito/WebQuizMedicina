import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { theme, setTheme, effectiveTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(theme);
  const isFirstOpen = useRef(true);

  // SEMPRE sincronizar selectedTheme com theme quando dialog abre
  useEffect(() => {
    if (open) {
      setSelectedTheme(theme);
      isFirstOpen.current = false;
    }
  }, [open, theme]);

  // Também sincronizar quando theme muda externamente (mesmo com dialog fechado)
  useEffect(() => {
    setSelectedTheme(theme);
  }, [theme]);

  const handleSave = () => {
    setTheme(selectedTheme);
    onOpenChange(false);
  };

  const previewEffectiveTheme = selectedTheme === "system" ? effectiveTheme : selectedTheme;

  const themes = [
    {
      value: "light" as const,
      label: t("theme.light"),
      description: t("theme.lightDesc"),
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: t("theme.dark"),
      description: t("theme.darkDesc"),
      icon: Moon,
    },
    {
      value: "system" as const,
      label: t("theme.system"),
      description: t("theme.systemDesc"),
      icon: Monitor,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-background rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground text-xl flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#0891B2]" />
            {t("theme.title")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("theme.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Theme Selection */}
          <div className="space-y-4">
            <Label className="text-muted-foreground font-medium">{t("theme.selectTheme")}</Label>
            <RadioGroup value={selectedTheme} onValueChange={(value) => setSelectedTheme(value as any)}>
              <div className="space-y-3">
                {themes.map((themeOption) => {
                  const Icon = themeOption.icon;
                  return (
                    <div
                      key={themeOption.value}
                      className={`flex items-center space-x-3 rounded-xl p-4 border-2 transition-colors cursor-pointer ${selectedTheme === themeOption.value
                        ? "border-[#0891B2] bg-[#F0F9FF] dark:bg-[#0891B2]/20"
                        : "border-border hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      onClick={() => setSelectedTheme(themeOption.value)}
                    >
                      <RadioGroupItem
                        value={themeOption.value}
                        id={themeOption.value}
                        className="text-[#0891B2]"
                      />
                      <Label htmlFor={themeOption.value} className="flex items-start gap-3 flex-1 cursor-pointer">
                        <div
                          className={`mt-0.5 p-2 rounded-lg ${selectedTheme === themeOption.value
                            ? "bg-[#0891B2] text-white"
                            : "bg-muted text-muted-foreground"
                            }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-foreground font-medium">{themeOption.label}</p>
                          <p className="text-sm text-muted-foreground">{themeOption.description}</p>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </RadioGroup>
          </div>

          {/* Preview */}
          <div className="bg-card rounded-xl p-4 border border-border">
            <h4 className="text-foreground font-semibold mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[#0891B2]" />
              {t("theme.preview")}
            </h4>
            <div className="flex items-center gap-3">
              <div
                className={`flex-1 rounded-lg p-4 border-2 ${previewEffectiveTheme === "light"
                  ? "bg-white border-gray-200"
                  : "bg-slate-950 border-slate-800"
                  }`}
              >
                <div
                  className={`space-y-2 ${previewEffectiveTheme === "light" ? "text-gray-900" : "text-gray-100"
                    }`}
                >
                  <div className="h-2 bg-gradient-to-r from-[#0891B2] to-[#7CB342] rounded w-3/4" />
                  <div
                    className={`h-2 rounded w-1/2 ${previewEffectiveTheme === "light" ? "bg-gray-200" : "bg-gray-800"
                      }`}
                  />
                  <div
                    className={`h-2 rounded w-2/3 ${previewEffectiveTheme === "light" ? "bg-gray-200" : "bg-gray-800"
                      }`}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {selectedTheme === "system"
                ? t("theme.currentlyUsing", { theme: previewEffectiveTheme === "light" ? t("theme.light") : t("theme.dark") })
                : t("theme.currentTheme", { theme: selectedTheme === "light" ? t("theme.light") : t("theme.dark") })}
            </p>
          </div>

          {/* Info */}
          {selectedTheme === "system" && (
            <div className="glass rounded-xl p-3 border border-border">
              <p className="text-sm text-muted-foreground">
                {t("theme.systemInfo")}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
              {t("profile.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={selectedTheme === theme}
              className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
            >
              {t("profile.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
