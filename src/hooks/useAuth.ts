import { useState, useEffect, useRef } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { toast } from 'sonner';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Cleanup previous listener if exists (safety check)
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    unsubscribeRef.current = onAuthStateChanged(auth, (currentUser) => {
      setUser(prevUser => {
        // Only update if uid changed to prevent unnecessary re-renders
        if (prevUser?.uid === currentUser?.uid) return prevUser;
        console.log('[useAuth] Auth state changed:', currentUser ? 'User logged in' : 'User logged out');
        return currentUser;
      });
      setLoading(false);

      if (!currentUser) {
        localStorage.removeItem('language');
      }
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return { data: { user: userCredential.user }, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { data: { user: userCredential.user }, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      return { data: { user: userCredential.user }, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      toast.success('Logout realizado com sucesso');
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  // Compatibility layer for Supabase session
  // We cannot await here synchronously. 
  // Consumers should use 'user' and 'user.getIdToken()' directly.
  const session = user ? {
    user,
    // access_token is removed because we can't get it synchronously easily without an effect.
    // If components break, we'll need to refactor them to use useAuth().user.getIdToken()
  } : null;

  return {
    user,
    session, // Deprecated: prefer using 'user' directly
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  };
};
