"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
/**
 * Cloud Function Trigger: Novo Usuário Cadastrado
 *
 * Dispara automaticamente quando um novo documento é criado em user_profiles.
 * Cria uma notificação para o admin no painel de notificações.
 */
exports.onUserCreated = (0, firestore_1.onDocumentCreated)('user_profiles/{userId}', async (event) => {
    var _a;
    const db = (0, firestore_2.getFirestore)();
    const newUser = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
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
        created_at: firestore_2.Timestamp.now(),
        read: false,
        read_at: null,
    });
    console.log(`[onUserCreated] Notificação criada para novo usuário: ${userId} (${displayName})`);
});
//# sourceMappingURL=on_user_created.js.map