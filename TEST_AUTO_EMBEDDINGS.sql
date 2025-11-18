-- ============================================================================
-- SCRIPT DE TESTE: Sistema Automático de Embeddings
-- ============================================================================
-- Este script testa todo o fluxo do sistema de auto-geração de embeddings
-- Execute linha por linha no Supabase SQL Editor para validar cada etapa
-- ============================================================================

-- ============================================================================
-- PARTE 1: VERIFICAR INSTALAÇÃO
-- ============================================================================

-- 1.1 Verificar se coluna embeddings_status existe
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'sources'
  AND column_name IN ('embeddings_status', 'updated_at');

-- Esperado: 2 rows (embeddings_status e updated_at)

-- 1.2 Verificar funções SQL instaladas
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%embedding%'
  OR routine_name LIKE '%queue%'
ORDER BY routine_name;

-- Esperado:
-- - get_pending_embeddings_queue
-- - mark_embeddings_completed
-- - mark_embeddings_failed
-- - mark_embeddings_processing
-- - queue_source_for_embeddings
-- - trigger_auto_queue_embeddings

-- 1.3 Verificar trigger instalado
SELECT
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'auto_queue_embeddings';

-- Esperado: 1 row (trigger auto_queue_embeddings)

-- ============================================================================
-- PARTE 2: TESTAR FUNÇÕES SQL
-- ============================================================================

-- 2.1 Testar get_pending_embeddings_queue (deve estar vazia ou com pending existentes)
SELECT * FROM get_pending_embeddings_queue(10);

-- 2.2 Ver status atual de todos os sources
SELECT
  id,
  name,
  embeddings_status,
  CASE
    WHEN extracted_content IS NULL THEN 'Sem conteúdo'
    WHEN extracted_content = '' THEN 'Vazio'
    ELSE CONCAT(LENGTH(extracted_content), ' chars')
  END as content_status,
  created_at
FROM sources
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- PARTE 3: SIMULAR FLUXO COMPLETO (TESTE ISOLADO)
-- ============================================================================

-- 3.1 Criar um source de teste (simula upload de PDF)
DO $$
DECLARE
  test_project_id UUID;
  test_source_id UUID;
BEGIN
  -- Pegar um project_id existente do seu usuário
  SELECT id INTO test_project_id
  FROM projects
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF test_project_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa ter pelo menos 1 projeto criado';
  END IF;

  -- Criar source de teste
  INSERT INTO sources (
    project_id,
    name,
    type,
    storage_path,
    extracted_content,
    status,
    embeddings_status
  ) VALUES (
    test_project_id,
    '[TESTE] Documento Automático',
    'pdf',
    '/test/auto-embeddings-test.pdf',
    NULL,  -- Sem conteúdo ainda (simula antes de extract-text)
    'pending',
    'skipped'  -- Ainda não tem conteúdo
  ) RETURNING id INTO test_source_id;

  RAISE NOTICE 'Source de teste criado: %', test_source_id;

  -- Simular extract-text-from-pdf: adicionar extracted_content
  -- ⚡ Aqui o TRIGGER deve marcar como 'pending' automaticamente
  UPDATE sources
  SET
    extracted_content = 'Este é um conteúdo de teste para validar o sistema de embeddings automático. ' ||
                        'Em um cenário real, este seria o texto extraído de um PDF médico. ' ||
                        'O sistema deve detectar esta mudança e marcar o status como pending automaticamente. ' ||
                        'Depois, o webhook ou cron job processará e gerará os embeddings. ' ||
                        'Este texto tem aproximadamente 400 caracteres para simular um documento real.',
    status = 'ready'
  WHERE id = test_source_id;

  RAISE NOTICE 'Conteúdo adicionado ao source. Verificando se trigger funcionou...';

  -- Verificar se trigger funcionou
  PERFORM pg_sleep(0.5);  -- Pequeno delay

  DECLARE
    current_status TEXT;
  BEGIN
    SELECT embeddings_status INTO current_status
    FROM sources
    WHERE id = test_source_id;

    IF current_status = 'pending' THEN
      RAISE NOTICE '✅ SUCESSO: Trigger marcou como pending automaticamente!';
    ELSE
      RAISE WARNING '❌ FALHA: Status é "%" mas deveria ser "pending"', current_status;
    END IF;
  END;

END $$;

-- 3.2 Verificar source de teste criado
SELECT
  id,
  name,
  embeddings_status,
  LENGTH(extracted_content) as content_length,
  updated_at,
  created_at
FROM sources
WHERE name LIKE '[TESTE]%'
ORDER BY created_at DESC
LIMIT 1;

-- Esperado: embeddings_status = 'pending'

-- 3.3 Verificar se aparece na fila
SELECT * FROM get_pending_embeddings_queue(10);

-- Esperado: Source de teste deve aparecer

-- ============================================================================
-- PARTE 4: TESTAR CONDIÇÃO DO WEBHOOK
-- ============================================================================

-- 4.1 Simular condição do webhook (versão simples)
WITH test_source AS (
  SELECT *
  FROM sources
  WHERE name LIKE '[TESTE]%'
  ORDER BY created_at DESC
  LIMIT 1
),
old_record AS (
  -- Simular registro antigo (antes do update)
  SELECT
    id,
    project_id,
    name,
    type,
    storage_path,
    NULL::TEXT as extracted_content,  -- Antes: sem conteúdo
    '{}',
    'pending',
    'skipped'::TEXT as embeddings_status,  -- Antes: skipped
    NOW() - INTERVAL '1 minute',
    NOW() - INTERVAL '1 minute'
  FROM test_source
),
new_record AS (
  -- Registro novo (depois do update)
  SELECT * FROM test_source
)
SELECT
  'Condição Simples' as teste,
  CASE
    WHEN (
      new_record.embeddings_status = 'pending'
      AND new_record.extracted_content IS NOT NULL
      AND new_record.extracted_content != ''
      AND (old_record.extracted_content IS NULL OR old_record.extracted_content = '')
    ) THEN '✅ Webhook DISPARARIA'
    ELSE '❌ Webhook NÃO dispararia'
  END as resultado
FROM old_record, new_record;

-- 4.2 Simular condição do webhook (versão completa)
WITH test_source AS (
  SELECT *
  FROM sources
  WHERE name LIKE '[TESTE]%'
  ORDER BY created_at DESC
  LIMIT 1
),
old_record AS (
  SELECT
    id, project_id, name, type, storage_path,
    NULL::TEXT as extracted_content,
    '{}'::jsonb as metadata,
    'pending' as status,
    'skipped'::TEXT as embeddings_status,
    NOW() - INTERVAL '1 minute' as created_at,
    NOW() - INTERVAL '1 minute' as updated_at
  FROM test_source
),
new_record AS (
  SELECT * FROM test_source
)
SELECT
  'Condição Completa' as teste,
  CASE
    WHEN (
      new_record.embeddings_status = 'pending'
      AND new_record.extracted_content IS NOT NULL
      AND new_record.extracted_content != ''
      AND (
        old_record.embeddings_status IS NULL
        OR old_record.embeddings_status != 'pending'
        OR old_record.extracted_content IS NULL
        OR old_record.extracted_content = ''
      )
    ) THEN '✅ Webhook DISPARARIA'
    ELSE '❌ Webhook NÃO dispararia'
  END as resultado
FROM old_record, new_record;

-- ============================================================================
-- PARTE 5: TESTAR FUNÇÕES DE STATUS
-- ============================================================================

-- 5.1 Marcar como processing (simula edge function pegando da fila)
DO $$
DECLARE
  test_source_id UUID;
  success BOOLEAN;
BEGIN
  SELECT id INTO test_source_id
  FROM sources
  WHERE name LIKE '[TESTE]%'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT mark_embeddings_processing(test_source_id) INTO success;

  IF success THEN
    RAISE NOTICE '✅ Marcado como processing';
  ELSE
    RAISE WARNING '❌ Falha ao marcar como processing';
  END IF;
END $$;

-- 5.2 Verificar status
SELECT
  name,
  embeddings_status,
  updated_at
FROM sources
WHERE name LIKE '[TESTE]%';

-- Esperado: embeddings_status = 'processing'

-- 5.3 Aguardar 2 segundos (simula processamento)
SELECT pg_sleep(2);

-- 5.4 Marcar como completed (simula edge function finalizando)
DO $$
DECLARE
  test_source_id UUID;
  success BOOLEAN;
BEGIN
  SELECT id INTO test_source_id
  FROM sources
  WHERE name LIKE '[TESTE]%'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT mark_embeddings_completed(test_source_id, 25) INTO success;

  IF success THEN
    RAISE NOTICE '✅ Marcado como completed';
  ELSE
    RAISE WARNING '❌ Falha ao marcar como completed';
  END IF;
END $$;

-- 5.5 Verificar metadata atualizado
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks,
  metadata->>'embeddings_completed_at' as completed_at,
  updated_at
FROM sources
WHERE name LIKE '[TESTE]%';

-- Esperado:
-- - embeddings_status = 'completed'
-- - chunks = '25'
-- - completed_at = timestamp recente

-- ============================================================================
-- PARTE 6: TESTAR FLUXO DE ERRO
-- ============================================================================

-- 6.1 Criar outro source de teste para simular erro
DO $$
DECLARE
  test_project_id UUID;
  test_source_id UUID;
BEGIN
  SELECT id INTO test_project_id
  FROM projects
  WHERE user_id = auth.uid()
  LIMIT 1;

  INSERT INTO sources (
    project_id,
    name,
    type,
    storage_path,
    extracted_content,
    status,
    embeddings_status
  ) VALUES (
    test_project_id,
    '[TESTE] Erro Simulado',
    'pdf',
    '/test/error-test.pdf',
    'Conteúdo de teste para simular erro',
    'ready',
    'pending'
  ) RETURNING id INTO test_source_id;

  -- Marcar como processing
  PERFORM mark_embeddings_processing(test_source_id);

  -- Simular erro
  PERFORM mark_embeddings_failed(
    test_source_id,
    'Erro simulado: Gemini API quota exceeded'
  );

  RAISE NOTICE 'Source de erro criado: %', test_source_id;
END $$;

-- 6.2 Verificar status de erro
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_error' as error_message,
  metadata->>'embeddings_failed_at' as failed_at
FROM sources
WHERE name LIKE '[TESTE]%'
ORDER BY created_at DESC;

-- ============================================================================
-- PARTE 7: ESTATÍSTICAS GERAIS
-- ============================================================================

-- 7.1 Dashboard de status
SELECT
  embeddings_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sources
WHERE extracted_content IS NOT NULL
GROUP BY embeddings_status
ORDER BY count DESC;

-- 7.2 Sources recentemente completados
SELECT
  name,
  metadata->>'embeddings_chunks' as chunks,
  metadata->>'embeddings_completed_at' as completed_at
FROM sources
WHERE embeddings_status = 'completed'
  AND metadata->>'embeddings_completed_at' IS NOT NULL
ORDER BY (metadata->>'embeddings_completed_at')::timestamptz DESC
LIMIT 10;

-- 7.3 Sources com erro
SELECT
  name,
  metadata->>'embeddings_error' as error,
  metadata->>'embeddings_failed_at' as failed_at
FROM sources
WHERE embeddings_status = 'failed'
ORDER BY (metadata->>'embeddings_failed_at')::timestamptz DESC
LIMIT 10;

-- ============================================================================
-- PARTE 8: LIMPEZA (OPCIONAL)
-- ============================================================================

-- 8.1 Remover sources de teste
-- ⚠️ CUIDADO: Só execute se quiser apagar os sources de teste!
/*
DELETE FROM sources
WHERE name LIKE '[TESTE]%';

SELECT 'Sources de teste removidos' as status;
*/

-- ============================================================================
-- RESUMO DOS TESTES
-- ============================================================================

SELECT '
============================================================================
RESUMO - Checklist de Validação
============================================================================

✅ = Passou | ❌ = Falhou

PARTE 1 - Instalação:
  □ Coluna embeddings_status existe
  □ Coluna updated_at existe
  □ 6 funções SQL instaladas
  □ Trigger auto_queue_embeddings instalado

PARTE 2 - Funções SQL:
  □ get_pending_embeddings_queue funciona
  □ Sources existentes têm status correto

PARTE 3 - Fluxo Completo:
  □ Source de teste criado
  □ Trigger marcou automaticamente como "pending"
  □ Source aparece na fila

PARTE 4 - Condição Webhook:
  □ Condição simples: Webhook dispararia
  □ Condição completa: Webhook dispararia

PARTE 5 - Funções de Status:
  □ mark_embeddings_processing funciona
  □ mark_embeddings_completed funciona
  □ Metadata atualizado corretamente

PARTE 6 - Fluxo de Erro:
  □ mark_embeddings_failed funciona
  □ Erro registrado no metadata

PARTE 7 - Estatísticas:
  □ Dashboard mostra status corretamente
  □ Sources completados listados
  □ Sources com erro listados

============================================================================
PRÓXIMOS PASSOS:
============================================================================

1. Se TODOS os testes passaram:
   → Configurar Database Webhook
   → Deploy da edge function process-embeddings-queue
   → Testar com PDF real

2. Se ALGUM teste falhou:
   → Verificar logs de erro
   → Reexecutar migration 006
   → Contactar suporte se necessário

============================================================================
' as checklist;
