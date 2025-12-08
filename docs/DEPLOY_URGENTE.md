# ⚡ Deploy Urgente - Sistema Automático de Embeddings

## 🎯 Problema Resolvido

O webhook não disparava porque a função `process-embeddings-queue` **não estava deployada**.

## 📦 O Que Precisa Fazer AGORA

### 1️⃣ Deploy da Função (URGENTE)

Você precisa fazer deploy da função `process-embeddings-queue`:

#### Opção A: Via Supabase CLI (Recomendado)

Se você tem o Supabase CLI instalado localmente:

```bash
cd /home/user/WebQuizMedicina
supabase functions deploy process-embeddings-queue --project-ref bwgglfforazywrjhbxsa
```

#### Opção B: Via Dashboard do Supabase

Se não tem o CLI:

1. Vá para: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/functions
2. Clique em "Deploy function"
3. Selecione a função: `process-embeddings-queue`
4. Confirme o deploy

#### Opção C: Via GitHub Actions / CI/CD

Se você usa automação, adicione esta função ao seu pipeline de deploy.

---

### 2️⃣ Configurar o Webhook

Depois do deploy, configure o webhook seguindo o guia:

📖 **Leia:** `CONFIGURAR_WEBHOOK.md` (passo a passo visual completo)

**Resumo rápido:**

1. Abra: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks
2. Clique em "Create a new hook"
3. Copie/cole as configurações de `WEBHOOK_CONFIG.txt`

**Configuração crítica:**

- **URL:** `https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue`
- **Table:** `public.sources`
- **Events:** INSERT, UPDATE
- **Condition:** `new.embeddings_status = 'pending' AND new.extracted_content IS NOT NULL`

---

### 3️⃣ Testar

Depois de configurar:

1. Faça upload de um PDF novo
2. Aguarde 10-30 segundos
3. Verifique a coluna `embeddings_status` na tabela `sources`
4. Deve mudar de `pending` → `completed`

---

## 🔍 Como Verificar se Funcionou

### Verificar se a função foi deployada:

```bash
curl https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU"
```

**Resposta esperada:** Deve processar 1 source com status pending (ou retornar 0 se não houver nenhum pending)

### Verificar se o webhook está configurado:

1. Vá em: Database → Webhooks
2. Procure por: `auto-process-embeddings`
3. Status deve estar: **Enabled** (verde)

---

## 📊 Todas as Funções que Precisam Deploy

Para ter o sistema 100% funcional, certifique-se que estas 5 funções estão deployadas:

1. ✅ `generate-quiz` - Gerar quizzes
2. ✅ `generate-flashcards` - Gerar flashcards
3. ✅ `generate-summary` - Gerar resumos
4. ✅ `chat` - Chat com IA
5. ⚠️ `process-embeddings-queue` - **FALTAVA ESTA!** (processamento automático)

---

## 🚨 Se Você Usa Deploy Manual

Se você costuma fazer deploy manualmente via dashboard:

1. Entre em: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/functions
2. Verifique se todas as 5 funções acima estão listadas
3. Se `process-embeddings-queue` não estiver, faça deploy dela

---

## 📁 Estrutura de Arquivos

A função está em:
```
/home/user/WebQuizMedicina/supabase/functions/process-embeddings-queue/index.ts
```

---

## ⏱️ Timeline Esperado

Depois de fazer upload de um PDF:

| Tempo | O Que Acontece |
|-------|----------------|
| 0s | PDF é salvo, `embeddings_status = 'pending'` |
| < 1s | Webhook dispara a função `process-embeddings-queue` |
| 1-5s | Função extrai chunks do texto |
| 5-20s | Gemini gera embeddings para cada chunk |
| 20-30s | Embeddings são salvos no banco |
| 30s | `embeddings_status = 'completed'` ✅ |

**Total:** 10-30 segundos para processar automaticamente!

---

## 🐛 Troubleshooting

### "Function not found"

**Problema:** Função não foi deployada
**Solução:** Execute o deploy da função conforme instruções acima

### "Webhook não dispara"

**Problema 1:** Webhook não configurado
**Solução:** Siga `CONFIGURAR_WEBHOOK.md`

**Problema 2:** URL incorreta no webhook
**Solução:** Verifique se a URL termina com `/process-embeddings-queue`

**Problema 3:** Condition incorreta
**Solução:** Copie exatamente de `WEBHOOK_CONFIG.txt`

### "Status fica em pending"

**Verificações:**

1. Função está deployada? → Teste o curl acima
2. Webhook está enabled? → Verifique no dashboard
3. Há erros nos logs? → Veja logs da edge function

---

## 📚 Arquivos de Referência

- `CONFIGURAR_WEBHOOK.md` - Guia visual passo a passo (LEIA ESTE!)
- `WEBHOOK_CONFIG.txt` - Configuração para copiar/colar
- `deploy-functions.sh` - Script automático (requer Supabase CLI)
- `COMANDOS_PRONTOS.sh` - Comandos úteis para testar

---

## ✅ Checklist Final

Antes de testar, confirme:

- [ ] Função `process-embeddings-queue` está deployada
- [ ] Webhook `auto-process-embeddings` está criado
- [ ] Webhook está **Enabled** (verde)
- [ ] URL do webhook está correta
- [ ] Headers Authorization e Content-Type estão corretos
- [ ] Payload tem `{{ record.id }}`
- [ ] Condition SQL está correta

**Se todos os itens estiverem ✅, faça upload de um PDF e aguarde 30 segundos!**
