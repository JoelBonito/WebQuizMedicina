import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
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
import { Avatar, AvatarFallback } from "./ui/avatar";
import { User, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";

interface ProfileSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSettings({ open, onOpenChange }: ProfileSettingsProps) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    user?.email?.split("@")[0] || ""
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

  const handleSave = () => {
    // TODO: Implement profile update logic with Supabase
    toast.info("Atualização de perfil em desenvolvimento!");
    onOpenChange(false);
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
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-semibold text-2xl">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-gray-700"
              onClick={() => toast.info("Upload de foto em breve!")}
            >
              <User className="w-4 h-4 mr-2" />
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
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
            >
              Salvar alterações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
