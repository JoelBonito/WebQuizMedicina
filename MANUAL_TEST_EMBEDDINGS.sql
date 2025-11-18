-- ============================================================================
-- TESTE MANUAL: Processar Embeddings Pendentes
-- ============================================================================
-- Use este script quando o webhook não estiver configurado ainda
-- ou para testar o processamento manualmente
-- ============================================================================

-- 1. Verificar sources pendentes
SELECT
  id,
  name,
  embeddings_status,
  LENGTH(extracted_content) as content_size,
  created_at
FROM sources
WHERE embeddings_status = 'pending'
  AND extracted_content IS NOT NULL
  AND extracted_content != ''
ORDER BY created_at DESC;

-- 2. Chamar a edge function manualmente via SQL
-- IMPORTANTE: Você precisa ter a edge function deployed primeiro!
--
-- Para deployar a edge function, execute no terminal:
-- supabase functions deploy process-embeddings-queue
--
-- Depois, você pode processar de duas formas:

-- =========================
-- OPÇÃO A: Via curl (terminal)
-- =========================
/*
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_items": 10}'
*/

-- =========================
-- OPÇÃO B: Via SQL (net.http_post)
-- =========================
-- Esta opção requer a extensão pg_net ativada

-- Primeiro, verificar se pg_net está disponível:
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Se não estiver instalado, criar:
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Processar todos os sources pendentes (até 10 por vez):
DO $$
DECLARE
  response_status INT;
  response_body TEXT;
BEGIN
  -- Chamar a edge function
  SELECT status, content::text
  INTO response_status, response_body
  FROM net.http_post(
    url := 'https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUA_ANON_KEY_AQUI'
    ),
    body := jsonb_build_object(
      'max_items', 10
    )
  );

  RAISE NOTICE 'Response Status: %', response_status;
  RAISE NOTICE 'Response Body: %', response_body;

  IF response_status BETWEEN 200 AND 299 THEN
    RAISE NOTICE '✅ Processamento iniciado com sucesso!';
  ELSE
    RAISE WARNING '❌ Erro ao processar: HTTP %', response_status;
  END IF;
END $$;

-- =========================
-- OPÇÃO C: Processar source específico
-- =========================
-- Pegar o ID de um source específico e processar apenas ele

-- 1. Listar sources pendentes
SELECT id, name FROM sources WHERE embeddings_status = 'pending' LIMIT 5;

-- 2. Processar um source específico (substitua o UUID):
DO $$
DECLARE
  response_status INT;
  response_body TEXT;
  target_source_id UUID := 'COLE_O_UUID_AQUI'; -- Substitua pelo ID do source
BEGIN
  SELECT status, content::text
  INTO response_status, response_body
  FROM net.http_post(
    url := 'https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUA_ANON_KEY_AQUI'
    ),
    body := jsonb_build_object(
      'source_id', target_source_id,
      'max_items', 1
    )
  );

  RAISE NOTICE 'Response Status: %', response_status;
  RAISE NOTICE 'Response Body: %', response_body;
END $$;

-- =========================
-- 3. Monitorar progresso
-- =========================

-- Ver status atualizado
SELECT
  id,
  name,
  embeddings_status,
  LENGTH(extracted_content) as content_size,
  metadata->>'embeddings_chunks' as chunks,
  metadata->>'embeddings_error' as error,
  updated_at
FROM sources
ORDER BY updated_at DESC
LIMIT 10;

-- Ver chunks criados
SELECT
  s.name,
  COUNT(sc.id) as total_chunks,
  ROUND(AVG(sc.token_count)) as avg_tokens
FROM source_chunks sc
JOIN sources s ON s.id = sc.source_id
GROUP BY s.id, s.name
ORDER BY s.name;

-- =========================
-- 4. Troubleshooting
-- =========================

-- Se source ficou em 'processing' por muito tempo (>5 min), resetar:
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';

-- Se quiser reprocessar um source que falhou:
UPDATE sources
SET embeddings_status = 'pending'
WHERE embeddings_status = 'failed'
  AND id = 'COLE_UUID_AQUI';

-- Ver sources com erro:
SELECT
  name,
  metadata->>'embeddings_error' as error,
  metadata->>'embeddings_failed_at' as failed_at
FROM sources
WHERE embeddings_status = 'failed'
ORDER BY updated_at DESC;

-- ============================================================================
-- IMPORTANTE: Para ter processamento automático permanente
-- ============================================================================
/*
Este script é para testes manuais. Para processamento automático, você precisa:

1. Deploy da Edge Function:
   supabase functions deploy process-embeddings-queue

2. Configurar Database Webhook (veja QUICK_START_AUTO_EMBEDDINGS.md):
   - Dashboard → Database → Webhooks → Create
   - Table: sources
   - Events: INSERT, UPDATE
   - URL: https://SEU_PROJETO.supabase.co/functions/v1/process-embeddings-queue
   - Condition: new.embeddings_status = 'pending' AND new.extracted_content IS NOT NULL

3. (Opcional) Configurar Cron Job para processar pendentes a cada 5 minutos

Com esses 3 passos, o sistema será 100% automático!
*/
