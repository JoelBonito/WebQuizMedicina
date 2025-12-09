import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface BugReport {
    id: string;
    user_id: string;
    user_email: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    type: 'bug';
    status: 'open' | 'in_progress' | 'resolved';
    created_at: Timestamp;
    url: string;
    user_agent: string;
    project_id?: string;
}

export function useFeedbacks() {
    const [feedbacks, setFeedbacks] = useState<BugReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        try {
            const feedbackQuery = query(
                collection(db, 'feedback'),
                orderBy('created_at', 'desc')
            );

            const unsubscribe = onSnapshot(
                feedbackQuery,
                (snapshot) => {
                    const feedbackData = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data(),
                    })) as BugReport[];

                    setFeedbacks(feedbackData);
                    setLoading(false);
                },
                (err) => {
                    console.error('Error fetching feedbacks:', err);
                    setError(err as Error);
                    setLoading(false);
                }
            );

            return () => unsubscribe();
        } catch (err) {
            setError(err as Error);
            setLoading(false);
        }
    }, []);

    const updateStatus = async (id: string, status: 'open' | 'in_progress' | 'resolved') => {
        try {
            const feedbackRef = doc(db, 'feedback', id);
            await updateDoc(feedbackRef, {
                status,
                updated_at: Timestamp.now(),
            });
        } catch (err) {
            console.error('Error updating feedback status:', err);
            throw err;
        }
    };

    return {
        feedbacks,
        loading,
        error,
        updateStatus,
    };
}
