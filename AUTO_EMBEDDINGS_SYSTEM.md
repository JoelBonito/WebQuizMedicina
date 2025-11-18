# 🤖 Sistema Automático de Geração de Embeddings

## 📋 **Visão Geral**

Sistema assíncrono que **automaticamente** gera embeddings para PDFs assim que o texto é extraído, garantindo que o RAG esteja sempre pronto.

**Fluxo Completo:**
```
1. Usuário faz upload de PDF
2. extract-text-from-pdf processa e salva extracted_content
3. ✨ Trigger SQL marca source como 'pending'
4. ✨ Database Webhook chama process-embeddings-queue
5. ✨ Embeddings são gerados em background
6. ✨ Status atualizado para 'completed'
7. Quiz/Flashcards/Summary usam RAG automaticamente
```

**Vantagens:**
- ✅ Zero ação do usuário (UX perfeita)
- ✅ Processamento assíncrono (não bloqueia UI)
- ✅ Retry automático em caso de falha
- ✅ Tracking completo de status
- ✅ Escalável (processa em lote)

---

## 🏗️ **Arquitetura**

### **Componentes:**

| Componente | Responsabilidade | Tipo |
|------------|------------------|------|
| `sources.embeddings_status` | Tracking de status | Database Column |
| `trigger_auto_queue_embeddings()` | Auto-marcar como pending | SQL Trigger |
| `process-embeddings-queue` | Processar fila | Edge Function |
| Database Webhook | Disparar processamento | Supabase Feature |

### **Estados (embeddings_status):**

| Status | Descrição | Próximo Estado |
|--------|-----------|----------------|
| `pending` | Aguardando processamento | `processing` |
| `processing` | Gerando embeddings | `completed` ou `failed` |
| `completed` | Embeddings prontos | - |
| `failed` | Erro no processamento | `pending` (retry manual) |
| `skipped` | Sem conteúdo para processar | - |

---

## 📦 **Instalação**

### **Passo 1: Aplicar Migration**

```bash
# Execute no Supabase SQL Editor
cat supabase/migrations/006_auto_embeddings_queue.sql
```

Ou via CLI:
```bash
supabase db reset  # Aplica todas migrations
```

**O que a migration faz:**
- ✅ Adiciona coluna `embeddings_status` em sources
- ✅ Adiciona coluna `updated_at` em sources
- ✅ Cria trigger SQL que auto-marca como 'pending'
- ✅ Cria funções auxiliares (mark_*, get_queue, etc)
- ✅ Cria índices para performance
- ✅ Atualiza sources existentes com status correto

### **Passo 2: Deploy Edge Function**

```bash
supabase functions deploy process-embeddings-queue
```

**Verificar deploy:**
```bash
supabase functions list | grep process-embeddings-queue
```

### **Passo 3: Configurar Database Webhook**

#### **Opção A: Via Supabase Dashboard (Recomendado)**

1. Acesse: **Database → Webhooks → Create a new hook**

2. Configure:
   ```
   Name: auto-process-embeddings
   Table: sources
   Events: INSERT, UPDATE
   Type: HTTP Request
   Method: POST
   URL: https://seu-projeto.supabase.co/functions/v1/process-embeddings-queue
   HTTP Headers:
     Authorization: Bearer SEU_ANON_KEY
     Content-Type: application/json
   ```

3. **Payload (importante!):**
   ```json
   {
     "source_id": "{{ record.id }}",
     "max_items": 1
   }
   ```

4. **Condition (filtro):**
   ```sql
   new.embeddings_status = 'pending'
   AND new.extracted_content IS NOT NULL
   ```

5. Salve e teste!

#### **Opção B: Via SQL**

```sql
-- Webhook será criado via interface do Supabase
-- Esta é apenas referência do que será configurado
```

### **Passo 4: Configurar Cron Job (Backup/Fallback)**

Caso o webhook falhe, ter um cron job garante processamento:

**Via Supabase Dashboard:**
1. Acesse: **Database → Cron Jobs**
2. Criar novo job:
   ```sql
   SELECT
     cron.schedule(
       'process-pending-embeddings',
       '*/5 * * * *',  -- A cada 5 minutos
       $$
       SELECT net.http_post(
         url := 'https://seu-projeto.supabase.co/functions/v1/process-embeddings-queue',
         headers := '{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
         body := '{"max_items": 10}'::jsonb
       );
       $$
     );
   ```

**Opcional:** Desabilitar se webhook funcionar 100%

---

## 🧪 **Como Testar**

### **Teste 1: Upload de PDF**

```bash
# 1. Upload um PDF via interface
# 2. Aguardar extract-text-from-pdf processar

# 3. Verificar status no banco
SELECT
  id,
  name,
  embeddings_status,
  LENGTH(extracted_content) as content_size,
  updated_at
FROM sources
ORDER BY updated_at DESC
LIMIT 5;
```

**Resultado esperado:**
```
embeddings_status = 'pending'  (após extract-text)
                 ↓
embeddings_status = 'processing'  (webhook dispara)
                 ↓
embeddings_status = 'completed'  (após 3-10s)
```

### **Teste 2: Verificar Embeddings Gerados**

```sql
SELECT
  s.name,
  s.embeddings_status,
  COUNT(sc.id) as chunk_count,
  s.metadata->>'embeddings_chunks' as chunks_from_metadata,
  s.metadata->>'embeddings_completed_at' as completed_at
FROM sources s
LEFT JOIN source_chunks sc ON s.id = sc.source_id
GROUP BY s.id, s.name, s.embeddings_status, s.metadata
ORDER BY s.updated_at DESC;
```

### **Teste 3: Chamar Queue Manualmente**

```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_items": 5}'
```

**Resposta esperada:**
```json
{
  "success": true,
  "processed": 2,
  "failed": 0,
  "total_duration_ms": 5432,
  "details": [
    {
      "source_id": "uuid-1",
      "source_name": "Cardiologia.pdf",
      "status": "success",
      "chunks_created": 25,
      "duration_ms": 2714
    },
    {
      "source_id": "uuid-2",
      "source_name": "Neurologia.pdf",
      "status": "success",
      "chunks_created": 18,
      "duration_ms": 2718
    }
  ]
}
```

### **Teste 4: Verificar Logs**

```bash
# Logs do webhook (se configurado)
# Ver em: Database → Webhooks → auto-process-embeddings → Logs

# Logs da edge function
supabase functions logs process-embeddings-queue --tail
```

**Logs esperados:**
```
🚀 [Queue] Starting embeddings queue processor
📊 [Queue] Found 1 sources to process
📄 [Queue] Processing source: Cardiologia.pdf (uuid-123)
📦 [Queue] Chunking text (25431 chars)...
✅ [Queue] Created 25 chunks
🎯 [Queue] Generating embeddings...
💾 [Queue] Storing 25 chunks...
✅ [Queue] Successfully processed "Cardiologia.pdf"
   └─ Chunks: 25, Avg tokens: 650, Duration: 2714ms
🏁 [Queue] Processing complete
   └─ Processed: 1, Failed: 0, Duration: 2714ms
```

---

## 🔧 **Funções SQL Auxiliares**

### **1. Verificar Fila**

```sql
SELECT * FROM get_pending_embeddings_queue(10);
```

Retorna até 10 sources pendentes.

### **2. Marcar Manualmente para Processar**

```sql
SELECT queue_source_for_embeddings('uuid-do-source');
```

Força um source específico para a fila.

### **3. Reprocessar Sources com Falha**

```sql
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'failed';
```

### **4. Estatísticas**

```sql
SELECT
  embeddings_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sources
WHERE extracted_content IS NOT NULL
GROUP BY embeddings_status
ORDER BY count DESC;
```

**Resultado exemplo:**
```
embeddings_status | count | percentage
------------------+-------+-----------
completed         |   45  |  90.00
pending           |    3  |   6.00
failed            |    2  |   4.00
```

---

## 🚨 **Troubleshooting**

### **Problema: Source fica em 'pending' para sempre**

**Causa:** Webhook não configurado ou falhou

**Solução:**
```bash
# 1. Verificar webhook configurado
# Dashboard → Database → Webhooks

# 2. Chamar manualmente
curl -X POST .../process-embeddings-queue \
  -d '{"source_id": "uuid-aqui"}'

# 3. Ver logs da edge function
supabase functions logs process-embeddings-queue
```

### **Problema: Status fica em 'processing' para sempre**

**Causa:** Edge function crashou no meio do processamento

**Solução:**
```sql
-- Resetar para pending
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

### **Problema: 'failed' com erro no metadata**

**Verificar erro:**
```sql
SELECT
  name,
  metadata->>'embeddings_error' as error,
  metadata->>'embeddings_failed_at' as failed_at
FROM sources
WHERE embeddings_status = 'failed';
```

**Corrigir e reprocessar:**
```sql
-- Marcar para retry
SELECT queue_source_for_embeddings('uuid-do-source-com-falha');
```

### **Problema: Gemini API quota exceeded**

**Sintoma:** Múltiplos sources com status 'failed' e erro "quota exceeded"

**Solução:**
```bash
# 1. Pausar processamento temporariamente
# Desabilitar webhook ou cron job

# 2. Aguardar quota resetar

# 3. Reprocessar em lotes menores
curl -X POST .../process-embeddings-queue \
  -d '{"max_items": 3}'  # Processar só 3 por vez
```

---

## 📊 **Monitoramento**

### **Dashboard SQL - Status Geral**

```sql
WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE embeddings_status = 'completed') as completed,
    COUNT(*) FILTER (WHERE embeddings_status = 'pending') as pending,
    COUNT(*) FILTER (WHERE embeddings_status = 'processing') as processing,
    COUNT(*) FILTER (WHERE embeddings_status = 'failed') as failed,
    COUNT(*) as total
  FROM sources
  WHERE extracted_content IS NOT NULL
)
SELECT
  total as total_sources,
  completed as with_embeddings,
  pending as waiting,
  processing as in_progress,
  failed as errors,
  ROUND(completed * 100.0 / NULLIF(total, 0), 2) as completion_percentage
FROM stats;
```

### **Sources Processados Recentemente**

```sql
SELECT
  s.name,
  s.embeddings_status,
  s.metadata->>'embeddings_chunks' as chunks,
  s.metadata->>'embeddings_completed_at' as completed_at,
  EXTRACT(EPOCH FROM (NOW() - (s.metadata->>'embeddings_completed_at')::timestamptz)) / 60 as minutes_ago
FROM sources s
WHERE s.embeddings_status = 'completed'
ORDER BY (s.metadata->>'embeddings_completed_at')::timestamptz DESC
LIMIT 10;
```

---

## 🎯 **Configuração Recomendada**

### **Para Produção:**

1. ✅ **Database Webhook** - Processamento imediato ao extrair texto
2. ✅ **Cron Job (5 min)** - Fallback para garantir processamento
3. ✅ **Alertas** - Monitorar sources 'failed' via Supabase Dashboard
4. ✅ **Rate Limiting** - max_items = 10 no cron job

### **Para Desenvolvimento:**

1. ✅ **Apenas Cron Job (10 min)** - Mais previsível
2. ⚠️ **Webhook desabilitado** - Evitar processamento duplicado
3. ✅ **Logs verbose** - Debug facilitado

---

## 💰 **Custos**

**Gemini Embedding API:**
- ~$0.00001 por 1k tokens
- PDF médico típico: 30 chunks × 700 tokens = 21k tokens = **$0.0002**
- 1000 PDFs/mês = **$0.20/mês**

**Supabase Edge Functions:**
- Incluído no plano gratuito até 500k requests
- process-embeddings-queue: ~1 request por PDF
- 1000 PDFs/mês = 1000 requests = **grátis**

**Total: ~$0.20/mês para 1000 PDFs** ✅

---

## ✅ **Checklist de Implementação**

- [ ] Migration 006 aplicada
- [ ] Edge function process-embeddings-queue deployed
- [ ] SUPABASE_SERVICE_ROLE_KEY configurada nos secrets
- [ ] Database Webhook configurado
- [ ] Cron job configurado (opcional mas recomendado)
- [ ] Teste com 1 PDF - verificar status muda para 'completed'
- [ ] Teste com quiz/flashcards - verificar logs mostram PHASE 2
- [ ] Monitoramento configurado

---

## 🎉 **Resultado Final**

Após implementar este sistema:

**Antes:**
```
1. Upload PDF
2. extract-text-from-pdf
3. ⚠️ Usuário precisa chamar generate-embeddings manualmente
4. Quiz usa fallback (PHASE 0) se esquecer
```

**Depois:**
```
1. Upload PDF
2. extract-text-from-pdf
3. ✨ Sistema automaticamente gera embeddings em background
4. Quiz SEMPRE usa RAG (PHASE 2) ✅
```

**UX do Usuário:**
1. Upload PDF ✅
2. Aguarda 2-5s ✅
3. PDF pronto com RAG ✅
4. Gera quiz com busca semântica ✅

**Zero fricção! 🚀**
