-- ============================================
-- OPCIONAL: Aumentar limite de tamanho de arquivo
-- ============================================

-- IMPORTANTE: Este script é OPCIONAL e aumenta o limite de tamanho de arquivo
-- de 50MB (padrão) para 100MB.
--
-- NOTA: No Supabase, o limite de tamanho de arquivo é configurado no nível
-- do projeto, não no bucket. Para aumentar o limite, você precisa:
--
-- 1. Ir para o Dashboard do Supabase
-- 2. Settings → Storage
-- 3. Configurar "Max file size limit"
--
-- Alternativamente, use a API do Supabase:
-- https://supabase.com/docs/reference/javascript/storage-update-bucket

-- Atualizar metadados do bucket (se necessário)
UPDATE storage.buckets
SET
  file_size_limit = 104857600 -- 100MB in bytes
WHERE id = 'project-sources';

-- Nota: Esta configuração pode não funcionar em todos os planos do Supabase.
-- Verifique a documentação do seu plano para limites de arquivo.

-- ============================================
-- Verificação
-- ============================================

-- Ver configuração atual do bucket
SELECT
  id,
  name,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'project-sources';

-- ============================================
-- Informações de Referência
-- ============================================

-- Limites padrão do Supabase:
-- - Free tier: 50MB por arquivo
-- - Pro tier: Configurável até 50GB
-- - Enterprise: Configurável

-- Para mais informações:
-- https://supabase.com/docs/guides/storage/uploads/file-limits
