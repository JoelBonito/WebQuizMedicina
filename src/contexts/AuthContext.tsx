import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
import i18next from 'i18next';

// Auth context interface
interface AuthContextType {
    user: User | null;
    loading: boolean;
    session: { user: User } | null;
    signUp: (email: string, password: string) => Promise<{ data: { user: User } | null; error: any }>;
    signIn: (email: string, password: string) => Promise<{ data: { user: User } | null; error: any }>;
    signInWithGoogle: () => Promise<{ data: { user: User } | null; error: any }>;
    signOut: () => Promise<{ error: any }>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const hasLoggedRef = useRef(false);

    // Single auth state listener for the entire app
    useEffect(() => {
        console.log('[AuthContext] Setting up single auth listener');

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            // Only log once per state change
            if (!hasLoggedRef.current || (currentUser?.uid !== user?.uid)) {
                console.log('[AuthContext] Auth state changed:', currentUser ? 'User logged in' : 'User logged out');
                hasLoggedRef.current = true;
            }

            setUser(currentUser);
            setLoading(false);

            if (!currentUser) {
                localStorage.removeItem('language');
            }
        });

        return () => {
            console.log('[AuthContext] Cleaning up auth listener');
            unsubscribe();
        };
    }, []); // Empty deps - only run once on mount

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
            toast.success(i18next.t('toasts.logoutSuccess'));
            return { error: null };
        } catch (error: any) {
            return { error };
        }
    };

    // Compatibility layer for existing code
    const session = user ? { user } : null;

    const value: AuthContextType = {
        user,
        loading,
        session,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// Custom hook to use auth context
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);

    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}

// Export context for testing purposes
export { AuthContext };
