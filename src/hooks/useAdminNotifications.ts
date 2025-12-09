import { useState, useEffect } from 'react';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    Timestamp,
    limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useProfile } from './useProfile';

export interface AdminNotification {
    id: string;
    type: 'new_user' | 'new_bug' | 'system';
    title: string;
    message: string;
    data: Record<string, any>;
    created_at: Timestamp;
    read: boolean;
    read_at: Timestamp | null;
}

/**
 * Hook para notificações admin em tempo real
 * 
 * Busca as últimas 50 notificações e mantém contagem de não lidas.
 * Fornece funções para marcar notificações como lidas.
 */
export function useAdminNotifications() {
    const { profile } = useProfile();
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const isAdmin = profile?.role === 'admin';

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }

        // Buscar últimas 50 notificações
        const notificationsQuery = query(
            collection(db, 'admin_notifications'),
            orderBy('created_at', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as AdminNotification[];

            setNotifications(data);
            setUnreadCount(data.filter((n) => !n.read).length);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAdmin]);

    /**
     * Marcar uma notificação como lida
     */
    const markAsRead = async (notificationId: string) => {
        try {
            const notifRef = doc(db, 'admin_notifications', notificationId);
            await updateDoc(notifRef, {
                read: true,
                read_at: Timestamp.now(),
            });
        } catch (error) {
            console.error('[useAdminNotifications] Erro ao marcar como lida:', error);
        }
    };

    /**
     * Marcar todas as notificações como lidas
     */
    const markAllAsRead = async () => {
        try {
            const unreadNotifications = notifications.filter((n) => !n.read);
            await Promise.all(
                unreadNotifications.map((n) =>
                    updateDoc(doc(db, 'admin_notifications', n.id), {
                        read: true,
                        read_at: Timestamp.now(),
                    })
                )
            );
        } catch (error) {
            console.error('[useAdminNotifications] Erro ao marcar todas como lidas:', error);
        }
    };

    return { notifications, unreadCount, loading, markAsRead, markAllAsRead, isAdmin };
}
