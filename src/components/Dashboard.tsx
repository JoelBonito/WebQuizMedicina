import { useState } from "react";
import { Plus, BookOpen, Trash2, Edit, ChevronRight, Sparkles } from "lucide-react";
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
import { Textarea } from "./ui/textarea";

interface Subject {
  id: string;
  name: string;
  description: string;
  sources: number;
  quizzes: number;
  flashcards: number;
  color: string;
}

interface DashboardProps {
  onSelectSubject: (subjectId: string) => void;
}

const mockSubjects: Subject[] = [
  {
    id: "1",
    name: "Física Quântica",
    description: "Estudo dos fundamentos da mecânica quântica e suas aplicações",
    sources: 3,
    quizzes: 12,
    flashcards: 24,
    color: "from-purple-500 to-pink-500",
  },
  {
    id: "2",
    name: "Biologia Celular",
    description: "Estrutura e função das células, organelas e processos celulares",
    sources: 5,
    quizzes: 18,
    flashcards: 36,
    color: "from-green-500 to-emerald-500",
  },
  {
    id: "3",
    name: "História Moderna",
    description: "Eventos históricos do século XX e suas consequências",
    sources: 7,
    quizzes: 25,
    flashcards: 50,
    color: "from-blue-500 to-cyan-500",
  },
];

export function Dashboard({ onSelectSubject }: DashboardProps) {
  const [subjects, setSubjects] = useState<Subject[]>(mockSubjects);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const handleAddSubject = () => {
    const newSubject: Subject = {
      id: Date.now().toString(),
      name: formData.name,
      description: formData.description,
      sources: 0,
      quizzes: 0,
      flashcards: 0,
      color: "from-indigo-500 to-purple-500",
    };
    setSubjects([...subjects, newSubject]);
    setIsAddDialogOpen(false);
    setFormData({ name: "", description: "" });
  };

  const handleEditSubject = () => {
    if (editingSubject) {
      setSubjects(
        subjects.map((s) =>
          s.id === editingSubject.id
            ? { ...s, name: formData.name, description: formData.description }
            : s
        )
      );
      setEditingSubject(null);
      setFormData({ name: "", description: "" });
    }
  };

  const handleDeleteSubject = (id: string) => {
    setSubjects(subjects.filter((s) => s.id !== id));
  };

  const openAddDialog = () => {
    setFormData({ name: "", description: "" });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (subject: Subject) => {
    setFormData({ name: subject.name, description: subject.description });
    setEditingSubject(subject);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-gray-900">Minhas Matérias</h1>
                <p className="text-sm text-gray-600">Gerencie seus estudos e materiais</p>
              </div>
            </div>
            <Button
              onClick={openAddDialog}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Matéria
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map((subject, index) => (
            <motion.div
              key={subject.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="group relative"
            >
              <div className="glass-dark rounded-3xl p-6 border border-gray-200 hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${subject.color} flex items-center justify-center shadow-lg`}
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
                        openEditDialog(subject);
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
                        handleDeleteSubject(subject.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1" onClick={() => onSelectSubject(subject.id)}>
                  <h3 className="text-gray-900 mb-2">{subject.name}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {subject.description}
                  </p>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge className="rounded-lg bg-blue-50 text-blue-700 border-blue-200">
                      {subject.sources} Fontes
                    </Badge>
                    <Badge className="rounded-lg bg-purple-50 text-purple-700 border-purple-200">
                      {subject.quizzes} Quiz
                    </Badge>
                    <Badge className="rounded-lg bg-pink-50 text-pink-700 border-pink-200">
                      {subject.flashcards} Cards
                    </Badge>
                  </div>
                </div>

                {/* Footer */}
                <Button
                  variant="ghost"
                  className="w-full justify-between rounded-xl hover:bg-gray-100 text-gray-700"
                  onClick={() => onSelectSubject(subject.id)}
                >
                  Abrir matéria
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={isAddDialogOpen || editingSubject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false);
            setEditingSubject(null);
            setFormData({ name: "", description: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingSubject ? "Editar Matéria" : "Nova Matéria"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Matéria</Label>
              <Input
                id="name"
                placeholder="Ex: Física Quântica"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Breve descrição sobre o que você vai estudar..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="rounded-xl min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setEditingSubject(null);
                setFormData({ name: "", description: "" });
              }}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={editingSubject ? handleEditSubject : handleAddSubject}
              disabled={!formData.name.trim()}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              {editingSubject ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
