# 🧪 Teste do Sistema de Feedback (Firestore)

## Objetivo
Testar se o botão SOS está enviando corretamente os feedbacks para o Firestore.

## Passos para Teste

### 1. Prepare o Ambiente
1. Certifique-se de que o app está rodando (`npm run dev`)
2. Faça login no app
3. Abra o [Firebase Console](https://console.firebase.google.com)
4. Navegue até: **Firestore Database**

### 2. Envie um Feedback de Teste
1. No app, clique no **botão SOS (⚠️)** no topo da Navbar
2. Selecione uma gravidade (ex: "Média")
3. Digite uma descrição de teste:
   ```
   TESTE - Verificando integração Firestore
   URL: [página atual]
   ```
4. Clique em "Enviar Report"
5. Aguarde a mensagem de sucesso: "Obrigado! Report enviado com sucesso."

### 3. Verifique no Firestore
1. No Firebase Console, vá para **Firestore Database**
2. Procure pela collection `feedback`
3. Você deve ver um documento recém-criado com os campos:
   - `user_id` - ID do usuário
   - `user_email` - Email do usuário
   - `description` - Descrição do problema
   - `severity` - "low", "medium" ou "high"
   - `type` - "bug"
   - `status` - "open"
   - `created_at` - Timestamp
   - `user_agent` - Navegador/Device
   - `url` - URL da página
   - `project_id` - (opcional) ID do projeto se estava em uma página de projeto

### 4. Testes Adicionais

#### Teste em Diferentes Páginas
- Dashboard: `url` deve ser "/"
- Projeto: `url` deve conter "/project/{id}" e `project_id` deve estar preenchido
- Admin: `url` deve conter "/admin"

#### Teste com Diferentes Gravidades
- Envie com "Low", "Medium" e "High"
- Verifique se o campo `severity` reflete corretamente

#### Teste Offline
- Desconecte a internet
- Tente enviar feedback
- Deve aparecer erro: "Error sending. Try again."

## Critérios de Sucesso ✅

- [x] Modal SOS abre ao clicar no botão ⚠️
- [ ] Campos do formulário funcionam corretamente
- [ ] Envio cria documento na collection `feedback`
- [ ] Todos os campos obrigatórios estão preenchidos
- [ ] `project_id` é capturado quando em página de projeto
- [ ] Timestamp `created_at` está correto
- [ ] Mensagem de sucesso aparece após envio
- [ ] Badge "BETA" está visível no botão

## Resolução de Problemas

### Erro: "Missing or insufficient permissions"
**Solução**: Verificar regras do Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /feedback/{feedbackId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}
```

### Documento não aparece no Firestore
**Possíveis causas**:
1. Regras de segurança bloqueando
2. Problema de conexão
3. Erro de autenticação

**Solução**: Verificar console do navegador (F12) para erros

## Status
- ✅ Componente HelpModal implementado
- ✅ Integração Firestore implementada
- ✅ UI/UX do botão SOS completo
- ⏳ Aguardando teste manual de envio
