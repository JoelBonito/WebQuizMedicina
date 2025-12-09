# Plano de Ação - Resolução de `FirebaseError: [code=permission-denied]

## Contexto
O hook `useUserPreferences` foi migrado para a coleção `user_profiles`, porém o erro de permissão persiste. Isso indica que as regras de segurança do Firestore podem não estar implantadas ou que o documento do usuário ainda não existe.

## Etapas Propostas
1. **Verificar implantação das regras Firestore**
   - Executar `firebase deploy --only firestore:rules` no terminal.
   - Confirmar no console do Firebase que as regras para a coleção `user_profiles` estão ativas e contêm:
     ```
     match /user_profiles/{userId} {
       allow read, write: if isOwner(userId);
     }
     ```
2. **Confirmar existência do documento `user_profiles/{uid}`**
   - Acessar o console do Firestore e buscar o documento com o UID do usuário autenticado.
   - Se o documento não existir, criar manualmente ou garantir que `ProfileContext` o crie na primeira sessão.
3. **Testar novamente a aplicação**
   - Recarregar a página (preferencialmente em modo incógnito) e observar se o erro persiste.
4. **Caso ainda haja erro**
   - Revisar a função `isOwner` nas regras para garantir que utiliza `request.auth.uid == userId`.
   - Verificar se o usuário está realmente autenticado (token válido) ao chamar `useUserPreferences`.

## Próximos Passos
- O usuário deve executar o comando de deploy e confirmar se as regras foram aplicadas.
- Após a verificação, podemos prosseguir com ajustes adicionais no código, se necessário.
