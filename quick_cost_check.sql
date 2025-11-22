-- ⚡ QUICK COST CHECK - Execute isso no Supabase SQL Editor
-- Cole e execute (Ctrl+Enter) para ter um diagnóstico rápido

-- ============================================
-- 🎯 DIAGNÓSTICO RÁPIDO (Últimas 24h)
-- ============================================
WITH stats AS (
  SELECT
    COUNT(*) as total_ops,
    SUM(tokens_input) as total_input,
    SUM(tokens_output) as total_output,
    SUM(tokens_input + tokens_output) as total_tokens,
    ROUND(SUM(cost_usd)::numeric, 6) as custo_usd,
    ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl,

    -- Cache stats
    COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as ops_com_cache,
    SUM(COALESCE((metadata->>'cached_tokens')::int, 0)) as total_cached,

    -- Model stats
    COUNT(*) FILTER (WHERE metadata->>'model' = 'gemini-2.5-pro') as ops_pro,
    COUNT(*) FILTER (WHERE metadata->>'model' = 'gemini-2.5-flash') as ops_flash,

    -- Max tokens (red flag se muito alto)
    MAX(tokens_input) as max_input_tokens,
    MAX(tokens_output) as max_output_tokens,

    -- Custo por operação
    ROUND(AVG(cost_usd)::numeric, 6) as custo_medio_op

  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
),
breakdown AS (
  SELECT
    operation_type,
    COUNT(*) as qtd,
    ROUND(SUM(cost_usd)::numeric, 4) as custo,
    ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY operation_type
  ORDER BY custo DESC
)

-- Resultado Principal
SELECT
  '💰 CUSTO TOTAL' as metrica,
  s.custo_usd::text || ' USD' as valor,
  s.custo_brl::text || ' BRL' as valor_brl,
  CASE
    WHEN s.custo_usd > 1.0 THEN '🔴 ALTO'
    WHEN s.custo_usd > 0.5 THEN '🟡 MÉDIO'
    ELSE '🟢 NORMAL'
  END as status
FROM stats s

UNION ALL

SELECT
  '📊 TOTAL OPERAÇÕES',
  s.total_ops::text,
  '-',
  '📈'
FROM stats s

UNION ALL

SELECT
  '🎯 TOKENS TOTAIS',
  s.total_tokens::text,
  (s.total_input::text || ' in + ' || s.total_output::text || ' out'),
  '📊'
FROM stats s

UNION ALL

SELECT
  '💾 CACHE STATUS',
  ROUND((s.ops_com_cache::float / NULLIF(s.total_ops, 0) * 100), 2)::text || '%',
  s.total_cached::text || ' tokens cached',
  CASE
    WHEN s.ops_com_cache::float / NULLIF(s.total_ops, 0) > 0.7 THEN '🟢 ÓTIMO'
    WHEN s.ops_com_cache::float / NULLIF(s.total_ops, 0) > 0.4 THEN '🟡 OK'
    ELSE '🔴 BAIXO'
  END
FROM stats s

UNION ALL

SELECT
  '🤖 MODELO FLASH',
  ROUND((s.ops_flash::float / NULLIF(s.total_ops, 0) * 100), 2)::text || '%',
  s.ops_flash::text || ' ops',
  CASE
    WHEN s.ops_flash::float / NULLIF(s.total_ops, 0) > 0.85 THEN '🟢 ÓTIMO'
    WHEN s.ops_flash::float / NULLIF(s.total_ops, 0) > 0.7 THEN '🟡 OK'
    ELSE '🔴 MUITO PRO'
  END
FROM stats s

UNION ALL

SELECT
  '⚡ MODELO PRO',
  ROUND((s.ops_pro::float / NULLIF(s.total_ops, 0) * 100), 2)::text || '%',
  s.ops_pro::text || ' ops',
  CASE
    WHEN s.ops_pro::float / NULLIF(s.total_ops, 0) < 0.15 THEN '🟢 OK'
    WHEN s.ops_pro::float / NULLIF(s.total_ops, 0) < 0.3 THEN '🟡 ATENÇÃO'
    ELSE '🔴 MUITO PRO!'
  END
FROM stats s

UNION ALL

SELECT
  '📏 MAX INPUT TOKENS',
  s.max_input_tokens::text,
  '-',
  CASE
    WHEN s.max_input_tokens > 30000 THEN '🔴 MUITO ALTO'
    WHEN s.max_input_tokens > 20000 THEN '🟡 ALTO'
    ELSE '🟢 OK'
  END
FROM stats s

UNION ALL

SELECT
  '💵 CUSTO POR OP',
  s.custo_medio_op::text || ' USD',
  '-',
  CASE
    WHEN s.custo_medio_op > 0.005 THEN '🔴 CARO'
    WHEN s.custo_medio_op > 0.002 THEN '🟡 MÉDIO'
    ELSE '🟢 BARATO'
  END
FROM stats s;

-- ============================================
-- 📊 BREAKDOWN POR TIPO DE OPERAÇÃO
-- ============================================
SELECT
  '━━━ BREAKDOWN POR OPERAÇÃO ━━━' as operation_type,
  null as quantidade,
  null as custo_usd,
  null as custo_brl

UNION ALL

SELECT
  operation_type,
  qtd::text,
  custo::text,
  custo_brl::text
FROM (
  SELECT
    operation_type,
    COUNT(*) as qtd,
    ROUND(SUM(cost_usd)::numeric, 4) as custo,
    ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY operation_type
  ORDER BY custo DESC
) breakdown;

-- ============================================
-- 🔥 TOP 5 OPERAÇÕES MAIS CARAS
-- ============================================
SELECT
  '━━━ TOP 5 MAIS CARAS ━━━' as tipo,
  null as tokens,
  null as modelo,
  null as custo_usd,
  null as quando

UNION ALL

SELECT
  operation_type,
  (tokens_input + tokens_output)::text,
  metadata->>'model',
  ROUND(cost_usd::numeric, 6)::text,
  created_at::timestamp(0)::text
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY cost_usd DESC
LIMIT 5;

-- ============================================
-- 🎯 RECOMENDAÇÕES AUTOMÁTICAS
-- ============================================
WITH diagnostics AS (
  SELECT
    COUNT(*) as total_ops,
    COUNT(*) FILTER (WHERE (metadata->>'cached_tokens')::int > 0) as ops_cache,
    COUNT(*) FILTER (WHERE metadata->>'model' = 'gemini-2.5-pro') as ops_pro,
    MAX(tokens_input) as max_input,
    AVG(cost_usd) as avg_cost
  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  '━━━ RECOMENDAÇÕES ━━━' as recomendacao,
  null as acao

UNION ALL

SELECT
  CASE
    WHEN d.ops_cache::float / NULLIF(d.total_ops, 0) < 0.5
    THEN '🔴 Cache baixo (<50%)'
    ELSE '🟢 Cache OK'
  END,
  CASE
    WHEN d.ops_cache::float / NULLIF(d.total_ops, 0) < 0.5
    THEN 'Verifique logs: supabase functions logs generate-quiz'
    ELSE 'Sistema de cache funcionando bem'
  END
FROM diagnostics d

UNION ALL

SELECT
  CASE
    WHEN d.ops_pro::float / NULLIF(d.total_ops, 0) > 0.15
    THEN '🔴 Uso de Pro alto (>' || ROUND((d.ops_pro::float / d.total_ops * 100), 0)::text || '%)'
    ELSE '🟢 Uso de Pro adequado'
  END,
  CASE
    WHEN d.ops_pro::float / NULLIF(d.total_ops, 0) > 0.15
    THEN 'Pro só deve ser usado em focused-summary. Verificar edge functions.'
    ELSE 'Distribuição de modelos correta'
  END
FROM diagnostics d

UNION ALL

SELECT
  CASE
    WHEN d.max_input > 30000
    THEN '🔴 Prompts muito grandes (max: ' || d.max_input::text || ')'
    ELSE '🟢 Token limits OK'
  END,
  CASE
    WHEN d.max_input > 30000
    THEN 'Verificar semantic search e chunking. Limites devem ser <20k.'
    ELSE 'Token limits sendo respeitados'
  END
FROM diagnostics d

UNION ALL

SELECT
  CASE
    WHEN d.avg_cost > 0.005
    THEN '🔴 Custo médio alto (>' || ROUND(d.avg_cost::numeric, 4)::text || ' USD/op)'
    ELSE '🟢 Custo por operação adequado'
  END,
  CASE
    WHEN d.avg_cost > 0.005
    THEN 'Revisar estratégias de otimização. Custo esperado: <$0.002/op.'
    ELSE 'Eficiência de custo dentro do esperado'
  END
FROM diagnostics d;

-- ============================================
-- 💡 ECONOMIA COM CACHE (Simulação)
-- ============================================
WITH cache_impact AS (
  SELECT
    SUM(cost_usd) as custo_atual,
    -- Simular custo SEM cache (todos tokens a preço cheio)
    SUM(
      (tokens_input * 0.075 / 1000000) + (tokens_output * 0.30 / 1000000)
    ) as custo_sem_cache,
    -- Economia
    SUM(
      COALESCE((metadata->>'cached_tokens')::int, 0) * 0.075 / 1000000 * 0.75
    ) as economia_cache
  FROM token_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND metadata->>'model' = 'gemini-2.5-flash'
)
SELECT
  '━━━ ECONOMIA COM CACHE ━━━' as metrica,
  null as valor,
  null as economia

UNION ALL

SELECT
  'Custo ATUAL (com cache)',
  ROUND(custo_atual::numeric, 4)::text || ' USD',
  ROUND((custo_atual * 5.5)::numeric, 2)::text || ' BRL'
FROM cache_impact

UNION ALL

SELECT
  'Custo SEM cache (simulado)',
  ROUND(custo_sem_cache::numeric, 4)::text || ' USD',
  ROUND((custo_sem_cache * 5.5)::numeric, 2)::text || ' BRL'
FROM cache_impact

UNION ALL

SELECT
  '💰 ECONOMIA TOTAL',
  ROUND(economia_cache::numeric, 4)::text || ' USD',
  ROUND((economia_cache * 5.5)::numeric, 2)::text || ' BRL'
FROM cache_impact

UNION ALL

SELECT
  '📊 PERCENTUAL ECONOMIZADO',
  ROUND((economia_cache / NULLIF(custo_sem_cache, 0) * 100)::numeric, 2)::text || '%',
  '🎯'
FROM cache_impact;
