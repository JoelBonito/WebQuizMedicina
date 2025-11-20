# Verificação e Correção do Banco de Dados

Este documento explica como verificar se a configuração do banco de dados está completa.

## 📋 Checklist de Configuração

### Tabela `profiles`
- [x] Campo `response_language` existe
- [x] Valor padrão 'pt'
- [x] CHECK constraint com 10 idiomas
- [ ] Índice `profiles_response_language_idx` criado
- [ ] RLS habilitado
- [ ] 3 policies (SELECT, UPDATE, INSERT)

### Triggers e Funções
- [ ] Função `handle_new_user()` existe e inclui `response_language`
- [ ] Função `handle_updated_at()` existe
- [ ] Trigger `on_auth_user_created` na tabela `auth.users`
- [ ] Trigger `on_profile_updated` na tabela `profiles`

### Storage
- [ ] Bucket `user-uploads` existe e é público
- [ ] 4 policies de storage (INSERT, SELECT, UPDATE, DELETE)
- [ ] Suporte para avatares no path `avatars/{user_id}-{timestamp}.{ext}`
- [ ] Suporte para fontes no path `{user_id}/{project_id}/{filename}`

## 🔍 Como Verificar

### Passo 1: Execute o Script de Verificação

1. Acesse o **Supabase Dashboard**
2. Vá para **SQL Editor**
3. Abra o arquivo `000_verify_configuration.sql`
4. Clique em **Run**
5. Analise os resultados de cada query

### Passo 2: Analise os Resultados

#### Query 1: Estrutura da tabela profiles
Deve mostrar 6 colunas:
```
column_name        | data_type                   | column_default | is_nullable
-------------------+-----------------------------+----------------+-------------
id                 | uuid                        | NULL           | NO
display_name       | text                        | NULL           | YES
avatar_url         | text                        | NULL           | YES
response_language  | text                        | 'pt'::text     | YES
created_at         | timestamp with time zone    | now()          | YES
updated_at         | timestamp with time zone    | now()          | YES
```

#### Query 2: Índices
Deve mostrar pelo menos 2 índices:
- `profiles_pkey` (PRIMARY KEY)
- `profiles_response_language_idx`

#### Query 3: RLS Policies
Deve mostrar 3 policies:
- `Users can view their own profile` (SELECT)
- `Users can update their own profile` (UPDATE)
- `Users can insert their own profile` (INSERT)

#### Query 4: RLS Status
```
rowsecurity: true
```

#### Query 5 e 6: Triggers
Deve mostrar:
- `on_profile_updated` na tabela `profiles`
- `on_auth_user_created` na tabela `auth.users`

#### Query 7: Funções
Deve mostrar 2 funções:
- `handle_new_user` (SECURITY DEFINER)
- `handle_updated_at`

#### Query 8: Storage Bucket
```
id           | name         | public | created_at
-------------+--------------+--------+-------------------
user-uploads | user-uploads | true   | [timestamp]
```

#### Query 9: Storage Policies
Deve mostrar 4 policies:
- `Users can upload avatars` (INSERT)
- `Anyone can view user uploads` (SELECT)
- `Users can update own files` (UPDATE)
- `Users can delete own files` (DELETE)

#### Query 10: CHECK Constraint
Deve mostrar constraint verificando os 10 idiomas:
```sql
response_language = ANY (ARRAY['pt'::text, 'en'::text, 'es'::text, ...])
```

#### Query 11: Seu Perfil
Deve mostrar seu perfil com `response_language` definido.

#### Query 12: Distribuição de Idiomas
Mostra quantos usuários usam cada idioma.

## 🔧 Correção de Problemas

Se a verificação mostrar que algo está faltando:

### Opção 1: Execute o Script de Correção (Recomendado)

1. Acesse o **Supabase Dashboard**
2. Vá para **SQL Editor**
3. Abra o arquivo `999_fix_missing_items.sql`
4. Clique em **Run**
5. Execute a verificação novamente

Este script é **seguro** e pode ser executado múltiplas vezes.

### Opção 2: Execute as Migrações Manualmente

Execute as migrações na ordem:

```bash
# Via Supabase CLI
supabase db push

# Ou aplique manualmente no SQL Editor:
# 1. 007_create_profiles.sql
# 2. 008_fix_avatar_storage.sql
# 3. 009_add_response_language.sql
```

## ✅ Validação Final

Depois de aplicar as correções:

1. Execute `000_verify_configuration.sql` novamente
2. Verifique se todos os itens do checklist estão ✅
3. Teste no frontend:
   - Abra configurações de perfil
   - Verifique se os 10 idiomas aparecem
   - Selecione um idioma diferente
   - Salve e verifique o feedback visual
   - Reabra e confirme que o idioma foi salvo

## 🐛 Troubleshooting

### Problema: Apenas 3 idiomas aparecem no seletor
**Causa**: Frontend não atualizado ou cache do navegador
**Solução**:
```bash
# Limpar cache do navegador (Ctrl+Shift+R)
# Ou reiniciar dev server:
npm run dev
```

### Problema: Erro ao salvar idioma
**Causa**: CHECK constraint ou RLS policy
**Solução**: Execute `999_fix_missing_items.sql`

### Problema: response_language sempre volta para 'pt'
**Causa**: Trigger `handle_new_user` não atualizado
**Solução**: Execute query 7 da verificação e depois `999_fix_missing_items.sql`

### Problema: Avatar upload falha
**Causa**: Storage policies não configuradas
**Solução**: Execute `008_fix_avatar_storage.sql` ou `999_fix_missing_items.sql`

## 📊 Monitoramento

Para monitorar o uso de idiomas:

```sql
SELECT
  response_language,
  COUNT(*) as total_users,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM profiles), 2) as percentage
FROM public.profiles
WHERE response_language IS NOT NULL
GROUP BY response_language
ORDER BY total_users DESC;
```

## 🔐 Segurança

Todos os scripts seguem as melhores práticas:
- ✅ RLS habilitado
- ✅ Usuários só acessam seus próprios dados
- ✅ CHECK constraints para validação
- ✅ SECURITY DEFINER apenas onde necessário
- ✅ Storage público apenas para visualização
- ✅ Upload restrito ao próprio usuário
