import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TutorialModal, TutorialStep } from '../components/TutorialModal';
import { useTutorial } from '../hooks/useTutorial';
import { useTranslation } from 'react-i18next';

export function GlobalTutorial() {
    const { t } = useTranslation();
    const location = useLocation();
    const [currentTutorialKey, setCurrentTutorialKey] = useState<string>('');
    const [currentSteps, setCurrentSteps] = useState<TutorialStep[]>([]);

    // Hooks para cada página
    const dashboardTutorial = useTutorial('dashboard');
    const profileTutorial = useTutorial('profile');
    const projectTutorial = useTutorial('project');

    // Detecta a página atual e configura o tutorial apropriado
    useEffect(() => {
        const path = location.pathname;

        if (path === '/' || path === '/dashboard') {
            setCurrentTutorialKey('dashboard');
            setCurrentSteps([
                {
                    title: t('tutorial.dashboard.step1.title'),
                    description: t('tutorial.dashboard.step1.description'),
                },
                {
                    title: t('tutorial.dashboard.step2.title'),
                    description: t('tutorial.dashboard.step2.description'),
                },
                {
                    title: t('tutorial.dashboard.step3.title'),
                    description: t('tutorial.dashboard.step3.description'),
                },
                {
                    title: t('tutorial.dashboard.step4.title'),
                    description: t('tutorial.dashboard.step4.description'),
                },
                {
                    title: t('tutorial.dashboard.step5.title'),
                    description: t('tutorial.dashboard.step5.description'),
                },
            ]);
        } else if (path.includes('/project/')) {
            setCurrentTutorialKey('project');
            setCurrentSteps([
                {
                    title: t('tutorial.project.step1.title'),
                    description: t('tutorial.project.step1.description'),
                },
                {
                    title: t('tutorial.project.step2.title'),
                    description: t('tutorial.project.step2.description'),
                },
                {
                    title: t('tutorial.project.step3.title'),
                    description: t('tutorial.project.step3.description'),
                },
                {
                    title: t('tutorial.project.step4.title'),
                    description: t('tutorial.project.step4.description'),
                },
                {
                    title: t('tutorial.project.step5.title'),
                    description: t('tutorial.project.step5.description'),
                },
            ]);
        } else {
            // Fallback para outras páginas (profile, admin, etc)
            setCurrentTutorialKey('dashboard');
            setCurrentSteps([
                {
                    title: t('tutorial.dashboard.step1.title'),
                    description: t('tutorial.dashboard.step1.description'),
                },
            ]);
        }
    }, [location.pathname, t]);

    // Retorna o tutorial atual baseado na página
    const getCurrentTutorial = () => {
        if (currentTutorialKey === 'dashboard') return dashboardTutorial;
        if (currentTutorialKey === 'profile') return profileTutorial;
        if (currentTutorialKey === 'project') return projectTutorial;
        return dashboardTutorial;
    };

    const currentTutorial = getCurrentTutorial();

    return (
        <TutorialModal
            open={currentTutorial.isOpen}
            onOpenChange={currentTutorial.closeTutorial}
            tutorialKey={currentTutorialKey}
            steps={currentSteps}
            onComplete={currentTutorial.markAsViewed}
        />
    );
}

// Hook para usar o tutorial global
export function useGlobalTutorial() {
    const location = useLocation();
    const dashboardTutorial = useTutorial('dashboard');
    const projectTutorial = useTutorial('project');

    const showCurrentTutorial = () => {
        const path = location.pathname;

        if (path === '/' || path === '/dashboard') {
            dashboardTutorial.showTutorial();
        } else if (path.includes('/project/')) {
            projectTutorial.showTutorial();
        } else {
            dashboardTutorial.showTutorial();
        }
    };

    return {
        showCurrentTutorial,
    };
}
