import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bug, Lightbulb, CheckCircle2 } from 'lucide-react';
import { BugForm } from './components/BugForm';
import { IdeaForm } from './components/IdeaForm';

type Tab = 'bugs' | 'ideas';

export const CompanionPage: React.FC = () => {
    const { projectId } = useParams();
    const [activeTab, setActiveTab] = useState<Tab>('bugs');

    if (!projectId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <p>Projeto não identificado.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Tabs */}
            <div className="flex p-1 bg-gray-900 rounded-lg mb-6">
                <button
                    onClick={() => setActiveTab('bugs')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${activeTab === 'bugs'
                            ? 'bg-red-500/10 text-red-400 shadow-sm ring-1 ring-red-500/20'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                        }`}
                >
                    <Bug className="w-4 h-4" />
                    Reportar Bug
                </button>
                <button
                    onClick={() => setActiveTab('ideas')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${activeTab === 'ideas'
                            ? 'bg-amber-500/10 text-amber-400 shadow-sm ring-1 ring-amber-500/20'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                        }`}
                >
                    <Lightbulb className="w-4 h-4" />
                    Nova Ideia
                </button>
            </div>

            {/* Content */}
            <div className="flex-1">
                {activeTab === 'bugs' ? (
                    <BugForm projectId={projectId} />
                ) : (
                    <IdeaForm projectId={projectId} />
                )}
            </div>
        </div>
    );
};
