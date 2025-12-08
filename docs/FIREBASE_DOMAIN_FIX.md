# 🔐 Resolver Erro de Autenticação Google - Domínio Não Autorizado

## 📋 Problema Identificado

**Erro:** `Firebase: Error (auth/auth-domain-config-required)`

**Causa:** O domínio `webquizmedicina.inovesi.app.br` não está autorizado no Firebase Authentication para OAuth.

---

## ✅ Solução Passo a Passo

### 1. Acessar o Firebase Console

1. Acesse: https://console.firebase.google.com/
2. Selecione o projeto: **web-quiz-medicina**

### 1.1 Verificar Variáveis de Ambiente (.env) ⚠️ CRÍTICO

Seu arquivo `.env` deve conter as chaves do Firebase. Se estiverem faltando, o erro `auth-domain-config-required` aparecerá.

Verifique seu arquivo `.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=web-quiz-medicina.firebaseapp.com  <-- OBRIGATÓRIO
VITE_FIREBASE_PROJECT_ID=web-quiz-medicina
VITE_FIREBASE_STORAGE_BUCKET=web-quiz-medicina.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

> **Nota:** Se você adicionar estas variáveis agora, **reinicie o servidor** (`npm run dev`) para que tenham efeito.

### 2. Configurar Domínios Autorizados

1. No menu lateral, clique em **Authentication** (Autenticação)
2. Clique na aba **Settings** (Configurações)
3. Role até a seção **Authorized domains** (Domínios autorizados)
4. Clique no botão **Add domain** (Adicionar domínio)
5. Adicione o domínio: `webquizmedicina.inovesi.app.br`
6. Clique em **Add** (Adicionar)

### 3. Domínios que Devem Estar Autorizados

Certifique-se de que os seguintes domínios estão na lista:

```
localhost
web-quiz-medicina.firebaseapp.com
web-quiz-medicina.web.app
webquizmedicina.inovesi.app.br
```

### 4. Verificar Configuração do Google OAuth

1. Ainda dentro de **Authentication**
2. Clique na aba **Sign-in method**
3. Verifique se **Google** está habilitado
4. Se não estiver, clique em **Google** e habilite

---

## 🧪 Testar a Solução

1. Após adicionar o domínio, aguarde 1-2 minutos
2. Limpe o cache do navegador ou use Janela Anônima
3. Acesse: `https://webquizmedicina.inovesi.app.br`
4. Clique em **"Entrar com Google"**
5. Deve funcionar normalmente agora! ✅

---

## 📸 Evidência do Erro

O erro ocorria na tela de login ao clicar no botão "Google":

```
Firebase: Error (auth/auth-domain-config-required)
```

Este erro foi exibido em um toast vermelho na interface do usuário.

---

## 🔗 Documentação Oficial

- [Firebase Authentication - Domínios Autorizados](https://firebase.google.com/docs/auth/web/redirect-best-practices#customize-domain)
- [Error Codes - auth/auth-domain-config-required](https://firebase.google.com/docs/reference/js/auth#autherror)

---

## ⚠️ Notas Importantes

1. **Domínios de Desenvolvimento:** Para desenvolvimento local, `localhost` já é autorizado por padrão
2. **HTTPS Obrigatório:** Em produção, o Firebase exige HTTPS (seu domínio já usa)
3. **Subdomínios:** Cada subdomínio precisa ser adicionado separadamente
4. **Wildcard:** Firebase NÃO suporta wildcards (*.exemplo.com)

---

## 📝 Checklist de Verificação

- [ ] Domínio `webquizmedicina.inovesi.app.br` adicionado aos **Authorized domains**
- [ ] **Google Sign-in** está habilitado em **Sign-in method**
- [ ] Aguardou 1-2 minutos após adicionar o domínio
- [ ] Testou em janela anônima/incognito
- [ ] Limpou cache do navegador
- [ ] Testou o login com Google novamente

---

## 🚀 Próximos Passos (Opcional)

Se você planeja usar outros provedores OAuth (GitHub, Facebook, etc.), você também precisará:

1. Adicionar o domínio nas configurações de cada provedor
2. Configurar as credenciais OAuth (Client ID, Secret) no Firebase Console
3. Habilitar o provedor na aba **Sign-in method**

---

**Data de Criação:** 08 de Dezembro de 2024  
**Última Atualização:** 08 de Dezembro de 2024  
**Status:** ✅ Aguardando Implementação
