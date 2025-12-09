import { useState } from 'react';
import { X, Check, Loader2, MapPin, User, Calendar, Monitor, AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useTranslation } from 'react-i18next';
import { BugReport } from '../hooks/useFeedbacks';
import { toast } from 'sonner';

interface BugDetailModalProps {
    bug: BugReport | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdateStatus: (id: string, status: 'open' | 'in_progress' | 'resolved') => Promise<void>;
}

export function BugDetailModal({ bug, open, onOpenChange, onUpdateStatus }: BugDetailModalProps) {
    const { t } = useTranslation();
    const [updating, setUpdating] = useState(false);

    if (!bug) return null;

    const handleMarkResolved = async () => {
        setUpdating(true);
        try {
            await onUpdateStatus(bug.id, 'resolved');
            toast.success(t('bugReports.actions.resolved'));
            onOpenChange(false);
        } catch (error) {
            console.error('Error marking as resolved:', error);
            toast.error(t('bugReports.actions.error'));
        } finally {
            setUpdating(false);
        }
    };

    const handleMarkInProgress = async () => {
        setUpdating(true);
        try {
            await onUpdateStatus(bug.id, 'in_progress');
            toast.success(t('bugReports.actions.inProgressSet'));
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error(t('bugReports.actions.error'));
        } finally {
            setUpdating(false);
        }
    };

    const getSeverityColor = () => {
        switch (bug.severity) {
            case 'high':
                return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
            case 'medium':
                return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
            case 'low':
                return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
        }
    };

    const getStatusColor = () => {
        switch (bug.status) {
            case 'resolved':
                return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
            case 'in_progress':
                return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
            case 'open':
                return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '-';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] rounded-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <DialogTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                {t('bugReports.detailTitle')}
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                ID: {bug.id.slice(0, 8)}...
                            </DialogDescription>
                        </div>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="text-gray-400 hover:text-muted-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Severity and Status */}
                    <div className="flex gap-2">
                        <Badge className={`${getSeverityColor()} border px-3 py-1`}>
                            {t(`bugReports.severity.${bug.severity}`).toUpperCase()}
                        </Badge>
                        <Badge className={`${getStatusColor()} border px-3 py-1`}>
                            {t(`bugReports.status.${bug.status}`).toUpperCase()}
                        </Badge>
                    </div>

                    {/* User Info */}
                    <div className="space-y-2 p-4 bg-muted/50 rounded-xl">
                        <div className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{t('bugReports.card.reportedBy')}:</span>
                            <span>{bug.user_email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{t('bugReports.card.date')}:</span>
                            <span>{formatDate(bug.created_at)}</span>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <h4 className="font-semibold mb-2">{t('bugReports.card.description')}</h4>
                        <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-xl whitespace-pre-wrap">
                            {bug.description}
                        </p>
                    </div>

                    {/* Technical Details */}
                    <div>
                        <h4 className="font-semibold mb-2">{t('bugReports.card.technicalDetails')}</h4>
                        <div className="space-y-2 text-sm bg-muted/30 p-4 rounded-xl">
                            <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <span className="font-medium">URL:</span>
                                    <p className="text-muted-foreground break-all">{bug.url}</p>
                                </div>
                            </div>
                            {bug.project_id && (
                                <div className="flex items-start gap-2">
                                    <span className="font-medium">Project ID:</span>
                                    <span className="text-muted-foreground">{bug.project_id}</span>
                                </div>
                            )}
                            <div className="flex items-start gap-2">
                                <Monitor className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                    <span className="font-medium">User Agent:</span>
                                    <p className="text-muted-foreground text-xs break-all">{bug.user_agent}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        {bug.status !== 'in_progress' && bug.status !== 'resolved' && (
                            <Button
                                onClick={handleMarkInProgress}
                                disabled={updating}
                                variant="outline"
                                className="flex-1"
                            >
                                {updating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {t('bugReports.actions.updating')}
                                    </>
                                ) : (
                                    t('bugReports.actions.markInProgress')
                                )}
                            </Button>
                        )}
                        {bug.status !== 'resolved' && (
                            <Button
                                onClick={handleMarkResolved}
                                disabled={updating}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            >
                                {updating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        {t('bugReports.actions.updating')}
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        {t('bugReports.actions.markResolved')}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
