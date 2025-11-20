-- ============================================
-- SCRIPT DE VERIFICAÇÃO DO BANCO DE DADOS
-- Execute este script no Supabase SQL Editor
-- ============================================

-- 1. Verificar estrutura da tabela profiles
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 2. Verificar índices da tabela profiles
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- 3. Verificar RLS policies da tabela profiles
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- 4. Verificar se RLS está habilitado
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- 5. Verificar triggers na tabela profiles
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles';

-- 6. Verificar triggers na tabela auth.users (para handle_new_user)
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
  AND trigger_name LIKE '%new_user%';

-- 7. Verificar funções relacionadas ao profile
SELECT
  routine_name,
  routine_type,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('handle_new_user', 'handle_updated_at');

-- 8. Verificar bucket de storage user-uploads
SELECT
  id,
  name,
  public,
  created_at
FROM storage.buckets
WHERE id = 'user-uploads';

-- 9. Verificar policies do storage.objects para user-uploads
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname ILIKE '%upload%' OR policyname ILIKE '%avatar%' OR policyname ILIKE '%user%';

-- 10. Verificar constraint do response_language
SELECT
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'profiles'
  AND tc.constraint_type = 'CHECK';

-- 11. Testar se perfil atual tem response_language
SELECT
  id,
  display_name,
  response_language,
  avatar_url,
  created_at,
  updated_at
FROM public.profiles
WHERE id = auth.uid();

-- 12. Verificar total de perfis com cada idioma
SELECT
  response_language,
  COUNT(*) as total
FROM public.profiles
GROUP BY response_language
ORDER BY total DESC;

-- ============================================
-- RESULTADOS ESPERADOS:
-- ============================================
-- 1. profiles deve ter: id, display_name, avatar_url, response_language, created_at, updated_at
-- 2. Deve ter 2 índices: profiles_pkey, profiles_id_idx, profiles_response_language_idx
-- 3. Deve ter 3 policies: view, update, insert
-- 4. RLS deve estar habilitado (rowsecurity = true)
-- 5. Deve ter trigger on_profile_updated
-- 6. Deve ter trigger on_auth_user_created
-- 7. Deve ter funções handle_new_user e handle_updated_at
-- 8. Bucket user-uploads deve existir e ser público
-- 9. Deve ter 4 policies de storage: upload, view, update, delete
-- 10. Deve ter CHECK constraint com 10 idiomas
-- 11. Seu perfil deve aparecer com response_language definido
-- 12. Distribuição de idiomas dos usuários
