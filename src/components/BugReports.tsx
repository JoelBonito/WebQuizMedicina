import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, Search, Filter } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import { useTranslation } from 'react-i18next';
import { useFeedbacks, BugReport } from '../hooks/useFeedbacks';
import { BugDetailModal } from './BugDetailModal';
import { motion } from 'motion/react';

export function BugReports() {
    const { t } = useTranslation();
    const { feedbacks, loading, error, updateStatus } = useFeedbacks();
    const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [severityFilter, setSeverityFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Filtrar feedbacks
    const filteredFeedbacks = useMemo(() => {
        return feedbacks.filter((bug) => {
            // Filtro de status
            if (statusFilter !== 'all' && bug.status !== statusFilter) {
                return false;
            }

            // Filtro de gravidade
            if (severityFilter !== 'all' && bug.severity !== severityFilter) {
                return false;
            }

            // Busca por email/descrição
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    bug.user_email.toLowerCase().includes(query) ||
                    bug.description.toLowerCase().includes(query)
                );
            }

            return true;
        });
    }, [feedbacks, statusFilter, severityFilter, searchQuery]);

    const handleBugClick = (bug: BugReport) => {
        setSelectedBug(bug);
        setDetailOpen(true);
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high':
                return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
            case 'medium':
                return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30';
            case 'low':
                return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
            default:
                return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'high':
                return '🔴';
            case 'medium':
                return '🟡';
            case 'low':
                return '🔵';
            default:
                return '⚪';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'resolved':
                return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30';
            case 'in_progress':
                return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
            case 'open':
                return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
            default:
                return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
        }
    };

    const formatRelativeTime = (timestamp: any) => {
        if (!timestamp) return '-';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return t('bugReports.time.justNow');
        if (diffMins < 60) return t('bugReports.time.minutesAgo', { count: diffMins });
        if (diffHours < 24) return t('bugReports.time.hoursAgo', { count: diffHours });
        if (diffDays < 7) return t('bugReports.time.daysAgo', { count: diffDays });

        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background pt-16 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t('bugReports.error')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-16">
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <AlertTriangle className="w-8 h-8 text-orange-500" />
                        {t('bugReports.title')}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        {t('bugReports.subtitle', { count: filteredFeedbacks.length })}
                    </p>
                </div>

                {/* Filters */}
                <div className="bg-card border border-border rounded-2xl p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Filter className="w-5 h-5 text-muted-foreground" />
                        <h3 className="font-semibold">{t('bugReports.filters.title')}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Status Filter */}
                        <div>
                            <label className="text-sm text-muted-foreground mb-2 block">
                                {t('bugReports.filters.status')}
                            </label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('bugReports.filters.all')}</SelectItem>
                                    <SelectItem value="open">{t('bugReports.status.open')}</SelectItem>
                                    <SelectItem value="in_progress">{t('bugReports.status.in_progress')}</SelectItem>
                                    <SelectItem value="resolved">{t('bugReports.status.resolved')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Severity Filter */}
                        <div>
                            <label className="text-sm text-muted-foreground mb-2 block">
                                {t('bugReports.filters.severity')}
                            </label>
                            <Select value={severityFilter} onValueChange={setSeverityFilter}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('bugReports.filters.all')}</SelectItem>
                                    <SelectItem value="high">{t('bugReports.severity.high')}</SelectItem>
                                    <SelectItem value="medium">{t('bugReports.severity.medium')}</SelectItem>
                                    <SelectItem value="low">{t('bugReports.severity.low')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Search */}
                        <div>
                            <label className="text-sm text-muted-foreground mb-2 block">
                                {t('bugReports.filters.search')}
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder={t('bugReports.filters.searchPlaceholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 rounded-xl"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bug List */}
                {filteredFeedbacks.length === 0 ? (
                    <div className="text-center py-16">
                        <AlertTriangle className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                        <p className="text-muted-foreground">{t('bugReports.empty')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredFeedbacks.map((bug, index) => (
                            <motion.div
                                key={bug.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handleBugClick(bug)}
                                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-all cursor-pointer hover:shadow-lg"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        {/* Header */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-2xl">{getSeverityIcon(bug.severity)}</span>
                                            <Badge className={`${getSeverityColor(bug.severity)} border px-2 py-0.5 text-xs`}>
                                                {t(`bugReports.severity.${bug.severity}`).toUpperCase()}
                                            </Badge>
                                            <Badge className={`${getStatusColor(bug.status)} border px-2 py-0.5 text-xs`}>
                                                {t(`bugReports.status.${bug.status}`).toUpperCase()}
                                            </Badge>
                                            <span className="text-sm text-muted-foreground ml-auto">
                                                {formatRelativeTime(bug.created_at)}
                                            </span>
                                        </div>

                                        {/* User */}
                                        <p className="text-sm text-muted-foreground mb-2">
                                            <span className="font-medium">{t('bugReports.card.reportedBy')}:</span>{' '}
                                            {bug.user_email}
                                        </p>

                                        {/* Description */}
                                        <p className="text-foreground line-clamp-2">{bug.description}</p>
                                    </div>

                                    <Button variant="outline" size="sm" className="rounded-xl">
                                        {t('bugReports.actions.viewDetails')}
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            <BugDetailModal
                bug={selectedBug}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                onUpdateStatus={updateStatus}
            />
        </div>
    );
}
