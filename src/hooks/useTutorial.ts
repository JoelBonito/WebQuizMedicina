import { useState, useEffect } from 'react';

interface UseTutorialReturn {
    isOpen: boolean;
    showTutorial: () => void;
    closeTutorial: () => void;
    markAsViewed: () => void;
    hasBeenViewed: boolean;
}

/**
 * Hook para gerenciar estado de tutoriais
 * @param tutorialKey - Identificador único do tutorial (ex: 'dashboard', 'profile', 'project')
 * @returns Objeto com estado e funções de controle
 */
export function useTutorial(tutorialKey: string): UseTutorialReturn {
    const STORAGE_KEY = `tutorial_viewed_${tutorialKey}`;

    // Verifica se tutorial já foi visto
    const [hasBeenViewed, setHasBeenViewed] = useState<boolean>(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    // Controla abertura/fechamento do modal
    const [isOpen, setIsOpen] = useState<boolean>(false);

    // Abre tutorial automaticamente na primeira visita
    useEffect(() => {
        if (!hasBeenViewed) {
            // Pequeno delay para melhor UX (evitar abertura imediata)
            const timer = setTimeout(() => {
                setIsOpen(true);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [hasBeenViewed]);

    const showTutorial = () => {
        setIsOpen(true);
    };

    const closeTutorial = () => {
        setIsOpen(false);
    };

    const markAsViewed = () => {
        try {
            localStorage.setItem(STORAGE_KEY, 'true');
            setHasBeenViewed(true);
        } catch (error) {
            console.error('Error saving tutorial state:', error);
        }
    };

    return {
        isOpen,
        showTutorial,
        closeTutorial,
        markAsViewed,
        hasBeenViewed,
    };
}
