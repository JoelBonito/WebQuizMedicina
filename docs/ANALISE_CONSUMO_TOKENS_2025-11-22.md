# 📊 Análise de Consumo de Tokens - WebQuizMedicina
**Data**: 2025-11-22
**Período analisado**: Últimas 24 horas
**Total de operações**: 6

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. Cache em 0% - CRÍTICO

**Status**: Sistema de cache implementado mas NÃO está sendo utilizado
**Impacto financeiro**: Desperdiçando ~90% de economia potencial
**Custo extra**: +$0.0024 USD só nas 6 operações analisadas

**Causa raiz**:
```typescript
// generate-quiz/index.ts:152
const useCache = batchSizes.length > 1;
```

O cache **NUNCA é criado** porque:
- ✅ Cache está implementado corretamente (`gemini-cache.ts`)
- ❌ Condição: só ativa se `batchSizes.length > 1` (múltiplos batches na mesma sessão)
- ❌ Usuários pedem <25 questões → tudo cabe em 1 batch
- ❌ Cada requisição é uma nova sessão → sem reuso de cache

**Exemplo real dos logs**:
```
14:43 - Quiz 20 questões    → 1 batch → ❌ Sem cache → 8,439 tokens input
14:44 - Summary             → 1 batch → ❌ Sem cache → 15,350 tokens input
14:49 - Summary Pro         → 1 batch → ❌ Sem cache → 13,363 tokens input
14:51 - Flashcard recovery  → 1 batch → ❌ Sem cache → 7,818 tokens input

TOTAL: 44,970 tokens SEM cache
Com cache (95% desconto): ~2,248 tokens
💸 Desperdiçado: $0.0032 USD só em 4 ops
```

---

### 2. Custo Médio 4.6× Acima da Meta

**Atual**: $0.009293 USD/operação
**Meta**: <$0.002 USD/operação
**Excesso**: +364% 🔴

**Breakdown do custo**:
```
Total: $0.055758 USD (R$ 0.31)
├─ 83% → 1 summary com Pro      ($0.046434)
├─ 5%  → 1 summary com Flash     ($0.002738)
├─ 4%  → 2 quiz                  ($0.003818)
└─ 5%  → 2 flashcard             ($0.002768)
```

**Concentração de custo**:
- ✅ Uso de Pro está CORRETO (focused-summary usa Pro intencionalmente)
- ❌ MAS: 1 operação representa 83% do custo total
- ⚠️ Custo por operação está 4.6× acima do esperado

---

### 3. Cache não reutilizado entre sessões

**Padrão de uso real**:
```
Usuário estudando "Cardiologia":
├─ 14:43 → Gera 20 quiz           [session A, cache ❌]
├─ 14:44 → Gera summary           [session B, cache ❌]
├─ 14:49 → Gera focused summary   [session C, cache ❌]
└─ 14:51 → Gera flashcards        [session D, cache ❌]

PROBLEMA:
- Todas as 4 operações leem o MESMO conteúdo médico
- Cada uma cria um novo session_id
- ZERO reutilização de cache
- Paga preço cheio 4 vezes!
```

**Design atual do cache**:
- ✅ Funciona DENTRO de uma sessão (múltiplos batches)
- ❌ NÃO funciona ENTRE sessões diferentes
- ❌ TTL de 10min mas cache nunca é reutilizado

---

## 📈 DADOS DETALHADOS

### Consumo por tipo de operação

| Tipo | Ops | Custo USD | Custo BRL | % Total | Tokens In | Tokens Out |
|------|-----|-----------|-----------|---------|-----------|------------|
| **summary** | 2 | $0.0492 | R$ 0.27 | 88% | 28,713 | 11,234 |
| **quiz** | 2 | $0.0038 | R$ 0.02 | 7% | 17,063 | 8,461 |
| **flashcard** | 2 | $0.0028 | R$ 0.02 | 5% | 20,420 | 4,122 |

### Top 3 operações mais caras

1. **Summary com Pro** - $0.046434 (83% do total!)
   - Input: 13,363 tokens | Output: 5,946 tokens
   - Modelo: gemini-2.5-pro
   - ✅ Uso justificado (focused-summary)
   - ⚠️ SEM cache

2. **Summary com Flash** - $0.002738
   - Input: 15,350 tokens | Output: 5,288 tokens
   - Modelo: gemini-2.5-flash
   - ⚠️ SEM cache

3. **Quiz com Flash** - $0.002197
   - Input: 8,439 tokens | Output: 5,213 tokens
   - Modelo: gemini-2.5-flash
   - ⚠️ SEM cache

### Estatísticas gerais

- **Total tokens**: 90,013 (66,196 input + 23,817 output)
- **Cached tokens**: 0 (0%)
- **Modelo Flash**: 83.33% (5 ops) ✅
- **Modelo Pro**: 16.67% (1 op) ✅
- **Max input tokens**: 15,350

---

## 💡 SOLUÇÕES RECOMENDADAS

### 🚀 PRIORIDADE 1: Cache compartilhado por Project

**Objetivo**: Reutilizar cache entre diferentes sessões do mesmo projeto

**Estratégia**:
1. Criar cache identificado por `project_id` (não por `session_id`)
2. TTL: 30 minutos (suficiente para sessão de estudo)
3. Verificar cache existente antes de criar novo

**Implementação**:
```typescript
// NOVO: Verificar cache existente do projeto
const cacheKey = `project-${project_id}-${contentHash}`;
let cacheName = await getActiveCacheForProject(project_id);

if (!cacheName || !(await isCacheValid(cacheName))) {
  console.log('📦 Criando cache compartilhado para projeto...');
  const cacheInfo = await createContextCache(
    combinedContent,
    'gemini-2.5-flash',
    {
      ttlSeconds: 1800,        // 30 minutos
      displayName: cacheKey
    }
  );
  cacheName = cacheInfo.name;
  await saveCacheMapping(project_id, cacheName, contentHash);
} else {
  console.log('♻️ Reutilizando cache existente do projeto!');
}
```

**Armazenamento da mapping** (opções):
- **Opção A**: Supabase table `project_caches`
- **Opção B**: Redis/KV storage
- **Opção C**: In-memory (edge function globals)

**Benefícios**:
- ✅ Cache reutilizado entre quiz → flashcard → summary
- ✅ Economia de 70-90% nos input tokens
- ✅ Não requer mudança na UX
- ✅ Funciona com requisições pequenas

**Economia estimada**:
```
Cenário atual (sem cache):
├─ Quiz: 8,439 tokens × $0.075/1M = $0.000633
├─ Flash: 7,818 tokens × $0.075/1M = $0.000586
└─ TOTAL: $0.001219

Com cache (95% desconto no input):
├─ Quiz: (8,439 × 5%) × $0.075/1M = $0.000032
├─ Flash: (cached) × $0.075/1M = $0.000029
└─ TOTAL: $0.000061

💰 ECONOMIA: $0.001158 por par de ops (95%!)
```

---

### ⚡ PRIORIDADE 2: Modelo Flash-8B para Recovery

**Observação**: Operações "recovery" são mais simples (revisão de erros anteriores)

**Ação**:
```typescript
// generate-recovery-quiz/index.ts
// generate-recovery-flashcards/index.ts

// ANTES:
const model = 'gemini-2.5-flash';

// DEPOIS:
const model = 'gemini-2.5-flash-lite'; // 50% mais barato
```

**Comparação de custos**:
| Modelo | Input | Output | Economia |
|--------|-------|--------|----------|
| Flash | $0.075/1M | $0.30/1M | - |
| Flash-8B | $0.0375/1M | $0.15/1M | **-50%** |

**Benefícios**:
- ✅ Qualidade suficiente para recovery (questões mais simples)
- ✅ Economia imediata de 50%
- ✅ Mudança trivial (1 linha de código)

**Economia estimada**:
```
Recovery quiz atual: $0.001621 USD
Com Flash-8B: $0.000811 USD
💰 ECONOMIA: -50% ($0.00081/op)
```

---

### 🔧 PRIORIDADE 3: Otimização de Prompts

**Problema**: Prompts muito verbosos desperdiçam tokens

**Exemplo** (`generate-quiz/index.ts:212-225`):
```typescript
// ANTES (verbose): ~450 tokens
const prompt = `
FORMATO JSON:
{
  "perguntas": [
    {
      "tipo": "multipla_escolha",
      "pergunta": "Qual o tratamento de primeira linha para...",
      "opcoes": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D"],
      "resposta_correta": "A",
      "justificativa": "...",
      "dica": "...",
      "dificuldade": "médio",
      "topico": "Cardiologia"
    }
  ]
}`;

// DEPOIS (conciso): ~120 tokens
const prompt = `
JSON: {perguntas:[{tipo,pergunta,opcoes[],resposta_correta,justificativa,dica,dificuldade,topico}]}
Exemplo: {"perguntas":[{"tipo":"multipla_escolha","pergunta":"Qual...","opcoes":["A)..."],...}]}`;
```

**Economia estimada**: -5 a -10% nos input tokens

---

### 📊 PRIORIDADE 4: Embeddings + Busca Semântica

**Problema**: Enviar TODO o conteúdo em TODA requisição

**Estratégia**:
1. Gerar embeddings dos sources (uma vez)
2. Buscar apenas chunks relevantes para cada operação
3. Reduzir input de 15k → 5k tokens

**Implementação**:
```typescript
// ANTES: Enviar tudo
const content = sources.map(s => s.extracted_content).join();
// 15,350 tokens

// DEPOIS: Buscar só o relevante
const relevantChunks = await semanticSearchWithTokenLimit({
  projectId: project_id,
  query: difficulty_topics.join(' '), // "arritmias ICC beta-bloqueadores"
  maxTokens: 5000
});
// ~5,000 tokens (67% de redução!)
```

**Benefícios**:
- ✅ Redução de 60-70% nos input tokens
- ✅ Conteúdo mais focado → qualidade melhor
- ✅ Funciona com sources grandes (>100k tokens)

**Economia estimada**: -60% nos input tokens

---

## 📈 PROJEÇÃO DE ECONOMIA

### Cenário 1: Implementar PRIORIDADE 1 + 2

| Métrica | Atual | Otimizado | Economia |
|---------|-------|-----------|----------|
| **Cache hit rate** | 0% | 70% | +70pp |
| **Custo médio/op** | $0.009293 | $0.001500 | **-84%** |
| **Custo/dia (6 ops)** | $0.056 | $0.009 | **-$0.047** |
| **Custo/mês** | ~$1.68 | ~$0.27 | **-$1.41** |

### Cenário 2: Implementar TODAS as prioridades

| Métrica | Atual | Otimizado | Economia |
|---------|-------|-----------|----------|
| **Cache hit rate** | 0% | 80% | +80pp |
| **Custo médio/op** | $0.009293 | $0.000800 | **-91%** |
| **Custo/dia (6 ops)** | $0.056 | $0.005 | **-$0.051** |
| **Custo/mês** | ~$1.68 | ~$0.15 | **-$1.53** |
| **Custo/ano** | ~$20 | ~$1.80 | **-$18.20** |

---

## 🛠️ PLANO DE IMPLEMENTAÇÃO

### Fase 1 (Imediato - 1h)
- [ ] Implementar Flash-8B em recovery operations
- [ ] Criar tabela `project_caches` no Supabase
- [ ] Testar economia em ambiente de dev

### Fase 2 (Curto prazo - 2-3h)
- [ ] Implementar cache compartilhado por project_id
- [ ] Adicionar logs de cache hit/miss
- [ ] Monitorar economia real por 24h

### Fase 3 (Médio prazo - 1 dia)
- [ ] Otimizar prompts (reduzir verbosidade)
- [ ] Adicionar dashboard de custos no admin
- [ ] Configurar alertas de custo alto

### Fase 4 (Longo prazo - 1 semana)
- [ ] Implementar busca semântica com embeddings
- [ ] A/B test: qualidade com menos tokens
- [ ] Documentar best practices de custo

---

## 📊 MÉTRICAS DE SUCESSO

**Acompanhar semanalmente**:
- ✅ Cache hit rate: Meta >70%
- ✅ Custo médio/op: Meta <$0.002
- ✅ Tokens input/op: Meta <5,000
- ✅ Economia mensal: Meta >$1.20

**Dashboard recomendado**:
```sql
-- Ver análise atual
\i docs/sql/quick_cost_check.sql

-- Métricas semanais
SELECT
  DATE_TRUNC('week', created_at) as semana,
  COUNT(*) as ops,
  ROUND(AVG(cost_usd)::numeric, 6) as custo_medio,
  ROUND(SUM(cost_usd)::numeric, 4) as custo_total,
  ROUND(AVG((metadata->>'cached_tokens')::int)::numeric, 0) as cache_medio
FROM token_usage_logs
GROUP BY 1
ORDER BY 1 DESC;
```

---

## 🎯 CONCLUSÃO

**Situação atual**:
- ✅ Sistema de tokens tracking funcionando perfeitamente
- ✅ Uso de modelos (Flash vs Pro) está correto
- ❌ Cache implementado mas NUNCA usado (0%)
- ❌ Custo 4.6× acima da meta

**Principais causas**:
1. Cache só ativa em multi-batch (nunca acontece)
2. Sem reuso de cache entre sessões
3. Recovery usando modelo caro

**Ações imediatas**:
1. **Cache por project** → -90% de custo
2. **Flash-8B em recovery** → -50% em recovery ops
3. **Monitorar economia** → dashboard de custos

**ROI esperado**:
- Investimento: ~3-4h de dev
- Economia: **$1.41/mês** → **$16.92/ano**
- Payback: Imediato (primeira semana)

---

## 📎 ANEXOS

### Queries SQL úteis

```sql
-- Ver cache hit rate
SELECT
  CASE WHEN (metadata->>'cached_tokens')::int > 0
       THEN 'HIT' ELSE 'MISS' END as cache_status,
  COUNT(*) as total,
  ROUND(AVG(tokens_input)::numeric, 0) as avg_input_tokens,
  ROUND(AVG(cost_usd)::numeric, 6) as avg_cost
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1;

-- Top operações caras
SELECT
  operation_type,
  metadata->>'model' as modelo,
  tokens_input,
  tokens_output,
  cost_usd,
  created_at
FROM token_usage_logs
ORDER BY cost_usd DESC
LIMIT 10;

-- Projeção de economia com cache
WITH cache_simulation AS (
  SELECT
    operation_type,
    tokens_input,
    cost_usd as custo_atual,
    -- Simular 70% de cache hit
    (tokens_input * 0.3 * 0.075 / 1000000) +
    (tokens_output * 0.30 / 1000000) as custo_com_cache
  FROM token_usage_logs
  WHERE metadata->>'model' = 'gemini-2.5-flash'
)
SELECT
  operation_type,
  COUNT(*) as ops,
  ROUND(SUM(custo_atual)::numeric, 4) as custo_atual,
  ROUND(SUM(custo_com_cache)::numeric, 4) as custo_com_cache,
  ROUND((SUM(custo_atual) - SUM(custo_com_cache))::numeric, 4) as economia
FROM cache_simulation
GROUP BY 1;
```

### Código de referência

Ver implementações:
- Cache atual: `supabase/functions/_shared/gemini-cache.ts`
- Generate quiz: `supabase/functions/generate-quiz/index.ts:150-177`
- Token logger: `supabase/functions/_shared/token-logger.ts`
- Batch sizes: `supabase/functions/_shared/output-limits.ts:139-160`

---

**Documento gerado em**: 2025-11-22
**Análise realizada por**: Claude Code
**Versão**: 1.0
