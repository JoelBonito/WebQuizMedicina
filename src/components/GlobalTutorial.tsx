import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { TutorialModal, TutorialStep } from '../components/TutorialModal';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../hooks/useProfile';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Verificar se tutorial já foi visto (do perfil do usuário no Firestore)
const hasBeenViewed = (key: string, profile: any): boolean => {
    if (!profile || !profile.tutorials_viewed) return false;
    return profile.tutorials_viewed[key] === true;
};

// Marcar tutorial como visto no Firestore
const markViewed = async (key: string, userId: string) => {
    try {
        const userRef = doc(db, 'user_profiles', userId);
        await updateDoc(userRef, {
            [`tutorials_viewed.${key}`]: true
        });
        console.log(`[GlobalTutorial] Marcado como visto: ${key}`);
    } catch (e) {
        console.error('[GlobalTutorial] Error saving tutorial state:', e);
    }
};

// Estado global simples (evita múltiplos hooks)
let globalShowTutorial: (() => void) | null = null;

export function GlobalTutorial() {
    const { t } = useTranslation();
    const location = useLocation();
    const { profile } = useProfile();
    const [isOpen, setIsOpen] = useState(false);
    const [currentKey, setCurrentKey] = useState('');
    const [steps, setSteps] = useState<TutorialStep[]>([]);

    // Flag para evitar abrir múltiplas vezes na mesma página
    const hasAutoOpenedRef = useRef<string | null>(null);

    // Detecta a página atual e atualiza os steps
    useEffect(() => {
        if (!profile) return; // Aguardar perfil carregar

        const path = location.pathname;
        let key = 'dashboard';
        let newSteps: TutorialStep[] = [];

        // Páginas admin não têm tutorial automático
        if (path.startsWith('/admin')) {
            setCurrentKey('');
            setSteps([]);
            return;
        }

        if (path === '/' || path === '/dashboard') {
            key = 'dashboard';
            newSteps = [
                { title: t('tutorial.dashboard.step1.title'), description: t('tutorial.dashboard.step1.description') },
                { title: t('tutorial.dashboard.step2.title'), description: t('tutorial.dashboard.step2.description') },
                { title: t('tutorial.dashboard.step3.title'), description: t('tutorial.dashboard.step3.description') },
                { title: t('tutorial.dashboard.step4.title'), description: t('tutorial.dashboard.step4.description') },
                { title: t('tutorial.dashboard.step5.title'), description: t('tutorial.dashboard.step5.description') },
            ];
        } else if (path.includes('/project/')) {
            key = 'project';
            newSteps = [
                { title: t('tutorial.project.step1.title'), description: t('tutorial.project.step1.description') },
                { title: t('tutorial.project.step2.title'), description: t('tutorial.project.step2.description') },
                { title: t('tutorial.project.step3.title'), description: t('tutorial.project.step3.description') },
                { title: t('tutorial.project.step4.title'), description: t('tutorial.project.step4.description') },
                { title: t('tutorial.project.step5.title'), description: t('tutorial.project.step5.description') },
            ];
        } else {
            setCurrentKey('');
            setSteps([]);
            return;
        }

        setCurrentKey(key);
        setSteps(newSteps);

        // Abre automaticamente se nunca foi visto (verificando Firestore)
        // E se ainda não tentou abrir automaticamente nesta página
        if (!hasBeenViewed(key, profile) && hasAutoOpenedRef.current !== key) {
            hasAutoOpenedRef.current = key;
            const timer = setTimeout(() => setIsOpen(true), 500);
            return () => clearTimeout(timer);
        }
    }, [location.pathname, t, profile]);

    // Registra função global de abertura
    const showTutorial = useCallback(() => {
        setIsOpen(true);
    }, []);

    useEffect(() => {
        globalShowTutorial = showTutorial;
        return () => { globalShowTutorial = null; };
    }, [showTutorial]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleComplete = useCallback(async () => {
        if (profile?.id) {
            await markViewed(currentKey, profile.id);
        }
        setIsOpen(false);
    }, [currentKey, profile]);

    return (
        <TutorialModal
            open={isOpen}
            onOpenChange={(open) => { if (!open) handleClose(); }}
            tutorialKey={currentKey}
            steps={steps}
            onComplete={handleComplete}
        />
    );
}

// Hook simplificado que usa a função global
export function useGlobalTutorial() {
    const showCurrentTutorial = useCallback(() => {
        if (globalShowTutorial) {
            globalShowTutorial();
        }
    }, []);

    return { showCurrentTutorial };
}
