import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useProfileContext } from '../contexts/ProfileContext';

interface UserPreferences {
    autoRemoveDifficulties: boolean;
}

/**
 * Hook para gerenciar preferências do usuário.
 * 
 * IMPORTANTE: Este hook agora usa o ProfileContext existente para obter
 * as preferências, evitando race conditions e listeners duplicados.
 * O ProfileContext já garante que o documento user_profiles existe.
 */
export function useUserPreferences() {
    const { user } = useAuth();
    const { profile, loading: profileLoading } = useProfileContext();
    const [updating, setUpdating] = useState(false);

    // Extrair preferências do perfil ou usar defaults
    const preferences: UserPreferences = {
        autoRemoveDifficulties: profile?.preferences?.autoRemoveDifficulties ?? true,
    };

    const updateAutoRemove = async (enabled: boolean) => {
        if (!user) return;

        setUpdating(true);
        try {
            const userRef = doc(db, 'user_profiles', user.uid);
            // Usar setDoc com merge para atualizar apenas as preferências
            await setDoc(userRef, {
                preferences: {
                    autoRemoveDifficulties: enabled
                }
            }, { merge: true });
        } catch (error) {
            console.error('Error updating auto-remove preference:', error);
            throw error; // Re-throw para que o ContentPanel possa mostrar erro
        } finally {
            setUpdating(false);
        }
    };

    return {
        preferences,
        loading: profileLoading || updating,
        updateAutoRemove,
    };
}

