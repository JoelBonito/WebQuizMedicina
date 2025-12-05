import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
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

        const userRef = doc(db, 'users', user.uid);

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
                // Criar documento de usuário se não existir
                const defaultPrefs = { autoRemoveDifficulties: true };
                await setDoc(userRef, { preferences: defaultPrefs });
                setPreferences(defaultPrefs);
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
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                'preferences.autoRemoveDifficulties': enabled
            });
        } catch (error) {
            console.error('Error updating auto-remove preference:', error);
        }
    };

    return {
        preferences,
        loading,
        updateAutoRemove,
    };
}
