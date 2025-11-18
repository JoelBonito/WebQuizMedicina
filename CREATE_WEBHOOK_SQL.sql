-- ═══════════════════════════════════════════════════════════════
-- WEBHOOK AUTOMÁTICO PARA EMBEDDINGS - VIA SQL
-- ═══════════════════════════════════════════════════════════════
--
-- Este script cria um webhook que dispara automaticamente quando
-- um novo arquivo é processado e tem conteúdo extraído.
--
-- Execute este SQL no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/sql/new
--
-- ═══════════════════════════════════════════════════════════════

-- Passo 1: Remover webhook e função antiga se existirem
DROP TRIGGER IF EXISTS auto_process_embeddings_webhook ON public.sources;
DROP FUNCTION IF EXISTS public.trigger_process_embeddings_webhook() CASCADE;

-- Passo 2: Criar função wrapper que prepara o payload dinamicamente
CREATE OR REPLACE FUNCTION public.trigger_process_embeddings_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  webhook_url TEXT := 'https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue';
  request_id BIGINT;
BEGIN
  -- Faz a chamada HTTP com o payload dinâmico
  SELECT net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU"}'::jsonb,
    body := json_build_object(
      'source_id', NEW.id,
      'max_items', 1
    )::text
  ) INTO request_id;

  RAISE LOG 'Webhook disparado para source_id: %, request_id: %', NEW.id, request_id;

  RETURN NEW;
END;
$$;

-- Passo 3: Criar o trigger com condição
CREATE TRIGGER auto_process_embeddings_webhook
  AFTER INSERT OR UPDATE ON public.sources
  FOR EACH ROW
  WHEN (
    -- Só dispara quando:
    NEW.embeddings_status = 'pending' AND                    -- Status está pending
    NEW.extracted_content IS NOT NULL AND                    -- Tem conteúdo extraído
    NEW.extracted_content != '' AND                          -- Conteúdo não está vazio
    (OLD.extracted_content IS NULL OR OLD.extracted_content = '')  -- É novo (não existia antes)
  )
  EXECUTE FUNCTION public.trigger_process_embeddings_webhook();

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAR SE FOI CRIADO
-- ═══════════════════════════════════════════════════════════════

SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'auto_process_embeddings_webhook';

-- ═══════════════════════════════════════════════════════════════
-- ✅ Se você ver 1 linha retornada, o webhook foi criado com sucesso!
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- COMO TESTAR
-- ═══════════════════════════════════════════════════════════════
--
-- 1. Faça upload de um PDF novo no seu projeto
-- 2. Aguarde 10-30 segundos
-- 3. Execute este SQL para verificar o status:
--
-- SELECT
--   id,
--   file_name,
--   embeddings_status,
--   created_at
-- FROM public.sources
-- ORDER BY created_at DESC
-- LIMIT 5;
--
-- 4. O embeddings_status deve mudar de 'pending' para 'completed'
--
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- MONITORAMENTO - Ver histórico de chamadas do webhook
-- ═══════════════════════════════════════════════════════════════

SELECT
  id,
  created,
  request->>'method' as method,
  request->>'url' as url,
  status_code,
  content::text as response
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- ═══════════════════════════════════════════════════════════════
-- REMOVER O WEBHOOK (se precisar desabilitar)
-- ═══════════════════════════════════════════════════════════════
--
-- DROP TRIGGER IF EXISTS auto_process_embeddings_webhook ON public.sources;
--
-- ═══════════════════════════════════════════════════════════════
