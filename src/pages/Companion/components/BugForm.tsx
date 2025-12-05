import React, { useState } from 'react';
import { AlertCircle, Save, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

interface BugFormProps {
    projectId: string;
}

export const BugForm: React.FC<BugFormProps> = ({ projectId }) => {
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim()) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'projects', projectId, 'bugs'), {
                description,
                severity,
                status: 'open',
                created_at: serverTimestamp(),
            });

            setSuccess(true);
            setDescription('');
            setSeverity('medium');

            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Error reporting bug:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Gravidade</label>
                <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((level) => (
                        <button
                            key={level}
                            type="button"
                            onClick={() => setSeverity(level)}
                            className={`px-3 py-2 rounded-md text-xs font-medium uppercase tracking-wider border transition-all ${severity === level
                                    ? level === 'high'
                                        ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                        : level === 'medium'
                                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                                            : 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                    : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700'
                                }`}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Descrição do Problema</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="O que aconteceu? Onde? Como reproduzir?"
                    className="w-full h-48 bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 resize-none transition-all"
                    required
                />
            </div>

            <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${success
                        ? 'bg-green-500 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
            >
                {success ? (
                    <>
                        <Check className="w-5 h-5" />
                        Reportado com Sucesso!
                    </>
                ) : (
                    <>
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-5 h-5" />
                        )}
                        {isSubmitting ? 'Salvando...' : 'Registrar Bug'}
                    </>
                )}
            </button>
        </form>
    );
};
