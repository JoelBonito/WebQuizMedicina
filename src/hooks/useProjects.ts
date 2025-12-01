import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './useAuth';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: any;
}

export const useProjects = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'projects'),
        where('user_id', '==', user.uid),
        orderBy('created_at', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(data);
    } catch (err: any) {
      console.error('Error fetching projects:', err);
      setError(err.message || 'Erro ao buscar projetos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    fetchProjects();
  }, [user?.uid]);

  const createProject = async (name: string) => {
    if (!user) throw new Error('User not authenticated');

    try {
      const newData = {
        name,
        user_id: user.uid,
        created_at: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'projects'), newData);
      const createdProject = { id: docRef.id, ...newData, created_at: new Date() } as Project;

      setProjects([createdProject, ...projects]);
      return createdProject;
    } catch (err) {
      console.error('Error creating project:', err);
      throw err;
    }
  };

  const updateProject = async (id: string, name: string) => {
    try {
      await updateDoc(doc(db, 'projects', id), { name });

      const updatedProject = { ...projects.find(p => p.id === id)!, name };
      setProjects(projects.map((p) => (p.id === id ? updatedProject : p)));
      return updatedProject;
    } catch (err) {
      console.error('Error updating project:', err);
      throw err;
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'projects', id));
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Error deleting project:', err);
      throw err;
    }
  };

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    refetch: fetchProjects,
  };
};
