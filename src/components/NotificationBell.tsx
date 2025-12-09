import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useAdminNotifications } from '../hooks/useAdminNotifications';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es, fr, de, it, ru, ar, ja, zhCN } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
    pt: ptBR,
    'pt-PT': ptBR,
    en: enUS,
    es: es,
    fr: fr,
    de: de,
    it: it,
    ru: ru,
    ar: ar,
    ja: ja,
    zh: zhCN,
};

/**
 * Componente de sino de notificações para admin
 * 
 * Exibe um ícone de sino com badge indicando notificações não lidas.
 * Ao clicar, abre um dropdown com as notificações recentes.
 */
export function NotificationBell() {
    const { t, i18n } = useTranslation();
    const { notifications, unreadCount, isAdmin, markAsRead, markAllAsRead } = useAdminNotifications();
    const [open, setOpen] = useState(false);

    if (!isAdmin) return null;

    const locale = localeMap[i18n.language] || enUS;

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'new_user':
                return '👤';
            case 'new_bug':
                return '🐛';
            default:
                return '📢';
        }
    };

    const handleNotificationClick = (notificationId: string) => {
        markAsRead(notificationId);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    className="relative w-9 h-9 rounded-full bg-muted hover:bg-muted/80 transition-all flex items-center justify-center"
                    title={t('notifications.title')}
                >
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-96 rounded-xl bg-card border-border max-h-[500px] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
                    <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{t('notifications.title')}</span>
                        {unreadCount > 0 && (
                            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="text-xs text-primary hover:text-primary/80"
                        >
                            {t('notifications.markAllRead')}
                        </Button>
                    )}
                </div>

                {/* Notifications List */}
                <div className="divide-y divide-border">
                    {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground">
                            <Bell className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">{t('notifications.empty')}</p>
                        </div>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification.id)}
                                className={`px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${!notification.read ? 'bg-primary/5' : ''
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="text-2xl flex-shrink-0">
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {notification.title}
                                            </p>
                                            {!notification.read && (
                                                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-muted-foreground/70">
                                            {formatDistanceToNow(notification.created_at.toDate(), {
                                                addSuffix: true,
                                                locale,
                                            })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                    <div className="px-4 py-3 border-t border-border text-center sticky bottom-0 bg-card">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-primary hover:text-primary/80"
                            onClick={() => setOpen(false)}
                        >
                            {t('notifications.viewAll')} ({notifications.length})
                        </Button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
