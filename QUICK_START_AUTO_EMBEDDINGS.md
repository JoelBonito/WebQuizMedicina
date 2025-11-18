# 🚀 Quick Start - Sistema Automático de Embeddings

## ⚡ **Setup Rápido (10 minutos)**

### **Passo 1: Aplicar Migration** (2 min)

```bash
# Opção A: Via Supabase SQL Editor
# 1. Copie todo o conteúdo de: supabase/migrations/006_auto_embeddings_queue.sql
# 2. Cole no SQL Editor
# 3. Execute

# Opção B: Via CLI
supabase db reset
```

---

### **Passo 2: Testar Instalação** (3 min)

```bash
# Execute o script de teste completo
# Arquivo: TEST_AUTO_EMBEDDINGS.sql
# Cole no Supabase SQL Editor e execute seção por seção
```

**Resultado esperado:**
```
✅ Coluna embeddings_status existe
✅ 6 funções SQL instaladas
✅ Trigger funciona
✅ Condição webhook OK
```

---

### **Passo 3: Deploy Edge Function** (1 min)

```bash
supabase functions deploy process-embeddings-queue
```

**Verificar:**
```bash
supabase functions list | grep process-embeddings-queue
```

---

### **Passo 4: Configurar Webhook** (4 min)

**Dashboard Supabase:**
1. **Database → Webhooks → Create a new hook**

2. **Configuração:**

| Campo | Valor |
|-------|-------|
| Name | `auto-process-embeddings` |
| Table | `sources` |
| Events | ☑️ INSERT, ☑️ UPDATE |
| Type | HTTP Request |
| Method | POST |
| URL | `https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue` |

3. **Headers:**
```
Authorization: Bearer SUA_ANON_KEY_AQUI
Content-Type: application/json
```

4. **Payload:**
```json
{
  "source_id": "{{ record.id }}",
  "max_items": 1
}
```

5. **Condition (escolha uma):**

**Versão Simples (Recomendada):**
```sql
new.embeddings_status = 'pending'
AND new.extracted_content IS NOT NULL
AND new.extracted_content != ''
AND (old.extracted_content IS NULL OR old.extracted_content = '')
```

**Versão Completa (Mais Segura):**
```sql
new.embeddings_status = 'pending'
AND new.extracted_content IS NOT NULL
AND new.extracted_content != ''
AND (
  old.embeddings_status IS NULL
  OR old.embeddings_status != 'pending'
  OR old.extracted_content IS NULL
  OR old.extracted_content = ''
)
```

6. **Salve!**

---

## ✅ **Teste Final**

### **1. Upload um PDF real**
```
Dashboard → Upload PDF → Aguarde processamento
```

### **2. Verifique status (SQL Editor):**
```sql
SELECT
  name,
  embeddings_status,
  LENGTH(extracted_content) as content_size,
  updated_at
FROM sources
ORDER BY updated_at DESC
LIMIT 5;
```

**Progresso esperado:**
```
pending     → (0-2s após extract-text)
processing  → (webhook disparou)
completed   → (3-10s depois)
```

### **3. Gere um quiz:**
```
Dashboard → Generate Quiz
```

### **4. Verifique logs:**
```bash
supabase functions logs generate-quiz --tail
```

**Log esperado:**
```
✅ [PHASE 2] Using semantic search with embeddings
📊 [PHASE 2] Using 15 chunks, avg similarity: 87.3%
```

---

## 🎯 **Fluxo Automático**

```
┌─────────────────────────────────────────────────────────┐
│ ANTES (Manual)                                          │
├─────────────────────────────────────────────────────────┤
│ 1. Upload PDF                                          │
│ 2. extract-text-from-pdf (2-3s)                        │
│ 3. ⚠️ Usuário chama generate-embeddings manualmente    │
│ 4. Quiz usa fallback se esqueceu                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DEPOIS (Automático) ✨                                  │
├─────────────────────────────────────────────────────────┤
│ 1. Upload PDF                                          │
│ 2. extract-text-from-pdf (2-3s)                        │
│ 3. ✅ Sistema auto-gera embeddings (3-7s background)   │
│ 4. Quiz SEMPRE usa RAG                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 **Cron Job (Backup - Opcional mas Recomendado)**

Para garantir processamento mesmo se webhook falhar:

**Supabase Dashboard → Database → Extensions:**
```sql
-- 1. Ativar pg_cron (se não ativado)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Criar job
SELECT cron.schedule(
  'process-pending-embeddings',
  '*/5 * * * *',  -- A cada 5 minutos
  $$
  SELECT net.http_post(
    url := 'https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_ANON_KEY"}'::jsonb,
    body := '{"max_items": 10}'::jsonb
  );
  $$
);
```

**Verificar jobs:**
```sql
SELECT * FROM cron.job;
```

**Desabilitar (se webhook funcionar perfeitamente):**
```sql
SELECT cron.unschedule('process-pending-embeddings');
```

---

## 📊 **Monitoramento**

### **Dashboard SQL:**
```sql
-- Status geral
SELECT
  embeddings_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM sources
WHERE extracted_content IS NOT NULL
GROUP BY embeddings_status;
```

### **Fila atual:**
```sql
SELECT * FROM get_pending_embeddings_queue(10);
```

### **Últimos processados:**
```sql
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks,
  metadata->>'embeddings_completed_at' as completed_at
FROM sources
WHERE embeddings_status = 'completed'
ORDER BY updated_at DESC
LIMIT 10;
```

### **Erros:**
```sql
SELECT
  name,
  metadata->>'embeddings_error' as error
FROM sources
WHERE embeddings_status = 'failed';
```

---

## 🚨 **Troubleshooting Rápido**

### **Source fica em 'pending' para sempre:**
```bash
# 1. Verificar webhook configurado
# Dashboard → Database → Webhooks

# 2. Chamar manualmente
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_items": 10}'
```

### **Source fica em 'processing' > 5 minutos:**
```sql
-- Resetar para pending
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

### **Reprocessar sources com falha:**
```sql
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'failed';
```

---

## ✅ **Checklist Final**

- [ ] Migration 006 aplicada
- [ ] Teste completo executado (todas seções OK)
- [ ] Edge function deployed
- [ ] Webhook configurado
- [ ] Testado com 1 PDF real
- [ ] Status mudou para 'completed' em ~5-10s
- [ ] Quiz mostra logs de PHASE 2 (semantic search)
- [ ] Cron job configurado (opcional mas recomendado)

---

## 🎉 **Pronto!**

Sistema 100% automático funcionando!

Agora **TODOS** os PDFs terão embeddings automaticamente sem ação do usuário.

**Custo:** ~$0.0002 por PDF (~$0.20 para 1000 PDFs/mês)

---

## 📚 **Documentação Completa**

- **AUTO_EMBEDDINGS_SYSTEM.md** - Guia completo e detalhado
- **TEST_AUTO_EMBEDDINGS.sql** - Script de teste completo
- **RAG_IMPLEMENTATION_GUIDE.md** - Guia do sistema RAG
