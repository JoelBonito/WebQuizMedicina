# 🚀 Otimizações de Custo Implementadas

**Data**: 2025-11-22
**Objetivo**: Reduzir custo do focused-summary em 86% mantendo qualidade Pro

---

## ✅ IMPLEMENTADO

### 3 Otimizações em Camadas

#### 🔍 OTIMIZAÇÃO 1: Busca Semântica (62% redução de tokens)

**O que faz**:
- Usa embeddings para buscar apenas trechos relevantes do material
- Em vez de enviar TODO o conteúdo, envia só o que importa para as dificuldades do aluno
- Fallback automático se embeddings não disponíveis

**Exemplo**:
```
Aluno tem dificuldades: "arritmias", "ICC", "beta-bloqueadores"

ANTES:
├─ Envia: TODO material (cardiologia + anatomia + farmaco...)
└─ Tokens: ~13,363

DEPOIS:
├─ Busca: chunks relevantes sobre arritmias, ICC, beta-bloqueadores
└─ Tokens: ~5,000 (62% redução!)
```

**Onde ver nos logs**:
```sql
SELECT
  metadata->>'used_semantic_search' as usou_semantica,
  metadata->>'semantic_tokens_used' as tokens_usados,
  tokens_input
FROM token_usage_logs
WHERE operation_type = 'summary'
ORDER BY created_at DESC
LIMIT 5;
```

---

#### 📦 OTIMIZAÇÃO 2: Cache Compartilhado por Projeto (95% desconto)

**O que faz**:
- Cache é criado uma vez e reutilizado por 30 minutos
- Funciona entre DIFERENTES operações do mesmo projeto
- Cache hit = 95% de desconto nos tokens de input!

**Exemplo**:
```
Sessão de estudo típica (projeto "Cardiologia"):

14:43 → Gera quiz (20 questões)
         Cache criado: project-abc-sources
         Custo: $0.012 (normal)

14:45 → Gera flashcards (15 cards)
         ♻️ Reusa cache: project-abc-sources
         Custo: $0.0006 (95% desconto!)

14:50 → Gera focused-summary
         ♻️ Reusa cache: project-abc-sources
         Custo: $0.0006 (95% desconto!)

ECONOMIA: $0.024 em 3 operações!
```

**Onde ver**:
```sql
-- Ver caches ativos
SELECT
  project_id,
  cache_type,
  cache_name,
  created_at,
  expires_at,
  metadata->>'estimated_tokens' as tokens_cached
FROM project_caches
WHERE expires_at > NOW()
ORDER BY created_at DESC;

-- Ver cache hits
SELECT
  operation_type,
  metadata->>'used_cache' as tentou_cache,
  metadata->>'cache_hit' as hit,
  (metadata->>'cached_tokens')::int as tokens_cached,
  cost_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '1 day'
  AND operation_type = 'summary'
ORDER BY created_at DESC;
```

---

#### ✂️ OTIMIZAÇÃO 3: Prompt Otimizado (60% redução)

**O que faz**:
- Reduz verbosidade do template HTML
- De ~450 tokens para ~180 tokens
- Mantém mesmas instruções, só mais conciso

**Exemplo**:
```
ANTES (verbose):
"FORMATO DE SAÍDA (HTML estruturado):

<div class="focused-summary">
  <div class="summary-header">
    <h1>🎯 Resumo Focado nas Suas Dificuldades</h1>
    <p class="subtitle">Material personalizado para Cardiologia</p>
    ...
  </div>
  ...
</div>"

DEPOIS (conciso):
"HTML: Use estrutura semântica:
- <div class="focused-summary"> container principal
- <div class="summary-header"> com h1, p.subtitle, p.meta
- Dentro: divs com classes explanation, analogy, key-points..."
```

**Economia**: ~270 tokens por requisição

---

## 📊 IMPACTO PROJETADO

### Cenário 1: Primeira vez (sem cache)

| Métrica | Antes | Depois | Economia |
|---------|-------|--------|----------|
| **Tokens input** | 13,363 | 5,000 | -62% |
| **Custo input** | $0.032 | $0.012 | -62% |
| **Custo total** | $0.089 | $0.069 | -22% |

### Cenário 2: Reutilizando cache

| Métrica | Antes | Depois | Economia |
|---------|-------|--------|----------|
| **Tokens input** | 13,363 | 250 | -98% |
| **Custo input** | $0.032 | $0.0006 | -98% |
| **Custo total** | $0.089 | $0.0576 | **-86%** 🎯 |

### Cenário 3: Sessão típica (2 summaries)

| Métrica | Antes | Depois | Economia |
|---------|-------|--------|----------|
| **Custo/dia** | $0.178 | $0.127 | -29% |
| **Custo/mês** | $5.34 | $3.81 | **-$1.53** |
| **Custo/ano** | $64.08 | $45.72 | **-$18.36** |

---

## 🛠️ COMO TESTAR

### Passo 1: Aplicar Migration

```bash
# No terminal
cd WebQuizMedicina
supabase db push
```

Isso cria a tabela `project_caches`.

---

### Passo 2: Deploy Edge Functions

```bash
# Deploy focused-summary otimizado
supabase functions deploy generate-focused-summary

# Verificar deployment
supabase functions list
```

---

### Passo 3: Testar Operação

**No frontend**, gerar um focused-summary:

1. Fazer quiz/flashcards para gerar dificuldades
2. Clicar em "Gerar Resumo Focado"
3. Aguardar processamento

---

### Passo 4: Verificar Logs

**Via Supabase Dashboard** → Functions → Logs:

Procurar por:
```
✅ [SEMANTIC] 12 relevant chunks (~4,800 tokens)
✅ [PROJECT-CACHE] Cache created: cachedContents/xyz
💰 [Gemini] Cache reduces input token cost by ~95%
```

**Via SQL**:
```sql
SELECT
  created_at,
  operation_type,
  tokens_input,
  tokens_output,
  (metadata->>'cached_tokens')::int as cached_tokens,
  cost_usd,
  metadata->>'used_semantic_search' as semantica,
  metadata->>'semantic_tokens_used' as tokens_semantica,
  metadata->>'used_cache' as usou_cache,
  metadata->>'cache_hit' as cache_hit
FROM token_usage_logs
WHERE operation_type = 'summary'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

### Passo 5: Testar Cache Reuse

**Gerar segunda operação** (quiz/flashcard/summary) no mesmo projeto dentro de 30 min:

Esperar ver nos logs:
```
♻️ [PROJECT-CACHE] Reusing valid cache: cachedContents/xyz
📊 [Gemini] Using cached content: cachedContents/xyz
💰 [Gemini] Cache reduces input token cost by ~95%
```

Verificar `cached_tokens > 0` no log SQL acima.

---

## 📈 MONITORAMENTO CONTÍNUO

### Query 1: Taxa de Cache Hit

```sql
-- Taxa de cache hit nas últimas 24h
WITH cache_stats AS (
  SELECT
    COUNT(*) as total_ops,
    SUM(CASE WHEN (metadata->>'cache_hit')::boolean THEN 1 ELSE 0 END) as cache_hits
  FROM token_usage_logs
  WHERE operation_type = 'summary'
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  total_ops,
  cache_hits,
  ROUND((cache_hits::numeric / NULLIF(total_ops, 0) * 100), 1) as hit_rate_pct
FROM cache_stats;
```

**Meta**: >50% de cache hit rate

---

### Query 2: Economia com Semantic Search

```sql
-- Comparar tokens usados antes/depois
SELECT
  DATE(created_at) as dia,
  ROUND(AVG(tokens_input)::numeric, 0) as media_tokens_input,
  ROUND(AVG((metadata->>'semantic_tokens_used')::int)::numeric, 0) as media_tokens_semantica,
  ROUND(AVG(cost_usd)::numeric, 4) as custo_medio
FROM token_usage_logs
WHERE operation_type = 'summary'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;
```

**Meta**: média <6k tokens input com semantic search

---

### Query 3: Economia Total

```sql
-- Economia simulada vs sem otimizações
WITH current_costs AS (
  SELECT
    COUNT(*) as ops,
    SUM(cost_usd) as custo_atual,
    -- Simular custo SEM otimizações (13k tokens input)
    SUM(
      (13000 * 2.40 / 1000000) + -- Input sem semantic search
      (tokens_output * 9.60 / 1000000) -- Output igual
    ) as custo_sem_otimizacao
  FROM token_usage_logs
  WHERE operation_type = 'summary'
    AND created_at > NOW() - INTERVAL '7 days'
)
SELECT
  ops,
  ROUND(custo_atual::numeric, 4) as custo_atual,
  ROUND(custo_sem_otimizacao::numeric, 4) as custo_sem_otimizacao,
  ROUND((custo_sem_otimizacao - custo_atual)::numeric, 4) as economia,
  ROUND(((custo_sem_otimizacao - custo_atual) / NULLIF(custo_sem_otimizacao, 0) * 100)::numeric, 1) as economia_pct
FROM current_costs;
```

---

## 🐛 TROUBLESHOOTING

### Problema: Cache nunca é criado

**Sintomas**:
- `used_cache: false` nos logs
- Nenhum registro em `project_caches`

**Causas possíveis**:
1. Tabela `project_caches` não existe → Rodar migration
2. Erro na função `getOrCreateProjectCache` → Ver logs da edge function
3. Gemini API key inválida → Verificar env vars

**Como debugar**:
```bash
# Ver logs da edge function
supabase functions logs generate-focused-summary

# Procurar por erros com "CACHE"
```

---

### Problema: Cache nunca é reutilizado

**Sintomas**:
- `used_cache: true` mas `cache_hit: false`
- Novo cache criado em cada operação

**Causas possíveis**:
1. Cache expirando rápido demais
2. Conteúdo mudando entre operações
3. Cache sendo deletado antes do reuso

**Como debugar**:
```sql
-- Ver tempo de vida dos caches
SELECT
  cache_type,
  created_at,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - created_at)) / 60 as ttl_minutes,
  EXTRACT(EPOCH FROM (expires_at - NOW())) / 60 as remaining_minutes
FROM project_caches
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Meta**: TTL de 30 minutos, reuso dentro de 5-10 minutos

---

### Problema: Semantic search não está sendo usado

**Sintomas**:
- `used_semantic_search: false` sempre
- Tokens input ainda altos (~13k)

**Causas possíveis**:
1. Embeddings não gerados para as sources
2. Erro na função `hasAnyEmbeddings`

**Como debugar**:
```sql
-- Verificar se tem embeddings
SELECT
  s.id,
  s.name,
  COUNT(c.id) as chunks_count,
  SUM(CASE WHEN c.embedding IS NOT NULL THEN 1 ELSE 0 END) as embeddings_count
FROM sources s
LEFT JOIN source_chunks c ON c.source_id = s.id
WHERE s.project_id = 'seu-project-id-aqui'
GROUP BY s.id, s.name;
```

**Solução**: Gerar embeddings via edge function `generate-embeddings`

---

## 🎯 MÉTRICAS DE SUCESSO

Após 1 semana de uso:

- [ ] **Cache hit rate**: >50%
- [ ] **Tokens input médio**: <6,000 (vs 13,000 antes)
- [ ] **Custo médio/op**: <$0.015 (vs $0.089 antes)
- [ ] **Economia mensal**: >$1.50

Se atingir estas metas = **SUCESSO** 🎉

---

## 📝 PRÓXIMOS PASSOS

1. **Monitorar por 1 semana** → Coletar dados reais
2. **Aplicar mesma estratégia** → Quiz e Flashcards
3. **Documentar learnings** → O que funcionou/não funcionou
4. **Iterar** → Ajustar limites de tokens/TTL conforme necessário

---

## 📚 REFERÊNCIAS

- Análise completa: `docs/ANALISE_CONSUMO_TOKENS_2025-11-22.md`
- Migration: `supabase/migrations/20251122_create_project_caches.sql`
- Cache module: `supabase/functions/_shared/project-cache.ts`
- Focused-summary: `supabase/functions/generate-focused-summary/index.ts`
- Monitoring queries: `docs/sql/quick_cost_check.sql`

---

**Criado em**: 2025-11-22
**Última atualização**: 2025-11-22
**Status**: ✅ Implementado, aguardando testes em produção
