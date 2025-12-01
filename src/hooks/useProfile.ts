import { useState, useEffect } from 'react';
import { db, storage } from '../lib/firebase';
import { doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from './useAuth';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  response_language: string;
  role: string;
  created_at: any;
  updated_at: any;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Subscribe to profile changes
  useEffect(() => {
    // ✅ Resetar quando não há usuário
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    console.log('[useProfile] Setting up profile listener for:', user.uid);
    setLoading(true);

    const docRef = doc(db, 'user_profiles', user.uid);

    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({ id: docSnap.id, ...data } as Profile);
        // console.log('[useProfile] Profile updated:', data?.role);
      } else {
        // Create profile if it doesn't exist
        const displayName = user.email?.split('@')[0] || 'Usuário';
        const newProfile = {
          display_name: displayName,
          response_language: 'pt',
          role: 'user', // Default role
          avatar_url: user.photoURL || null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        };

        try {
          await setDoc(docRef, newProfile);
          // onSnapshot will fire again with the new data
        } catch (err) {
          console.error('Error creating profile:', err);
        }
      }
      setLoading(false);
    }, (error) => {
      console.error('Error listening to profile:', error);
      setLoading(false);
    });

    return () => {
      console.log('[useProfile] Cleaning up profile listener');
      unsubscribe();
    };
  }, [user?.uid]); // ✅ Dependência CORRETA: só user.uid!

  // Update profile
  const updateProfile = async (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'response_language'>>) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setUpdating(true);
      const docRef = doc(db, 'user_profiles', user.uid); // Fixed collection name to match useEffect

      await updateDoc(docRef, {
        ...updates,
        updated_at: serverTimestamp()
      });

      // Optimistic update
      setProfile(prev => prev ? { ...prev, ...updates, updated_at: new Date() } : null);

      return { data: { ...profile, ...updates }, error: null };
    } catch (error: any) {
      console.error('Error updating profile:', error);
      return { data: null, error };
    } finally {
      setUpdating(false);
    }
  };

  // Upload avatar
  const uploadAvatar = async (file: File) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setUpdating(true);

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.uid}-${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `avatars/${fileName}`);

      await uploadBytes(storageRef, file);
      const publicUrl = await getDownloadURL(storageRef);

      // Update profile with avatar URL
      const result = await updateProfile({ avatar_url: publicUrl });
      return result;
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      return { data: null, error };
    } finally {
      setUpdating(false);
    }
  };

  return {
    profile,
    loading,
    updating,
    updateProfile,
    uploadAvatar,
    refetch: () => { }, // No-op since we use real-time listener
  };
}
