import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Cloud Function Trigger: Novo Bug Reportado
 * 
 * Dispara automaticamente quando um novo feedback/bug é criado.
 * Cria uma notificação para o admin com informações sobre a severidade.
 */
export const onFeedbackCreated = onDocumentCreated(
    'feedback/{feedbackId}',
    async (event) => {
        const db = getFirestore();
        const feedback = event.data?.data();

        if (!feedback) {
            console.warn('[onFeedbackCreated] Dados do feedback não encontrados');
            return;
        }

        const feedbackId = event.params.feedbackId;

        // Mapear severidade para emoji
        const severityEmoji: Record<string, string> = {
            high: '🔴',
            medium: '🟡',
            low: '🟢',
        };

        const severity = feedback.severity || 'medium';
        const emoji = severityEmoji[severity] || '⚪';
        const userEmail = feedback.user_email || 'Usuário desconhecido';

        // Truncar descrição para preview
        const description = feedback.description || 'Sem descrição';
        const preview = description.length > 100
            ? description.substring(0, 100) + '...'
            : description;

        // Criar notificação para admin
        await db.collection('admin_notifications').add({
            type: 'new_bug',
            title: `${emoji} Novo bug reportado (${severity})`,
            message: `${userEmail}: ${preview}`,
            data: {
                bug_id: feedbackId,
                user_email: userEmail,
                severity: severity,
                url: feedback.url,
            },
            created_at: Timestamp.now(),
            read: false,
            read_at: null,
        });

        console.log(`[onFeedbackCreated] Notificação criada para bug: ${feedbackId} (${severity})`);
    }
);
