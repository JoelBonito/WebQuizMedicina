import { useState } from "react";
import { Plus, BookOpen, Trash2, Edit, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useProjects } from "../hooks/useProjects";
import { useAuth } from "../hooks/useAuth";
import { toast } from "sonner";
import { Navbar } from "./Navbar";

interface DashboardProps {
  onSelectSubject: (subjectId: string) => void;
}

export function Dashboard({ onSelectSubject }: DashboardProps) {
  const { user } = useAuth();
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleAddProject = async () => {
    if (!formData.name.trim()) {
      toast.error("Digite um nome para o projeto");
      return;
    }

    try {
      setSubmitting(true);
      await createProject(formData.name.trim());
      toast.success("Projeto criado com sucesso!");
      setIsAddDialogOpen(false);
      setFormData({ name: "" });
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Erro ao criar projeto");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditProject = async () => {
    if (!editingProject || !formData.name.trim()) {
      toast.error("Digite um nome para o projeto");
      return;
    }

    try {
      setSubmitting(true);
      await updateProject(editingProject.id, formData.name.trim());
      toast.success("Projeto atualizado!");
      setEditingProject(null);
      setFormData({ name: "" });
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Erro ao atualizar projeto");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) {
      return;
    }

    try {
      await deleteProject(id);
      toast.success("Projeto excluído");
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Erro ao excluir projeto");
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

  const colors = [
    "from-purple-500 to-pink-500",
    "from-green-500 to-emerald-500",
    "from-blue-500 to-cyan-500",
    "from-orange-500 to-red-500",
    "from-indigo-500 to-purple-500",
    "from-pink-500 to-rose-500",
  ];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white pt-16">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-gray-900">Meus Projetos</h1>
                  <p className="text-sm text-gray-600">
                    Olá, {user?.email?.split("@")[0]}! Gerencie seus estudos
                  </p>
                </div>
              </div>
              <Button
                onClick={openAddDialog}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Projeto
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhum projeto ainda
              </h3>
              <p className="text-gray-600 mb-6">
                Crie seu primeiro projeto para começar a estudar
              </p>
              <Button
                onClick={openAddDialog}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Projeto
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative"
                >
                  <div className="glass-dark rounded-3xl p-6 border border-gray-200 hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${
                          colors[index % colors.length]
                        } flex items-center justify-center shadow-lg`}
                      >
                        <BookOpen className="w-6 h-6 text-white" />
                      </div>
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
                            handleDeleteProject(project.id, project.name);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1" onClick={() => onSelectSubject(project.id)}>
                      <h3 className="text-gray-900 mb-2">{project.name}</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Criado em {new Date(project.created_at).toLocaleDateString("pt-BR")}
                      </p>

                      {/* Stats - TODO: Get real counts */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge className="rounded-lg bg-blue-50 text-blue-700 border-blue-200">
                          0 Fontes
                        </Badge>
                        <Badge className="rounded-lg bg-purple-50 text-purple-700 border-purple-200">
                          0 Quiz
                        </Badge>
                        <Badge className="rounded-lg bg-pink-50 text-pink-700 border-pink-200">
                          0 Cards
                        </Badge>
                      </div>
                    </div>

                    {/* Footer */}
                    <Button
                      variant="ghost"
                      className="w-full justify-between rounded-xl hover:bg-gray-100 text-gray-700"
                      onClick={() => onSelectSubject(project.id)}
                    >
                      Abrir projeto
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

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
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Editar Projeto" : "Novo Projeto"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Projeto</Label>
                <Input
                  id="name"
                  placeholder="Ex: Farmacologia Geral"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      editingProject ? handleEditProject() : handleAddProject();
                    }
                  }}
                  className="rounded-xl"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setEditingProject(null);
                  setFormData({ name: "" });
                }}
                className="rounded-xl"
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={editingProject ? handleEditProject : handleAddProject}
                disabled={!formData.name.trim() || submitting}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {editingProject ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
