-- ============================================================================
-- CRON JOB - Processamento de Backup (Opcional mas Recomendado)
-- ============================================================================
-- Execute este SQL no Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/editor
-- ============================================================================

-- 1. Ativar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar job que processa sources pendentes a cada 5 minutos
SELECT cron.schedule(
  'process-pending-embeddings',      -- Nome do job
  '*/5 * * * *',                     -- A cada 5 minutos
  $$
  SELECT net.http_post(
    url := 'https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU'
    ),
    body := jsonb_build_object(
      'max_items', 10                -- Processar até 10 sources por vez
    )
  );
  $$
);

-- 3. Verificar jobs ativos
SELECT
  jobid,
  jobname,
  schedule,
  active,
  nodename
FROM cron.job
WHERE jobname = 'process-pending-embeddings';

-- Resultado esperado:
-- jobid | jobname                    | schedule     | active | nodename
-- ------+---------------------------+--------------+--------+----------
-- 1     | process-pending-embeddings | */5 * * * *  | t      | ...

-- ============================================================================
-- COMANDOS ÚTEIS
-- ============================================================================

-- Ver histórico de execuções (últimas 10)
SELECT
  jobid,
  runid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'process-pending-embeddings'
)
ORDER BY start_time DESC
LIMIT 10;

-- Desabilitar o cron job (sem remover)
UPDATE cron.job
SET active = false
WHERE jobname = 'process-pending-embeddings';

-- Habilitar novamente
UPDATE cron.job
SET active = true
WHERE jobname = 'process-pending-embeddings';

-- Remover o cron job completamente
SELECT cron.unschedule('process-pending-embeddings');

-- ============================================================================
-- QUANDO USAR O CRON JOB?
-- ============================================================================
--
-- ✅ Use quando:
-- - Webhook pode falhar ocasionalmente
-- - Quer garantia de processamento
-- - Tem muitos sources pendentes
-- - Quer processar em lote de tempos em tempos
--
-- ❌ Não precisa se:
-- - Webhook funciona perfeitamente
-- - Poucos sources por dia
-- - Quer economizar recursos
--
-- 💡 Recomendação: Configure os dois (webhook + cron)
--    - Webhook = resposta imediata (3-10s)
--    - Cron = backup a cada 5 minutos
--
-- ============================================================================
-- IMPORTANTE: SEGURANÇA
-- ============================================================================
--
-- ⚠️ A ANON_KEY neste arquivo está visível no Git!
--
-- Para produção, você DEVE:
-- 1. Trocar a ANON_KEY no Supabase Dashboard
-- 2. Atualizar este script com a nova key
-- 3. OU usar uma function SQL ao invés de net.http_post
--
-- Exemplo com function SQL (mais seguro):
-- SELECT process_pending_embeddings_cron();
--
-- ============================================================================
