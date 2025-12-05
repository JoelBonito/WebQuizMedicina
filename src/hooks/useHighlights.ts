import { useState, useEffect } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export interface Highlight {
    id: string;
    summary_id: string;
    project_id: string;
    user_id: string;
    text: string;
    color: string;
    start_offset: number;
    end_offset: number;
    created_at: any;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export function useHighlights(summaryId: string | null, projectId: string | null) {
    const { user } = useAuth();
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [loading, setLoading] = useState(false);

    // Load highlights for a specific summary
    useEffect(() => {
        if (!summaryId || !projectId || !user) {
            setHighlights([]);
            return;
        }

        setLoading(true);

        const q = query(
            collection(db, 'summary_highlights'),
            where('summary_id', '==', summaryId),
            where('project_id', '==', projectId),
            orderBy('created_at', 'asc')
        );

        // Real-time subscription
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const loadedHighlights: Highlight[] = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                } as Highlight));

                setHighlights(loadedHighlights);
                setLoading(false);
            },
            (error) => {
                console.error('Error loading highlights:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [summaryId, projectId, user]);

    // Add a new highlight
    const addHighlight = async (
        text: string,
        color: HighlightColor,
        startOffset: number,
        endOffset: number
    ) => {
        if (!summaryId || !projectId || !user) {
            throw new Error('Missing required parameters');
        }

        try {
            const newHighlight = {
                summary_id: summaryId,
                project_id: projectId,
                user_id: user.uid,
                text,
                color,
                start_offset: startOffset,
                end_offset: endOffset,
                created_at: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'summary_highlights'), newHighlight);
            return docRef.id;
        } catch (error) {
            console.error('Error adding highlight:', error);
            throw error;
        }
    };

    // Remove a highlight
    const removeHighlight = async (highlightId: string) => {
        try {
            await deleteDoc(doc(db, 'summary_highlights', highlightId));
        } catch (error) {
            console.error('Error removing highlight:', error);
            throw error;
        }
    };

    return {
        highlights,
        loading,
        addHighlight,
        removeHighlight,
    };
}
