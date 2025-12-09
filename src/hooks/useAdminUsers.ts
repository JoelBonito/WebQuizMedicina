import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useProfile } from './useProfile';

export interface UserInfo {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    response_language: string;
    role: string;
    created_at: Timestamp;
    last_access_at: Timestamp | null;
    device_info: {
        browser: string;
        os: string;
        device_type: string;
        device_model: string | null;
    } | null;
    location_info: {
        country: string;
        city: string | null;
    } | null;
    projects_count?: number; // Será calculado no componente
}

/**
 * Hook para buscar todos os usuários (somente admin)
 * 
 * Este hook escuta mudanças em tempo real na coleção user_profiles
 * e retorna a lista de todos os usuários para o Dashboard do Admin.
 */
export function useAdminUsers() {
    const { profile } = useProfile();
    const [users, setUsers] = useState<UserInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const isAdmin = profile?.role === 'admin';

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }

        const usersQuery = query(
            collection(db, 'user_profiles'),
            orderBy('created_at', 'desc')
        );

        const unsubscribe = onSnapshot(
            usersQuery,
            async (snapshot) => {
                const usersData = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                })) as UserInfo[];

                // Buscar contagem de projetos para cada usuário
                const usersWithProjects = await Promise.all(
                    usersData.map(async (user) => {
                        try {
                            const projectsQuery = query(
                                collection(db, 'projects'),
                                orderBy('user_id')
                            );

                            const projectsSnapshot = await new Promise<any>((resolve) => {
                                const unsub = onSnapshot(projectsQuery, (snap) => {
                                    unsub();
                                    resolve(snap);
                                });
                            });

                            const userProjects = projectsSnapshot.docs.filter(
                                (doc: any) => doc.data().user_id === user.id
                            );

                            return {
                                ...user,
                                projects_count: userProjects.length,
                            };
                        } catch (error) {
                            console.error(`[useAdminUsers] Error fetching projects for user ${user.id}:`, error);
                            return {
                                ...user,
                                projects_count: 0,
                            };
                        }
                    })
                );

                setUsers(usersWithProjects);
                setLoading(false);
            },
            (err) => {
                console.error('[useAdminUsers] Error:', err);
                setError(err as Error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [isAdmin]);

    return { users, loading, error, isAdmin };
}
