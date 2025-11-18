import { useState } from "react";
import { Plus, BookOpen, Trash2, Edit, ChevronRight, Loader2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useProjects } from "../hooks/useProjects";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";

interface DashboardProps {
  onSelectSubject: (subjectId: string) => void;
}

export function Dashboard({ onSelectSubject }: DashboardProps) {
  const { user } = useAuth();
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleAddProject = async () => {
    if (!formData.name.trim()) {
      toast.error("Digite um nome para a matéria");
      return;
    }

    try {
      setSubmitting(true);
      await createProject(formData.name.trim());
      toast.success("Matéria criada com sucesso!");
      setIsAddDialogOpen(false);
      setFormData({ name: "" });
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Erro ao criar matéria");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditProject = async () => {
    if (!editingProject || !formData.name.trim()) {
      toast.error("Digite um nome para a matéria");
      return;
    }

    try {
      setSubmitting(true);
      await updateProject(editingProject.id, formData.name.trim());
      toast.success("Matéria atualizada!");
      setEditingProject(null);
      setFormData({ name: "" });
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Erro ao atualizar matéria");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;

    try {
      await deleteProject(deletingProject.id);
      toast.success("Matéria excluída");
      setDeletingProject(null);
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Erro ao excluir matéria");
    }
  };

  const openAddDialog = () => {
    setFormData({ name: "" });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (project: { id: string; name: string }) => {
    setFormData({ name: project.name });
    setEditingProject(project);
  };

  return (
    <div className="min-h-screen bg-white relative">
      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Content */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-purple-500" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                Nenhuma matéria ainda
              </h3>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Crie sua primeira matéria para começar a organizar seus estudos de medicina
              </p>
              <Button
                onClick={openAddDialog}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg px-6 py-3"
              >
                <Plus className="w-5 h-5 mr-2" />
                Criar Primeira Matéria
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative"
                >
                  <div className="glass-dark rounded-2xl p-6 border border-gray-200 hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col">
                    {/* Icon */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                        <BookOpen className="w-7 h-7 text-white" />
                      </div>

                      {/* Edit/Delete buttons - show on hover */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog({ id: project.id, name: project.name });
                          }}
                        >
                          <Edit className="w-4 h-4 text-gray-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingProject({ id: project.id, name: project.name });
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1" onClick={() => onSelectSubject(project.id)}>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        Criado em {new Date(project.created_at).toLocaleDateString("pt-BR")}
                      </p>

                      {/* Stats */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge variant="outline" className="rounded-lg text-blue-600 border-blue-300 bg-blue-50">
                          0 Fontes
                        </Badge>
                        <Badge variant="outline" className="rounded-lg text-purple-600 border-purple-300 bg-purple-50">
                          0 Quiz
                        </Badge>
                        <Badge variant="outline" className="rounded-lg text-pink-600 border-pink-300 bg-pink-50">
                          0 Cards
                        </Badge>
                      </div>
                    </div>

                    {/* Footer - Open button */}
                    <Button
                      variant="ghost"
                      className="w-full justify-between rounded-xl hover:bg-purple-50 text-gray-700 font-medium"
                      onClick={() => onSelectSubject(project.id)}
                    >
                      Abrir matéria
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB - Floating Action Button */}
      <button
        onClick={openAddDialog}
        className="fixed bottom-8 right-8 w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 flex items-center justify-center z-50 group"
        aria-label="Nova Matéria"
      >
        <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Add/Edit Dialog */}
        <Dialog
          open={isAddDialogOpen || editingProject !== null}
          onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingProject(null);
              setFormData({ name: "" });
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <div className="flex items-center justify-between mb-2">
              <DialogTitle className="text-xl font-semibold text-gray-900">
                {editingProject ? "Editar Matéria" : "Criar Nova Matéria"}
              </DialogTitle>
              <button
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setEditingProject(null);
                  setFormData({ name: "" });
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <DialogDescription className="text-sm text-gray-500 sr-only">
              {editingProject
                ? "Atualize o nome da sua matéria de estudos."
                : "Dê um nome descritivo para organizar seus estudos de medicina."}
            </DialogDescription>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                  Nome da Matéria
                </Label>
                <Input
                  id="name"
                  placeholder="Ex: Farmacologia Geral, Anatomia Cardíaca..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && formData.name.trim()) {
                      editingProject ? handleEditProject() : handleAddProject();
                    }
                  }}
                  className="rounded-xl border-gray-300 focus:border-purple-500"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setEditingProject(null);
                  setFormData({ name: "" });
                }}
                className="rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700"
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={editingProject ? handleEditProject : handleAddProject}
                disabled={!formData.name.trim() || submitting}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {editingProject ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deletingProject !== null} onOpenChange={(open) => !open && setDeletingProject(null)}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-gray-900">
                Excluir Matéria?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-600">
                Tem certeza que deseja excluir a matéria "{deletingProject?.name}"? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel className="rounded-xl border-gray-300 hover:bg-gray-50 text-gray-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                className="rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
