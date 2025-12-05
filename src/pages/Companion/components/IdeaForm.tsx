import React, { useState } from 'react';
import { Sparkles, Save, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

interface IdeaFormProps {
    projectId: string;
}

export const IdeaForm: React.FC<IdeaFormProps> = ({ projectId }) => {
    const [description, setDescription] = useState('');
    const [impact, setImpact] = useState<number>(5);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim()) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'projects', projectId, 'ideas'), {
                description,
                impact_score: impact,
                priority: 'backlog',
                created_at: serverTimestamp(),
            });

            setSuccess(true);
            setDescription('');
            setImpact(5);

            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving idea:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Impacto Esperado (1-10)</label>
                <div className="flex items-center gap-4 bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={impact}
                        onChange={(e) => setImpact(Number(e.target.value))}
                        className="flex-1 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <span className="text-2xl font-bold text-amber-500 w-8 text-center">{impact}</span>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Descrição da Ideia</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Qual é a ideia? Como ela melhora o produto?"
                    className="w-full h-48 bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-none transition-all"
                    required
                />
            </div>

            <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${success
                        ? 'bg-green-500 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
            >
                {success ? (
                    <>
                        <Check className="w-5 h-5" />
                        Ideia Salva!
                    </>
                ) : (
                    <>
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Sparkles className="w-5 h-5" />
                        )}
                        {isSubmitting ? 'Salvando...' : 'Registrar Ideia'}
                    </>
                )}
            </button>
        </form>
    );
};
