# 🐛 Debug: Erro 404 no Upload

## 📋 Problema Relatado

```
Failed to load resource: the server responded with a status of 404
bwgglfforazywrjhbxsa.supabase.co/rest/v1/sources?id=eq.0e54d07f-1193-4ab2-b332-f79123dbd655&select=*
```

**Sintomas:**
- Upload inicia normalmente
- Arquivo é enviado para storage
- Registro é criado na tabela `sources`
- Mas ao tentar UPDATE com conteúdo extraído, retorna 404
- Erro: "Supabase update error: Object"

---

## 🔍 Análise do Código

### Fluxo do Upload (useSources.ts):

```typescript
// 1. INSERT - Cria registro com status 'processing'
const { data: source } = await supabase
  .from('sources')
  .insert([{ project_id, name, type, storage_path, metadata, status: 'processing' }])
  .select()
  .single();

// 2. Processa arquivo (extrai conteúdo)
const extractedContent = await processFile(file);

// 3. UPDATE - Atualiza com conteúdo extraído ❌ FALHA AQUI!
const { data: updatedSource, error: updateError } = await supabase
  .from('sources')
  .update({ extracted_content: safeContent, status: 'ready' })
  .eq('id', source.id)
  .select()
  .single();  // 404 - Not Found!
```

---

## 🔐 Possíveis Causas

### 1. **Políticas RLS (Row Level Security)**

As políticas RLS na tabela `sources` são:

```sql
-- SELECT Policy
CREATE POLICY "Users can view sources from own projects"
  ON sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- UPDATE Policy
CREATE POLICY "Users can update sources from own projects"
  ON sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );
```

**Problema potencial:**
- O INSERT funciona (cria o registro)
- Mas o SELECT após UPDATE falha (404)
- Isso sugere que `auth.uid()` pode estar NULL ou diferente

---

### 2. **Trigger de Embeddings Interferindo**

Há um trigger `trigger_auto_queue_embeddings` que modifica o registro:

```sql
CREATE TRIGGER auto_queue_embeddings
  BEFORE INSERT OR UPDATE ON sources
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_queue_embeddings();

-- Função que modifica embeddings_status
CREATE FUNCTION trigger_auto_queue_embeddings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.extracted_content IS NOT NULL AND NEW.extracted_content != '' THEN
    NEW.embeddings_status = 'pending';
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Impacto:**
- Quando faz UPDATE com `extracted_content`, o trigger modifica mais campos
- Isso não deve causar 404, mas pode afetar o resultado

---

### 3. **Webhook Duplicado**

Se você criou o webhook via SQL **E** também via Dashboard, pode haver dois webhooks disparando, causando race condition.

---

## ✅ Verificações Para Fazer

### **1. Verificar se o Webhook SQL Foi Criado:**

```sql
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'auto_process_embeddings_webhook'
  AND event_object_table = 'sources';
```

**Resultado esperado:**
- Se retornar 2 linhas (INSERT + UPDATE) = webhook criado ✅
- Se retornar 0 linhas = webhook não foi criado ❌

---

### **2. Verificar Políticas RLS:**

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'sources'
ORDER BY cmd;
```

**Verificar se:**
- Há políticas para SELECT, INSERT, UPDATE, DELETE
- Políticas usam `auth.uid()` corretamente

---

### **3. Testar Upload Manual:**

```sql
-- 1. Simular INSERT (como o frontend)
INSERT INTO sources (project_id, name, type, storage_path, status)
VALUES (
  'SEU_PROJECT_ID',  -- Substitua pelo ID do seu projeto
  'test.pdf',
  'pdf',
  'test-path',
  'processing'
)
RETURNING *;

-- Anote o ID retornado acima

-- 2. Simular UPDATE (onde falha)
UPDATE sources
SET extracted_content = 'Conteúdo de teste',
    status = 'ready'
WHERE id = 'ID_DO_PASSO_1'
RETURNING *;
```

**Se der erro:**
- Verifique o erro exato
- Pode ser RLS blocking o SELECT

---

### **4. Verificar Auth Context:**

Execute no frontend (Console do navegador):

```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log('User ID:', session?.user?.id);
console.log('Access Token:', session?.access_token);
```

**Depois execute no SQL Editor:**

```sql
-- Verificar se o projeto pertence ao usuário
SELECT
  p.id,
  p.name,
  p.user_id,
  auth.uid() as current_user
FROM projects p
WHERE p.id = 'SEU_PROJECT_ID';
```

**Verificar:**
- `p.user_id` deve ser igual a `auth.uid()`
- Se forem diferentes, o RLS bloqueia o acesso

---

## 🔧 Soluções Possíveis

### **Solução 1: Remover .select().single() do UPDATE**

Modificar `src/hooks/useSources.ts` linha 120-128:

```typescript
// ANTES (com erro 404):
const { data: updatedSource, error: updateError } = await supabase
  .from('sources')
  .update({ extracted_content: safeContent, status: 'ready' })
  .eq('id', source.id)
  .select()
  .single();

// DEPOIS (sem SELECT):
const { error: updateError } = await supabase
  .from('sources')
  .update({ extracted_content: safeContent, status: 'ready' })
  .eq('id', source.id);

if (!updateError) {
  // Buscar o registro atualizado separadamente
  const { data: updatedSource } = await supabase
    .from('sources')
    .select('*')
    .eq('id', source.id)
    .single();

  if (updatedSource) {
    setSources(prevSources => prevSources.map((s) => (s.id === source.id ? updatedSource : s)));
  }
}
```

---

### **Solução 2: Adicionar Logs Detalhados**

No `src/hooks/useSources.ts`, adicionar logs antes do UPDATE:

```typescript
// Antes do UPDATE
console.log('📤 Tentando UPDATE:', {
  source_id: source.id,
  project_id: projectId,
  content_length: safeContent?.length,
});

const { data: updatedSource, error: updateError } = await supabase
  .from('sources')
  .update({ extracted_content: safeContent, status: 'ready' })
  .eq('id', source.id)
  .select()
  .single();

console.log('📥 Resultado UPDATE:', {
  success: !updateError,
  error: updateError,
  data: updatedSource,
});
```

---

### **Solução 3: Verificar Token de Autenticação**

Se o token expirou ou está inválido, o RLS bloqueia.

```typescript
// No início de uploadSource()
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('Sessão expirada. Faça login novamente.');
}
console.log('✅ Sessão válida:', session.user.id);
```

---

## 🧪 Teste Rápido

Execute este SQL para ver se há registros "órfãos":

```sql
SELECT
  s.id,
  s.name,
  s.project_id,
  s.status,
  s.embeddings_status,
  s.extracted_content IS NOT NULL as has_content,
  p.user_id,
  auth.uid() as current_user
FROM sources s
LEFT JOIN projects p ON p.id = s.project_id
WHERE s.status = 'processing'
  OR (s.extracted_content IS NULL AND s.status != 'error')
ORDER BY s.created_at DESC
LIMIT 10;
```

**Se encontrar registros com status='processing':**
- Esses são uploads que falharam no UPDATE
- Confirma o problema

---

## 📊 Próximos Passos

1. ✅ Execute as verificações acima
2. ✅ Identifique qual verificação falha
3. ✅ Aplique a solução correspondente
4. ✅ Teste novamente o upload

**Me envie os resultados das verificações para eu ajudar a diagnosticar melhor!**
