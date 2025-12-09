import { useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';

interface HelpModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim() || !user) return;

        setIsSubmitting(true);
        try {
            // Captura informações adicionais
            const feedbackData = {
                user_id: user.uid,
                user_email: user.email || 'unknown',
                description: description.trim(),
                severity,
                type: 'bug' as const,
                status: 'open' as const,
                created_at: serverTimestamp(),
                user_agent: navigator.userAgent,
                url: window.location.href,
                // Captura project_id se estiver na URL
                project_id: window.location.pathname.includes('/project/')
                    ? window.location.pathname.split('/project/')[1]?.split('/')[0]
                    : undefined,
            };

            await addDoc(collection(db, 'feedback'), feedbackData);

            setSuccess(true);
            toast.success(t('help.form.success'));
            setDescription('');
            setSeverity('medium');

            // Fecha o modal após 2 segundos
            setTimeout(() => {
                setSuccess(false);
                onOpenChange(false);
            }, 2000);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            toast.error(t('help.form.error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] rounded-3xl">
                <DialogHeader>
                    <div className="flex items-center justify-between mb-2">
                        <DialogTitle className="text-xl font-semibold text-foreground">
                            {t('help.button.title')}
                        </DialogTitle>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="text-gray-400 hover:text-muted-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <DialogDescription className="text-sm text-muted-foreground">
                        {t('help.button.description')}
                    </DialogDescription>

                    {/* Mensagem de versão beta */}
                    <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                            💡 {t('help.beta.message')}
                        </p>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {/* Seletor de gravidade */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">
                            {t('help.form.severityLabel')}
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['low', 'medium', 'high'] as const).map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setSeverity(level)}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium uppercase tracking-wider border transition-all ${severity === level
                                            ? level === 'high'
                                                ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400'
                                                : level === 'medium'
                                                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-600 dark:text-orange-400'
                                                    : 'bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                                            : 'bg-muted border-border text-muted-foreground hover:border-primary/30'
                                        }`}
                                >
                                    {t(`help.form.severity${level.charAt(0).toUpperCase() + level.slice(1)}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Descrição do problema */}
                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium text-foreground">
                            {t('help.form.descriptionLabel')}
                        </Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('help.form.descriptionPlaceholder')}
                            className="min-h-[150px] rounded-xl bg-background border-border resize-none"
                            required
                            disabled={isSubmitting || success}
                        />
                    </div>

                    {/* Botões de ação */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 rounded-xl"
                            disabled={isSubmitting || success}
                        >
                            {t('help.form.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !description.trim() || success}
                            className={`flex-1 rounded-xl transition-all ${success
                                    ? 'bg-green-500 hover:bg-green-500 text-white'
                                    : 'bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white'
                                }`}
                        >
                            {success ? (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    {t('help.form.success').split('!')[0]}
                                </>
                            ) : isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t('help.form.submitting')}
                                </>
                            ) : (
                                t('help.form.submit')
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
