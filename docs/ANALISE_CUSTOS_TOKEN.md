# 📊 Análise de Custos de Token - Guia Completo

## 🎯 Como Executar a Análise

### Opção 1: Supabase SQL Editor (Recomendado)
1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Cole o conteúdo de `analyze_token_usage.sql`
4. Execute (Ctrl+Enter)

### Opção 2: Query Rápida (Resumo Geral)
```sql
-- RESUMO RÁPIDO - Últimas 24h
SELECT
  COUNT(*) as operacoes,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(SUM(cost_usd)::numeric, 4) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl,
  -- Cache stats
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as ops_com_cache,
  SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata IS NOT NULL) as tokens_cacheados,
  -- Economia estimada
  ROUND(
    (SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata IS NOT NULL) * 0.075 / 1000000 * 0.75)::numeric, 4
  ) as economia_cache_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## 🔍 O Que Cada Métrica Significa

### 1. **Total de Tokens**
- **Input Tokens**: Tokens enviados para o modelo (prompt + contexto)
- **Output Tokens**: Tokens gerados pelo modelo (resposta)
- **Cached Tokens**: Tokens servidos do cache (75% de desconto!)

### 2. **Custos**
```
Gemini 2.5 Flash (padrão):
- Input: $0.075 / 1M tokens
- Output: $0.30 / 1M tokens
- Cached Input: $0.01875 / 1M tokens (75% desconto)

Gemini 2.5 Pro (focused summary):
- Input: $1.25 / 1M tokens
- Output: $5.00 / 1M tokens
- Cached Input: $0.3125 / 1M tokens (75% desconto)
```

### 3. **Taxa de Câmbio**
- USD → BRL: R$ 5,50 (aproximado)

---

## ✅ Otimizações Implementadas

### 1. **Context Caching** (Economia de 75%)
**Onde está ativo:**
- ✅ **chat**: Cache do contexto do projeto (renova a cada 10min)
- ✅ **generate-quiz**: Cache quando gera >5 questões (batches)
- ✅ **generate-flashcards**: Cache quando gera >10 cards (batches)
- ✅ **generate-recovery-quiz**: Cache sempre (múltiplos batches focados)
- ✅ **generate-recovery-flashcards**: Cache sempre (múltiplos batches atômicos)

**Como verificar se está funcionando:**
```sql
-- Operações que DEVEM ter cache (batches múltiplos)
SELECT
  operation_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as com_cache,
  ROUND((COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0)::float / COUNT(*) * 100), 2) as percentual
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND operation_type IN ('quiz', 'flashcard')
GROUP BY operation_type;
```

**Resultado esperado:**
- Quiz (>5 questões): ~80-100% com cache
- Flashcards (>10 cards): ~80-100% com cache
- Chat (conversas longas): ~60-80% com cache

---

### 2. **Token Limits por Operação**
**Busca Semântica:**
- Chat: 20.000 tokens de contexto
- Quiz: 15.000 tokens de contexto
- Flashcards: 15.000 tokens de contexto
- Recovery Quiz: 12.000 tokens (mais focado)
- Recovery Flashcards: 10.000 tokens (ainda mais focado)

**Benefício:** Evita prompts gigantes que custam caro e degradam qualidade.

**Como verificar se está funcionando:**
```sql
-- Top 10 operações com mais input tokens
SELECT
  operation_type,
  tokens_input,
  metadata->>'mode' as modo,
  created_at::date
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY tokens_input DESC
LIMIT 10;
```

**Resultado esperado:**
- Nenhuma operação de quiz/flashcard deve ter >20k input tokens
- Recovery deve ter <15k input tokens

---

### 3. **Batch Processing com Output Limits**
**Configuração:**
```typescript
// Quiz
QUIZ_SIMPLE: { output: 1500, max: 5 }       // 5 questões por batch
QUIZ_MULTIPLE: { output: 8000, max: 20 }    // 20 questões em 3-4 batches

// Flashcards
FLASHCARD: { output: 2000, max: 10 }        // 10 cards por batch
```

**Benefício:** Reduz chance de timeout e permite caching entre batches.

**Como verificar:**
```sql
-- Contagem de batches (sessões com múltiplas operações próximas)
SELECT
  metadata->>'session_id' as session,
  operation_type,
  COUNT(*) as batches,
  SUM(tokens_output) as total_output
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND metadata->>'session_id' IS NOT NULL
GROUP BY metadata->>'session_id', operation_type
HAVING COUNT(*) > 1
ORDER BY batches DESC;
```

---

### 4. **Modelo Flash vs Pro (Economia de 95%)**
**Distribuição:**
- 70% das operações: Flash ($0.075/1M in)
- 30% das operações: Embeddings ($0.03/1M)
- 10% das operações: Pro ($1.25/1M in) - APENAS focused summary

**Como verificar:**
```sql
SELECT
  metadata->>'model' as modelo,
  COUNT(*) as quantidade,
  ROUND((COUNT(*)::float / SUM(COUNT(*)) OVER () * 100), 2) as percentual,
  ROUND(SUM(cost_usd)::numeric, 4) as custo_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY metadata->>'model'
ORDER BY custo_usd DESC;
```

**Resultado esperado:**
- `gemini-2.5-flash`: ~70% das operações
- `gemini-2.5-pro`: <10% das operações
- Pro NÃO deve aparecer em quiz/flashcards regulares

---

## 🚨 Red Flags - Quando os Custos Estão Altos

### ❌ Problema 1: Cache Não Está Funcionando
**Sintoma:**
```sql
-- Se esse número for <50%, há problema
SELECT
  ROUND((COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0)::float / COUNT(*) * 100), 2) as pct_cache
FROM token_usage_logs
WHERE operation_type IN ('quiz', 'flashcard')
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Causa provável:**
- Cache TTL muito curto (deve ser 600s)
- Batches não estão sendo criados
- Função de cache está falhando silenciosamente

**Solução:**
```bash
# Ver logs da edge function
supabase functions logs generate-quiz --tail
```

---

### ❌ Problema 2: Prompts Muito Grandes
**Sintoma:**
```sql
-- Se aparecer >30k tokens, há problema
SELECT operation_type, MAX(tokens_input) as max_input
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation_type;
```

**Causa provável:**
- Semantic search retornando muitos chunks
- Fonte muito grande sem chunking
- Token limit não está sendo respeitado

**Solução:**
```typescript
// Verificar em _shared/embeddings.ts
const TOKEN_LIMIT = 15000; // Deve estar definido
```

---

### ❌ Problema 3: Uso de Pro em Operações Simples
**Sintoma:**
```sql
-- Se Pro aparecer em quiz/flashcard/chat, há ERRO
SELECT operation_type, COUNT(*)
FROM token_usage_logs
WHERE metadata->>'model' = 'gemini-2.5-pro'
  AND operation_type != 'summary'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation_type;
```

**Causa provável:**
- Código hardcoded com modelo errado
- Fallback para Pro sem necessidade

**Solução:**
```bash
# Verificar todas as edge functions
grep -r "gemini-2.5-pro" supabase/functions/*/index.ts
# Só deve aparecer em generate-focused-summary
```

---

## 💰 Cálculo de Custo Esperado

### Uso Típico de um Aluno (por dia):
```
📚 3 sessões de chat (10 msgs cada) = 30 msgs
   → ~15k tokens input (10k cached)
   → ~3k tokens output
   → Custo: ~$0.002 USD (~R$ 0.01)

📝 2 quizzes (10 questões cada) = 20 questões
   → ~20k tokens input (15k cached)
   → ~8k tokens output
   → Custo: ~$0.003 USD (~R$ 0.015)

🧠 1 set de flashcards (20 cards)
   → ~12k tokens input (9k cached)
   → ~2k tokens output
   → Custo: ~$0.001 USD (~R$ 0.005)

🎯 1 recovery (quiz ou flashcards)
   → ~10k tokens input (8k cached)
   → ~5k tokens output
   → Custo: ~$0.002 USD (~R$ 0.01)

📊 1 resumo focado (Pro model)
   → ~25k tokens input (0 cached - single batch)
   → ~3k tokens output
   → Custo: ~$0.045 USD (~R$ 0.25)

-------------------------------------------
TOTAL DIÁRIO: ~$0.053 USD (~R$ 0.29/dia)
TOTAL MENSAL: ~$1.60 USD (~R$ 8.70/mês)
```

### Uso Intenso (estudante focado):
```
- Dobrar todas as quantidades acima
- TOTAL MENSAL: ~$3.20 USD (~R$ 17.40/mês)
```

---

## 📈 Como Reduzir Custos Ainda Mais

### 1. **Aumentar TTL do Cache (Trade-off: staleness)**
```typescript
// _shared/gemini-cache.ts
ttlSeconds: 600  // Atual: 10min
ttlSeconds: 1800 // Novo: 30min (economia +20%)
```

### 2. **Reduzir Token Limits (Trade-off: qualidade)**
```typescript
// Chat: 20k → 15k (-25% custo)
// Quiz: 15k → 12k (-20% custo)
// Recovery: 12k → 10k (-17% custo)
```

### 3. **Lazy Embeddings (só gera se necessário)**
```typescript
// Só gera embeddings se usuário usar busca semântica
// Economia: ~40% em novos usuários que não usam busca
```

### 4. **Batching Mais Agressivo**
```typescript
// Aumentar tamanho dos batches
QUIZ_MULTIPLE: { output: 12000, max: 30 } // 30 questões em 2 batches
// Economia: menos overhead de sistema
```

---

## 🎯 Métricas de Sucesso

### ✅ Cache Working Well
- **>70%** das operações quiz/flashcard usam cache
- **>50%** dos tokens de input são cacheados

### ✅ Token Limits Respeitados
- Input tokens médio **<20k** para todas operações
- Output tokens médio **<5k** para quiz/flashcard

### ✅ Modelo Correto
- **<5%** das operações usam Pro
- **0%** de quiz/flashcard/chat usando Pro

### ✅ Custo por Usuário Ativo
- **<$2 USD/mês** para uso normal
- **<$5 USD/mês** para uso intenso

---

## 📞 Troubleshooting

### Query de Diagnóstico Rápido
```sql
WITH stats AS (
  SELECT
    COUNT(*) as ops,
    SUM(tokens_input + tokens_output) as tokens,
    ROUND(SUM(cost_usd)::numeric, 4) as custo_usd,
    COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as ops_cache,
    COUNT(*) FILTER (WHERE metadata->>'model' = 'gemini-2.5-pro') as ops_pro,
    MAX(tokens_input) as max_input
  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  ops as total_operacoes,
  tokens as total_tokens,
  custo_usd,
  ROUND((custo_usd * 5.5)::numeric, 2) as custo_brl,
  ROUND((ops_cache::float / ops * 100), 2) as pct_com_cache,
  ROUND((ops_pro::float / ops * 100), 2) as pct_usando_pro,
  max_input,
  CASE
    WHEN ops_cache::float / ops < 0.5 THEN '❌ CACHE BAIXO'
    WHEN ops_pro::float / ops > 0.1 THEN '❌ MUITO PRO'
    WHEN max_input > 30000 THEN '❌ PROMPTS GRANDES'
    WHEN custo_usd / ops > 0.002 THEN '⚠️ CUSTO ALTO POR OP'
    ELSE '✅ TUDO OK'
  END as diagnostico
FROM stats;
```

---

## 📊 Dashboard Recomendado

Crie views no Supabase para monitoramento:

```sql
-- View: Custo diário
CREATE OR REPLACE VIEW daily_costs AS
SELECT
  DATE(created_at) as dia,
  COUNT(*) as operacoes,
  SUM(tokens_input + tokens_output) as tokens,
  ROUND(SUM(cost_usd)::numeric, 4) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
FROM token_usage_logs
GROUP BY DATE(created_at)
ORDER BY dia DESC;

-- View: Eficiência de cache
CREATE OR REPLACE VIEW cache_efficiency AS
SELECT
  DATE(created_at) as dia,
  operation_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as com_cache,
  ROUND((COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0)::float / COUNT(*) * 100), 2) as pct_cache
FROM token_usage_logs
GROUP BY DATE(created_at), operation_type
ORDER BY dia DESC, operation_type;
```

Execute:
```sql
SELECT * FROM daily_costs LIMIT 7;
SELECT * FROM cache_efficiency WHERE dia = CURRENT_DATE;
```
