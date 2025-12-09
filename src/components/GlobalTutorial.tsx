import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { TutorialModal, TutorialStep } from '../components/TutorialModal';
import { useTranslation } from 'react-i18next';

// Chave para localStorage
const getStorageKey = (key: string) => `tutorial_viewed_${key}`;
const hasBeenViewed = (key: string) => {
    try {
        return localStorage.getItem(getStorageKey(key)) === 'true';
    } catch {
        return false;
    }
};
const markViewed = (key: string) => {
    try {
        localStorage.setItem(getStorageKey(key), 'true');
    } catch (e) {
        console.error('Error saving tutorial state:', e);
    }
};

// Estado global simples (evita múltiplos hooks)
let globalShowTutorial: (() => void) | null = null;

export function GlobalTutorial() {
    const { t } = useTranslation();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [currentKey, setCurrentKey] = useState('');
    const [steps, setSteps] = useState<TutorialStep[]>([]);

    // Detecta a página atual e atualiza os steps
    useEffect(() => {
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

        // Abre automaticamente se nunca foi visto
        if (!hasBeenViewed(key)) {
            const timer = setTimeout(() => setIsOpen(true), 500);
            return () => clearTimeout(timer);
        }
    }, [location.pathname, t]);

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

    const handleComplete = useCallback(() => {
        markViewed(currentKey);
        setIsOpen(false);
    }, [currentKey]);

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
