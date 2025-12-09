import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Cloud Function Trigger: Novo Usuário Cadastrado
 * 
 * Dispara automaticamente quando um novo documento é criado em user_profiles.
 * Cria uma notificação para o admin no painel de notificações.
 */
export const onUserCreated = onDocumentCreated(
    'user_profiles/{userId}',
    async (event) => {
        const db = getFirestore();
        const newUser = event.data?.data();

        if (!newUser) {
            console.warn('[onUserCreated] Dados do usuário não encontrados');
            return;
        }

        const userId = event.params.userId;
        const displayName = newUser.display_name || 'Usuário';

        // Criar notificação para admin
        await db.collection('admin_notifications').add({
            type: 'new_user',
            title: 'Novo usuário cadastrado',
            message: `${displayName} acabou de se registrar no sistema`,
            data: {
                user_id: userId,
                user_email: newUser.display_name,
                created_at: newUser.created_at,
            },
            created_at: Timestamp.now(),
            read: false,
            read_at: null,
        });

        console.log(`[onUserCreated] Notificação criada para novo usuário: ${userId} (${displayName})`);
    }
);
