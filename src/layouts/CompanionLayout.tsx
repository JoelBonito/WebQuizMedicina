import React from 'react';
import { Outlet } from 'react-router-dom';

export const CompanionLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-indigo-500/30">
            <div className="max-w-2xl mx-auto p-4 h-screen flex flex-col">
                <header className="flex items-center justify-between py-4 mb-6 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
                        <h1 className="text-lg font-semibold tracking-tight text-gray-100">
                            Inove AI <span className="text-indigo-400">Companion</span>
                        </h1>
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                        v1.0.0
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto scrollbar-hide">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
