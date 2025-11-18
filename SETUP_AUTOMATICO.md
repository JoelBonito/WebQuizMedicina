# 🚀 Setup Sistema Automático de Embeddings

**Tempo estimado:** 15 minutos

## 📋 Pré-requisitos

Você precisa ter:
- ✅ Migration 006 aplicada (já feito)
- ✅ Source criado e em status `pending` (já feito)
- ⚠️ Supabase CLI instalado na sua máquina local
- ⚠️ Credenciais do Supabase (URL e keys)

---

## 🔧 Passo 1: Instalar Supabase CLI (se necessário)

```bash
# macOS
brew install supabase/tap/supabase

# Windows (PowerShell)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase

# Ou via npm (qualquer OS)
npm install -g supabase
```

Verificar instalação:
```bash
supabase --version
```

---

## 🔐 Passo 2: Login no Supabase

```bash
supabase login
```

Isso vai abrir o browser para você fazer login.

---

## 🚢 Passo 3: Deploy da Edge Function

**Na pasta raiz do projeto:**

```bash
cd /caminho/para/WebQuizMedicina

# Link com seu projeto (primeira vez)
supabase link --project-ref SEU_PROJECT_REF

# Deploy da função
supabase functions deploy process-embeddings-queue
```

**Como descobrir seu PROJECT_REF:**
- Dashboard Supabase → Settings → General → Reference ID

**Resultado esperado:**
```
Deploying function process-embeddings-queue...
✓ Function deployed successfully
Function URL: https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue
```

---

## 🎯 Passo 4: Testar Edge Function Manualmente

```bash
# Pegar sua ANON_KEY do dashboard:
# Dashboard → Settings → API → anon public

# Testar processamento
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_items": 10}'
```

**Resultado esperado:**
```json
{
  "success": true,
  "processed": 1,
  "failed": 0,
  "total_duration_ms": 3500
}
```

**Verificar no SQL Editor:**
```sql
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks
FROM sources
ORDER BY updated_at DESC
LIMIT 5;
```

Se o status mudou para `completed` → **Sucesso! Edge function funcionando! ✅**

---

## ⚡ Passo 5: Configurar Database Webhook (Automação)

**Agora vamos fazer disparar automaticamente quando um source ficar pronto.**

### 5.1. No Supabase Dashboard:

1. **Database → Webhooks → Create a new hook**

2. **Configuração Básica:**

| Campo | Valor |
|-------|-------|
| Name | `auto-process-embeddings` |
| Table | `public.sources` |
| Events | ☑️ INSERT, ☑️ UPDATE |
| Type | HTTP Request |
| Method | `POST` |

3. **URL:**
```
https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue
```

Substitua `SEU_PROJETO` pelo seu Project Reference ID.

**Como descobrir:** Dashboard → Settings → API → Project URL

4. **HTTP Headers:**

Adicione 2 headers:

**Header 1:**
- Name: `Authorization`
- Value: `Bearer SUA_ANON_KEY`

**Header 2:**
- Name: `Content-Type`
- Value: `application/json`

**Para pegar a ANON_KEY:**
- Dashboard → Settings → API → Project API keys → `anon` `public`

5. **HTTP Payload:**
```json
{
  "source_id": "{{ record.id }}",
  "max_items": 1
}
```

6. **Condition (Importante!):**

Cole exatamente:
```sql
new.embeddings_status = 'pending'
AND new.extracted_content IS NOT NULL
AND new.extracted_content != ''
AND (old.extracted_content IS NULL OR old.extracted_content = '')
```

**O que isso faz:**
- Só dispara quando um source:
  - Muda para status `pending`
  - Tem conteúdo extraído
  - Não tinha conteúdo antes (evita loops)

7. **Clique em "Create webhook"**

---

## ✅ Passo 6: Testar Sistema Automático

### Teste 1: Source existente

```sql
-- No Supabase SQL Editor:

-- Criar um source de teste
INSERT INTO sources (
  project_id,
  name,
  type,
  storage_path,
  extracted_content,
  status,
  embeddings_status
)
SELECT
  id,
  '[TESTE WEBHOOK] Documento Automático',
  'pdf',
  '/test/webhook-test.pdf',
  'Este é um teste do webhook automático. O sistema deve processar este source automaticamente em 3-10 segundos.',
  'ready',
  'pending'
FROM projects
LIMIT 1;

-- Aguardar 5-10 segundos...

-- Verificar status
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks,
  updated_at
FROM sources
WHERE name LIKE '[TESTE WEBHOOK]%'
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado esperado:**
- `embeddings_status` = `completed`
- `chunks` = número > 0

**Se funcionou → Sistema 100% automático! 🎉**

---

## 🔄 Passo 7: Cron Job (Backup - Recomendado)

Para garantir que sources pendentes sejam processados mesmo se o webhook falhar:

```sql
-- No Supabase SQL Editor:

-- 1. Ativar extensão pg_cron (se não ativada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Ativar extensão pg_net (para fazer HTTP requests)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Criar job que roda a cada 5 minutos
SELECT cron.schedule(
  'process-pending-embeddings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUA_ANON_KEY'
    ),
    body := jsonb_build_object(
      'max_items', 10
    )
  );
  $$
);

-- 4. Verificar jobs ativos
SELECT * FROM cron.job;
```

**Para desabilitar o cron (se webhook funcionar perfeitamente):**
```sql
SELECT cron.unschedule('process-pending-embeddings');
```

---

## 📊 Passo 8: Monitoramento

### Dashboard SQL para acompanhar:

```sql
-- Status geral
SELECT
  embeddings_status,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percent
FROM sources
WHERE extracted_content IS NOT NULL
GROUP BY embeddings_status
ORDER BY total DESC;

-- Fila pendente
SELECT
  id,
  name,
  AGE(NOW(), created_at) as waiting_time
FROM sources
WHERE embeddings_status = 'pending'
ORDER BY created_at;

-- Últimos processados
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks,
  metadata->>'embeddings_completed_at' as completed_at
FROM sources
WHERE embeddings_status = 'completed'
ORDER BY updated_at DESC
LIMIT 10;

-- Erros
SELECT
  name,
  metadata->>'embeddings_error' as error,
  metadata->>'embeddings_failed_at' as failed_at
FROM sources
WHERE embeddings_status = 'failed'
ORDER BY updated_at DESC;
```

---

## 🚨 Troubleshooting

### Source fica em 'pending' para sempre

**Verificar:**
1. Edge function está deployed?
   ```bash
   supabase functions list
   ```

2. Webhook está configurado?
   - Dashboard → Database → Webhooks → deve aparecer `auto-process-embeddings`

3. Testar webhook manualmente:
   ```bash
   curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue \
     -H "Authorization: Bearer SUA_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"max_items": 10}'
   ```

4. Ver logs da edge function:
   ```bash
   supabase functions logs process-embeddings-queue --tail
   ```

### Source fica em 'processing' > 5 minutos

```sql
-- Resetar para pending
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

### Reprocessar sources com erro

```sql
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'failed';
```

---

## ✅ Checklist Final

- [ ] Supabase CLI instalado
- [ ] Login no Supabase feito
- [ ] Edge function deployed
- [ ] Edge function testada manualmente (curl)
- [ ] Webhook configurado no dashboard
- [ ] Teste automático funcionou (source → pending → completed em 5-10s)
- [ ] Cron job configurado (opcional)

---

## 🎉 Pronto!

Agora seu sistema está **100% automático**:

```
┌─────────────────────────────────────────┐
│ Fluxo Automático                        │
├─────────────────────────────────────────┤
│ 1. Usuário faz upload de PDF           │
│ 2. extract-text-from-pdf extrai texto  │
│ 3. Trigger marca como 'pending'        │
│ 4. Webhook dispara edge function       │
│ 5. Edge function gera embeddings       │
│ 6. Status → 'completed' (3-10s)        │
│ 7. Quiz usa RAG automaticamente        │
└─────────────────────────────────────────┘
```

**Sem ação do usuário necessária! 🚀**

---

## 📞 Suporte

Se encontrar problemas:

1. Ver logs: `supabase functions logs process-embeddings-queue`
2. Ver script de teste manual: `MANUAL_TEST_EMBEDDINGS.sql`
3. Ver documentação completa: `AUTO_EMBEDDINGS_SYSTEM.md`
