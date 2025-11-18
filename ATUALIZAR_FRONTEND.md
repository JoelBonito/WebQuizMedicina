# 🔄 Como Atualizar o Frontend

A correção do chat foi commitada, mas você precisa atualizar o frontend para ver as mudanças.

## Opção 1: Desenvolvimento Local (npm run dev)

Se você está rodando `npm run dev`:

```bash
# 1. Pare o servidor (Ctrl+C)

# 2. Limpe o cache do Vite
rm -rf node_modules/.vite

# 3. Reinicie o servidor
npm run dev
```

**Depois:**
1. Abra o navegador
2. Pressione `Ctrl+Shift+R` (ou `Cmd+Shift+R` no Mac) para fazer hard refresh
3. Abra o Console do navegador (F12 → Console)
4. Teste o chat e veja se agora aparece o conteúdo das mensagens

---

## Opção 2: Build de Produção

Se você fez build para produção:

```bash
# 1. Faça um novo build
npm run build

# 2. Teste localmente (opcional)
npm run preview

# 3. Faça deploy do build
# (comando depende da sua plataforma: Vercel, Netlify, etc.)
```

---

## Opção 3: Deploy Automático (Vercel/Netlify)

Se você usa Vercel ou Netlify com auto-deploy:

```bash
# O deploy acontece automaticamente quando você faz push
# Aguarde 2-3 minutos para o deploy completar

# Depois:
# 1. Abra a aplicação
# 2. Limpe o cache do navegador (Ctrl+Shift+R)
# 3. Teste o chat
```

---

## 🧪 Como Testar se Funcionou

1. **Abra a aplicação**
2. **Selecione um projeto com fontes**
3. **Vá para a aba "Chat"**
4. **Envie uma mensagem de teste**
5. **Verifique se aparece:**
   - ✅ Sua pergunta completa (não só o horário)
   - ✅ A resposta da IA completa (não só o horário)
   - ✅ Fontes citadas (se houver)

---

## 🐛 Se Ainda Não Funcionar

### 1. Verifique o Console do Navegador
Abra o Console (F12) e procure por erros. Envie os erros para mim.

### 2. Verifique as Mensagens no Banco
```sql
-- Execute no SQL Editor do Supabase
SELECT * FROM chat_messages
WHERE project_id = 'SEU_PROJECT_ID'
ORDER BY created_at DESC
LIMIT 10;
```

Você deve ver:
- Mensagens com `role = 'user'` e `content` preenchido
- Mensagens com `role = 'assistant'` e `content` preenchido

### 3. Verifique a Versão do useChat
Abra `src/hooks/useChat.ts` e confirme que tem a função `convertDbMessagesToUiFormat()` no topo do arquivo.

---

## 📦 Deploy das Edge Functions

**IMPORTANTE:** Se você ainda não fez deploy das edge functions corrigidas, faça agora:

```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

Isso vai fazer deploy de:
- ✅ generate-quiz (com recuperação de JSON)
- ✅ generate-flashcards (com auto-detecção)
- ✅ chat (com schema correto role+content)
