-- 🔍 VERIFICAR ESTRUTURA DA TABELA token_usage_logs
-- Execute essa query primeiro para diagnosticar o problema

-- 1. Verificar se a tabela existe
SELECT
  '=== TABELA EXISTE? ===' as check_type,
  EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'token_usage_logs'
  ) as exists;

-- 2. Listar todas as colunas da tabela
SELECT
  '=== COLUNAS DA TABELA ===' as info,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'token_usage_logs'
ORDER BY ordinal_position;

-- 3. Verificar se há dados na tabela
SELECT
  '=== CONTAGEM DE REGISTROS ===' as info,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as records_today,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record
FROM token_usage_logs;

-- 4. Se houver dados, mostrar um exemplo
SELECT
  '=== EXEMPLO DE REGISTRO ===' as info,
  id,
  user_id,
  operation_type,
  tokens_input,
  tokens_output,
  cost_usd,
  metadata,
  created_at
FROM token_usage_logs
ORDER BY created_at DESC
LIMIT 1;
