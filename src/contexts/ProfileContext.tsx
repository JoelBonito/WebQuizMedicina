import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { db, storage } from '../lib/firebase';
import { doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../hooks/useAuth';
import { getInitialLanguage } from '../lib/languageUtils';
import { updateLastAccess } from '../lib/deviceTracker';

// Profile interface
export interface Profile {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    response_language: string;
    role: string;
    created_at: any;
    updated_at: any;
    // Preferências do usuário (gerenciadas por useUserPreferences)
    preferences?: {
        autoRemoveDifficulties?: boolean;
    };
    // Tutoriais visualizados (gerenciados por GlobalTutorial)
    viewedTutorials?: string[];
}

// Profile context interface
interface ProfileContextType {
    profile: Profile | null;
    loading: boolean;
    updating: boolean;
    updateProfile: (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'response_language'>>) => Promise<{ data: Profile | null; error: any }>;
    uploadAvatar: (file: File) => Promise<{ data: Profile | null; error: any }>;
    refetch: () => void;
}

// Create context with undefined default
const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// Provider component
interface ProfileProviderProps {
    children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const hasLoggedRef = useRef(false);

    // Single profile listener for the entire app
    useEffect(() => {
        // Reset when no user
        if (!user) {
            setProfile(null);
            setLoading(false);
            hasLoggedRef.current = false;
            return;
        }

        // Only log once per user
        if (!hasLoggedRef.current) {
            console.log('[ProfileContext] Setting up single profile listener for:', user.uid);
            hasLoggedRef.current = true;
        }

        setLoading(true);

        const docRef = doc(db, 'user_profiles', user.uid);

        // Track if we've already updated last access in this session
        let hasUpdatedAccess = false;
        let unsubscribe: (() => void) | null = null;

        // Função para inicializar o perfil e configurar o listener
        const initializeProfile = async () => {
            try {
                // DEBUG: Verificar se temos um token válido
                if (user) {
                    try {
                        const token = await user.getIdToken();
                        console.log('[ProfileContext] Token disponível:', token ? 'Sim' : 'Não');
                        console.log('[ProfileContext] User UID:', user.uid);
                    } catch (e) {
                        console.error('[ProfileContext] Erro ao obter token:', e);
                    }
                }

                // Primeiro, tentar obter o documento
                const { getDoc } = await import('firebase/firestore');
                console.log('[ProfileContext] Buscando documento em user_profiles/', user.uid);

                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    // Documento não existe - criar primeiro
                    const displayName = user.email?.split('@')[0] || 'Usuário';
                    const detectedLanguage = getInitialLanguage();
                    console.log('[ProfileContext] Creating new profile with detected language:', detectedLanguage);

                    const newProfile = {
                        display_name: displayName,
                        response_language: detectedLanguage,
                        role: 'user',
                        avatar_url: user.photoURL || null,
                        created_at: serverTimestamp(),
                        updated_at: serverTimestamp(),
                    };

                    await setDoc(docRef, newProfile);
                    console.log('[ProfileContext] Profile created successfully');
                }

                // Agora que sabemos que o documento existe, configurar o listener
                unsubscribe = onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setProfile({ id: docSnap.id, ...data } as Profile);

                        // Update last access ONLY ONCE per session
                        if (!hasUpdatedAccess) {
                            hasUpdatedAccess = true;
                            setTimeout(() => {
                                updateLastAccess(user.uid).catch(err =>
                                    console.error('[ProfileContext] Error updating access:', err)
                                );
                            }, 1000);
                        }
                    }
                    setLoading(false);
                }, (error) => {
                    console.error('[ProfileContext] Error listening to profile:', error);
                    setLoading(false);
                });

            } catch (error) {
                console.error('[ProfileContext] Error initializing profile:', error);
                setLoading(false);
            }
        };

        initializeProfile();

        return () => {
            console.log('[ProfileContext] Cleaning up profile listener');
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [user?.uid]); // Only re-run when user.uid changes


    // Update profile
    const updateProfile = async (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'response_language'>>) => {
        if (!user) {
            return { data: null, error: new Error('User not authenticated') };
        }

        try {
            setUpdating(true);
            const docRef = doc(db, 'user_profiles', user.uid);

            await updateDoc(docRef, {
                ...updates,
                updated_at: serverTimestamp()
            });

            // Optimistic update
            setProfile(prev => prev ? { ...prev, ...updates, updated_at: new Date() } : null);

            return { data: { ...profile, ...updates } as Profile, error: null };
        } catch (error: any) {
            console.error('[ProfileContext] Error updating profile:', error);
            return { data: null, error };
        } finally {
            setUpdating(false);
        }
    };

    // Upload avatar
    const uploadAvatar = async (file: File) => {
        if (!user) {
            return { data: null, error: new Error('User not authenticated') };
        }

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
            console.error('[ProfileContext] Error uploading avatar:', error);
            return { data: null, error };
        } finally {
            setUpdating(false);
        }
    };

    const value: ProfileContextType = {
        profile,
        loading,
        updating,
        updateProfile,
        uploadAvatar,
        refetch: () => { }, // No-op since we use real-time listener
    };

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
}

// Custom hook to use profile context
export function useProfileContext(): ProfileContextType {
    const context = useContext(ProfileContext);

    if (context === undefined) {
        throw new Error('useProfileContext must be used within a ProfileProvider');
    }

    return context;
}

// Export context for testing purposes
export { ProfileContext };
