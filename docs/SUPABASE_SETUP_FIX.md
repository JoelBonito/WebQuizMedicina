# 🔧 Guia de Correção do Supabase - Erro 403 e Upload

Este guia resolve os erros de **403 Forbidden** ao criar projetos e **400 Bad Request** ao fazer upload de arquivos.

## 📋 Problemas Identificados

1. **Erro ao criar projeto (403)**: Políticas RLS da tabela `projects` podem não estar aplicadas
2. **Erro ao fazer upload (400)**: Políticas RLS do bucket `project-sources` estão incorretas

## 🚀 Solução Rápida

### Opção 1: Usando Supabase CLI (Recomendado)

```bash
# 1. Certifique-se de ter o Supabase CLI instalado
npm install -g supabase

# 2. Faça login no Supabase
supabase login

# 3. Link com seu projeto
supabase link --project-ref SEU_PROJECT_REF

# 4. Aplique as migrações
supabase db push
```

### Opção 2: Aplicar Manualmente no Dashboard

Se você não conseguir usar o CLI, siga estes passos:

#### Passo 1: Acesse o Dashboard do Supabase

1. Vá para https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor**

#### Passo 2: Corrigir Políticas de Storage

Cole e execute este SQL:

```sql
-- Drop políticas antigas
DROP POLICY IF EXISTS "Users can upload to own project folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own project files" ON storage.objects;

-- Criar políticas corrigidas
CREATE POLICY "Users can upload to own project folders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own project files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);
```

#### Passo 3: Verificar Bucket de Storage

1. Vá em **Storage** no menu lateral
2. Verifique se existe o bucket `project-sources`
3. Se não existir, execute este SQL:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-sources', 'project-sources', false)
ON CONFLICT (id) DO NOTHING;
```

#### Passo 4: Verificar Tabela Projects e Políticas RLS

Execute este SQL para garantir que a tabela e políticas existem:

```sql
-- Verificar se a tabela existe
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'projects'
);

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'projects';
```

Se a tabela não existir ou não tiver políticas, execute a migração completa `001_initial_schema.sql` do SQL Editor.

## ✅ Verificação

Após aplicar as correções, teste:

### 1. Teste de Criação de Projeto
```javascript
// No console do navegador (F12)
const { data, error } = await window.supabase
  .from('projects')
  .insert([{ name: 'Teste', user_id: (await window.supabase.auth.getUser()).data.user.id }])
  .select()
  .single();

console.log({ data, error });
```

### 2. Teste de Upload
- Tente fazer upload de um PDF na interface
- Não deve mais aparecer o erro "violates row-level security policy"

## 🔍 Troubleshooting

### Erro persiste após aplicar correções?

1. **Limpe o cache do navegador** (Ctrl+Shift+Delete)
2. **Faça logout e login novamente** no app
3. **Verifique as variáveis de ambiente**:
   ```bash
   cat .env
   ```
   Devem existir:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. **Reinicie o servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```

### Como verificar se as políticas foram aplicadas?

Execute no SQL Editor:

```sql
-- Verificar políticas de storage
SELECT * FROM pg_policies WHERE schemaname = 'storage';

-- Verificar políticas de projects
SELECT * FROM pg_policies WHERE tablename = 'projects';
```

## 📖 Explicação Técnica

### Problema Original

A política antiga usava `storage.foldername(name)` que não estava funcionando corretamente:

```sql
-- ❌ ANTIGA (não funciona)
auth.uid()::text = (storage.foldername(name))[1]
```

### Solução Implementada

A nova política usa `string_to_array` que é mais confiável:

```sql
-- ✅ NOVA (funciona)
(string_to_array(name, '/'))[1] = auth.uid()::text
```

### Estrutura de Paths

Os arquivos são salvos com esta estrutura:
```
project-sources/
  └── {user_id}/
      └── {project_id}/
          └── {timestamp}_{random}.pdf
```

Exemplo real:
```
project-sources/0e19795f-88ed-4aa2-97dd-532b645850d0/46cb4c08-84ac-4479-8f03-795067112cc4/1763342886074_wjm2pf.pdf
```

A política verifica se o primeiro nível (`0e19795f-88ed-4aa2-97dd-532b645850d0`) corresponde ao `auth.uid()` do usuário autenticado.

## 📞 Suporte

Se o problema persistir:
1. Verifique os logs do Supabase (Dashboard > Logs)
2. Abra um issue no repositório com os detalhes do erro
3. Inclua screenshots dos erros do console (F12)

---

✨ Após aplicar estas correções, tanto a criação de projetos quanto o upload de arquivos devem funcionar perfeitamente!
