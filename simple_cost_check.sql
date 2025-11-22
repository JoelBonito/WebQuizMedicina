-- ⚡ TESTE SUPER SIMPLES - Execute isso PRIMEIRO
-- Se der erro, a tabela não está configurada corretamente

-- Teste 1: Tabela existe?
SELECT 'Teste 1: Tabela existe' as teste, COUNT(*) as registros
FROM token_usage_logs;

-- Teste 2: Coluna cost_usd existe?
SELECT 'Teste 2: Ler cost_usd' as teste, SUM(cost_usd) as custo_total
FROM token_usage_logs;

-- Teste 3: Query simples de hoje
SELECT
  'Teste 3: Custos de hoje' as teste,
  COUNT(*) as ops,
  ROUND(SUM(cost_usd)::numeric, 4) as custo_usd,
  ROUND((SUM(cost_usd) * 5.5)::numeric, 2) as custo_brl
FROM token_usage_logs
WHERE created_at >= CURRENT_DATE;
