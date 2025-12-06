import { useState } from "react";
import { Plus, BookOpen, Trash2, Edit, ChevronRight, Loader2, X, BarChart3 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { motion } from "motion/react";
import { ProjectStats } from "./ProjectStats";
import { useProjectStats } from "../hooks/useProjectStats";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from "sonner";

interface DashboardProps {
  onSelectSubject: (subjectId: string) => void;
}

interface ProjectCardProps {
  project: { id: string; name: string; created_at: string };
  index: number;
  onSelect: (id: string) => void;
  onEdit: (project: { id: string; name: string }) => void;
  onDelete: (project: { id: string; name: string }) => void;
  onViewStats: (project: { id: string; name: string }) => void;
}

const formatDate = (date: any) => {
  if (!date) return "Data desconhecida";

  // Handle Firestore Timestamp
  if (date && typeof date.toDate === 'function') {
    return date.toDate().toLocaleDateString("pt-BR");
  }

  // Handle serialized Timestamp (seconds)
  if (date && typeof date.seconds === 'number') {
    return new Date(date.seconds * 1000).toLocaleDateString("pt-BR");
  }

  // Handle standard Date object or string
  try {
    return new Date(date).toLocaleDateString("pt-BR");
  } catch (e) {
    return "Data inválida";
  }
};

const ProjectCard = ({ project, index, onSelect, onEdit, onDelete, onViewStats }: ProjectCardProps) => {
  const { stats } = useProjectStats(project.id);

  return (
    <motion.div
      key={project.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group relative"
    >
      <div className="bg-card rounded-2xl p-6 border border-border hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col">
        {/* Icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] flex items-center justify-center shadow-lg">
            <BookOpen className="w-7 h-7 text-white" />
          </div>

          {/* Action buttons - show on hover */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={(e) => {
                e.stopPropagation();
                onViewStats({ id: project.id, name: project.name });
              }}
            >
              <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onEdit({ id: project.id, name: project.name });
              }}
            >
              <Edit className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
              onClick={(e) => {
                e.stopPropagation();
                onDelete({ id: project.id, name: project.name });
              }}
            >
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1" onClick={() => onSelect(project.id)}>
          <h3 className="text-lg font-semibold text-foreground mb-2">{project.name}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Criado em {formatDate(project.created_at)}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="outline" className="rounded-lg text-primary border-primary/30 bg-primary/10 dark:bg-primary/20">
              {stats.totalSources} Fontes
            </Badge>
            <Badge variant="outline" className="rounded-lg text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              {stats.totalQuizzes} Quiz
            </Badge>
            <Badge variant="outline" className="rounded-lg text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
              {stats.totalFlashcards} Cards
            </Badge>
            {stats.totalSummaries > 0 && (
              <Badge variant="outline" className="rounded-lg text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950">
                {stats.totalSummaries} Resumos
              </Badge>
            )}
            {stats.quizAccuracy > 0 && (
              <Badge variant="outline" className="rounded-lg text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
                {stats.quizAccuracy}% acerto
              </Badge>
            )}
          </div>
        </div>

        {/* Footer - Open button */}
        <Button
          variant="ghost"
          className="w-full justify-between rounded-xl hover:bg-primary/10 text-muted-foreground font-medium"
          onClick={() => onSelect(project.id)}
        >
          Abrir matéria
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export function Dashboard({ onSelectSubject }: DashboardProps) {
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null);
  const [statsProject, setStatsProject] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleAddProject = async () => {
    if (!formData.name.trim()) {
      toast.error("Digite um nome para a matéria");
      return;
    }

    try {
      setSubmitting(true);
      const newProject = await createProject(formData.name.trim());
      toast.success("Matéria criada com sucesso!");
      setIsAddDialogOpen(false);
      setFormData({ name: "" });

      // Abrir o projeto recém-criado automaticamente
      if (newProject?.id) {
        onSelectSubject(newProject.id);
      }
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
    <div className="min-h-screen bg-background relative">
      {/* Header Flutuante */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Minhas Matérias</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie seus estudos e materiais</p>
          </div>
          <Button
            onClick={openAddDialog}
            className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg px-5 py-2.5"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nova Matéria
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Content */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-[#E0F2FE] to-[#F0F9FF] flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-[#0891B2]" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                Nenhuma matéria ainda
              </h3>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Crie sua primeira matéria para começar a organizar seus estudos de medicina
              </p>
              <Button
                onClick={openAddDialog}
                className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg px-6 py-3"
              >
                <Plus className="w-5 h-5 mr-2" />
                Criar Primeira Matéria
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={index}
                  onSelect={onSelectSubject}
                  onEdit={openEditDialog}
                  onDelete={setDeletingProject}
                  onViewStats={setStatsProject}
                />
              ))}
            </div>
          )}
        </div>
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
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-xl font-semibold text-foreground">
              {editingProject ? "Editar Matéria" : "Criar Nova Matéria"}
            </DialogTitle>
            <button
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingProject(null);
                setFormData({ name: "" });
              }}
              className="text-gray-400 hover:text-muted-foreground transition-colors"
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
              <Label htmlFor="name" className="text-sm font-medium text-muted-foreground">
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
                className="rounded-xl border-gray-300 focus:border-[#0891B2]"
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
              className="rounded-xl border-gray-300 hover:bg-muted text-muted-foreground"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={editingProject ? handleEditProject : handleAddProject}
              disabled={!formData.name.trim() || submitting}
              className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white shadow-lg"
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
            <AlertDialogTitle className="text-xl font-semibold text-foreground">
              Excluir Matéria?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir a matéria "{deletingProject?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="rounded-xl border-gray-300 hover:bg-muted text-muted-foreground">
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

      {/* Project Stats Modal */}
      {statsProject && (
        <ProjectStats
          projectId={statsProject.id}
          projectName={statsProject.name}
          open={true}
          onClose={() => setStatsProject(null)}
        />
      )}
    </div>
  );
}
