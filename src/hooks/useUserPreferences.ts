import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

interface UserPreferences {
    autoRemoveDifficulties: boolean;
}

export function useUserPreferences() {
    const { user } = useAuth();
    const [preferences, setPreferences] = useState<UserPreferences>({
        autoRemoveDifficulties: true, // Padrão ativado
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // Usar user_profiles (coleção principal do usuário) em vez de 'users'
        const userRef = doc(db, 'user_profiles', user.uid);

        const unsubscribe = onSnapshot(userRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data?.preferences) {
                    setPreferences(data.preferences);
                } else {
                    // Inicializar preferências se não existirem
                    const defaultPrefs = { autoRemoveDifficulties: true };
                    await setDoc(userRef, { preferences: defaultPrefs }, { merge: true });
                    setPreferences(defaultPrefs);
                }
            } else {
                // Documento não existe ainda - apenas usar defaults
                // O ProfileContext criará o documento quando necessário
                setPreferences({ autoRemoveDifficulties: true });
            }
            setLoading(false);
        }, (error) => {
            console.error('Error loading user preferences:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const updateAutoRemove = async (enabled: boolean) => {
        if (!user) return;

        try {
            const userRef = doc(db, 'user_profiles', user.uid);
            // Usar setDoc com merge para criar o documento se não existir
            await setDoc(userRef, {
                preferences: {
                    autoRemoveDifficulties: enabled
                }
            }, { merge: true });

            // Atualizar estado local imediatamente para feedback instantâneo
            setPreferences(prev => ({
                ...prev,
                autoRemoveDifficulties: enabled
            }));
        } catch (error) {
            console.error('Error updating auto-remove preference:', error);
            throw error; // Re-throw para que o ContentPanel possa mostrar erro
        }
    };

    return {
        preferences,
        loading,
        updateAutoRemove,
    };
}

