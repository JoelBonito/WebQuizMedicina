-- Análise Detalhada de Token Usage
-- Execute no Supabase SQL Editor ou via psql

-- ====================================
-- 1. RESUMO GERAL (Últimas 24h)
-- ====================================
SELECT
  '=== RESUMO GERAL (24h) ===' as section,
  COUNT(*) as total_operacoes,
  SUM(tokens_input) as total_input_tokens,
  SUM(tokens_output) as total_output_tokens,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl,
  ROUND(AVG(tokens_input + tokens_output)::numeric, 0) as media_tokens_operacao
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- ====================================
-- 2. ANÁLISE DE CACHE (Últimas 24h)
-- ====================================
SELECT
  '=== ANÁLISE DE CACHE ===' as section,
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as operacoes_com_cache,
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int = 0 OR metadata->>'cached_tokens' IS NULL) as operacoes_sem_cache,
  SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata->>'cached_tokens' IS NOT NULL) as total_cached_tokens,
  ROUND(
    (COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0)::float /
     NULLIF(COUNT(*), 0) * 100)::numeric, 2
  ) as percentual_ops_com_cache,
  -- Economia estimada (75% de desconto nos tokens cacheados)
  ROUND(
    (SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata->>'cached_tokens' IS NOT NULL) * 0.075 / 1000000 * 0.75)::numeric, 6
  ) as economia_cache_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- ====================================
-- 3. BREAKDOWN POR TIPO DE OPERAÇÃO (Últimas 24h)
-- ====================================
SELECT
  '=== POR TIPO DE OPERAÇÃO ===' as section,
  operation_type,
  COUNT(*) as quantidade,
  SUM(tokens_input) as input_tokens,
  SUM(tokens_output) as output_tokens,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(AVG(tokens_input + tokens_output)::numeric, 0) as media_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl,
  -- Percentual do custo total
  ROUND(
    (SUM(cost_usd) / NULLIF(SUM(SUM(cost_usd)) OVER (), 0) * 100)::numeric, 2
  ) as percentual_custo
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation_type
ORDER BY custo_usd DESC;

-- ====================================
-- 4. BREAKDOWN POR MODELO (Últimas 24h)
-- ====================================
SELECT
  '=== POR MODELO GEMINI ===' as section,
  metadata->>'model' as modelo,
  COUNT(*) as quantidade,
  SUM(tokens_input) as input_tokens,
  SUM(tokens_output) as output_tokens,
  SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata->>'cached_tokens' IS NOT NULL) as cached_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY metadata->>'model'
ORDER BY custo_usd DESC;

-- ====================================
-- 5. OPERAÇÕES MAIS CARAS (Top 10)
-- ====================================
SELECT
  '=== TOP 10 OPERAÇÕES MAIS CARAS ===' as section,
  operation_type,
  tokens_input,
  tokens_output,
  (metadata->>'cached_tokens')::int as cached_tokens,
  metadata->>'model' as modelo,
  metadata->>'mode' as modo,
  ROUND(cost_usd::numeric, 6) as custo_usd,
  created_at::timestamp(0) as quando
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY cost_usd DESC
LIMIT 10;

-- ====================================
-- 6. ANÁLISE DE EFICIÊNCIA DE CACHE POR OPERAÇÃO
-- ====================================
SELECT
  '=== EFICIÊNCIA DE CACHE POR TIPO ===' as section,
  operation_type,
  COUNT(*) as total_ops,
  COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as ops_com_cache,
  ROUND(
    (COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0)::float /
     NULLIF(COUNT(*), 0) * 100)::numeric, 2
  ) as percentual_cache,
  SUM(tokens_input) as total_input,
  SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata->>'cached_tokens' IS NOT NULL) as total_cached,
  ROUND(
    (SUM((metadata->>'cached_tokens')::int) FILTER (WHERE metadata->>'cached_tokens' IS NOT NULL)::float /
     NULLIF(SUM(tokens_input), 0) * 100)::numeric, 2
  ) as percentual_tokens_cached
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation_type
ORDER BY total_input DESC;

-- ====================================
-- 7. OPERAÇÕES DE RECOVERY (Últimas 24h)
-- ====================================
SELECT
  '=== OPERAÇÕES RECOVERY ===' as section,
  operation_type,
  COUNT(*) as quantidade,
  metadata->>'strategy' as estrategia,
  AVG((metadata->>'focus_percentage')::int) as media_focus_pct,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND metadata->>'mode' = 'recovery'
GROUP BY operation_type, metadata->>'strategy'
ORDER BY custo_usd DESC;

-- ====================================
-- 8. HISTÓRICO TEMPORAL (Últimas 24h, agrupado por hora)
-- ====================================
SELECT
  '=== HISTÓRICO POR HORA ===' as section,
  DATE_TRUNC('hour', created_at) as hora,
  COUNT(*) as operacoes,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hora DESC;

-- ====================================
-- 9. ANÁLISE DE EMBEDDINGS
-- ====================================
SELECT
  '=== EMBEDDINGS ===' as section,
  COUNT(*) as quantidade_operacoes,
  SUM(tokens_input) as total_tokens,
  ROUND(AVG(tokens_input)::numeric, 0) as media_tokens_por_embedding,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND operation_type = 'embedding';

-- ====================================
-- 10. COMPARAÇÃO: Com Cache vs Sem Cache
-- ====================================
SELECT
  '=== IMPACTO DO CACHE ===' as section,
  'SEM CACHE' as cenario,
  SUM(tokens_input + tokens_output) as total_tokens,
  -- Custo SEM considerar desconto de cache (simulação)
  ROUND(
    ((SUM(tokens_input) * 0.075 / 1000000) + (SUM(tokens_output) * 0.30 / 1000000))::numeric, 6
  ) as custo_estimado_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND metadata->>'model' = 'gemini-2.5-flash'

UNION ALL

SELECT
  '=== IMPACTO DO CACHE ===' as section,
  'COM CACHE (ATUAL)' as cenario,
  SUM(tokens_input + tokens_output) as total_tokens,
  ROUND(SUM(cost_usd)::numeric, 6) as custo_real_usd
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND metadata->>'model' = 'gemini-2.5-flash';
