-- ============================================
-- SCRIPT DE CORREÇÃO - Execute apenas se a verificação mostrar problemas
-- ============================================

-- Este script garante que TUDO está configurado corretamente
-- É seguro executar múltiplas vezes (usa IF NOT EXISTS)

-- 1. Garantir que a tabela profiles existe com todos os campos
DO $$
BEGIN
  -- Adicionar response_language se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'response_language'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN response_language TEXT DEFAULT 'pt'
    CHECK (response_language IN ('pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar'));
  END IF;
END $$;

-- 2. Atualizar perfis existentes que não têm idioma
UPDATE public.profiles
SET response_language = 'pt'
WHERE response_language IS NULL;

-- 3. Criar índices se não existirem
CREATE INDEX IF NOT EXISTS profiles_id_idx ON public.profiles(id);
CREATE INDEX IF NOT EXISTS profiles_response_language_idx ON public.profiles(response_language);

-- 4. Garantir que RLS está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Recriar policies (DROP e CREATE para garantir que estão corretas)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 6. Recriar função handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Recriar função handle_new_user (com response_language)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, response_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'response_language', 'pt')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Recriar trigger on_profile_updated
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 9. Recriar trigger on_auth_user_created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 10. Garantir que o bucket user-uploads existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 11. Recriar policies de storage
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view user uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' AND
  (
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);

CREATE POLICY "Anyone can view user uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-uploads');

CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-uploads' AND
  (
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-uploads' AND
  (
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);

-- ============================================
-- Verificação final
-- ============================================
SELECT 'Configuração completa!' as status;

-- Mostrar perfil do usuário atual
SELECT
  id,
  display_name,
  response_language,
  avatar_url,
  created_at,
  updated_at
FROM public.profiles
WHERE id = auth.uid();
