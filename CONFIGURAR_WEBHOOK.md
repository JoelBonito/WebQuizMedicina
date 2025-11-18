# 🔔 Como Configurar o Webhook para Embeddings Automáticos

O webhook dispara automaticamente o processamento de embeddings quando você faz upload de um arquivo.

## ⚡ Passo a Passo Visual

### 1️⃣ Abra o Dashboard de Webhooks

Clique neste link:
```
https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks
```

### 2️⃣ Clique em "Create a new hook"

Botão verde no canto superior direito da tela.

---

## 📋 Configuração do Webhook

### ✏️ BASIC INFORMATION

| Campo | Valor |
|-------|-------|
| **Name** | `auto-process-embeddings` |
| **Table** | `public.sources` |
| **Events** | ☑ INSERT  ☑ UPDATE |
| **Type** | HTTP Request |
| **Method** | POST |

---

### 🌐 HTTP REQUEST

**URL:**
```
https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue
```

---

### 🔑 HTTP HEADERS

Adicione **2 headers**:

**Header 1:**
- **Name:** `Authorization`
- **Value:** `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU`

**Header 2:**
- **Name:** `Content-Type`
- **Value:** `application/json`

---

### 📦 HTTP PAYLOAD (Body)

Cole este JSON:
```json
{
  "source_id": "{{ record.id }}",
  "max_items": 1
}
```

**IMPORTANTE:** O `{{ record.id }}` é uma variável automática - copie exatamente assim!

---

### ⚙️ CONDITION (Filtro)

Cole esta condição para evitar processamento duplicado:
```sql
new.embeddings_status = 'pending'
AND new.extracted_content IS NOT NULL
AND new.extracted_content != ''
AND (old.extracted_content IS NULL OR old.extracted_content = '')
```

**O que isso faz:**
- ✅ Só processa quando status = 'pending'
- ✅ Só processa quando há conteúdo extraído
- ✅ Só processa quando é um novo arquivo (evita reprocessamento)

---

### 3️⃣ Clique em "CREATE WEBHOOK"

Botão verde no final do formulário.

---

## ✅ Como Testar se Funcionou

Depois de configurar o webhook:

1. **Faça upload de um PDF novo** no seu projeto
2. **Aguarde 10-30 segundos**
3. **Verifique no Supabase Table Editor:**
   ```
   https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/editor
   ```
4. **Abra a tabela `sources`**
5. **Procure o arquivo que você fez upload**
6. **Verifique a coluna `embeddings_status`:**
   - ✅ Se mudou de `pending` → `completed` = **FUNCIONOU!**
   - ❌ Se continua `pending` = webhook não disparou

---

## 🔍 Como Verificar se o Webhook Está Configurado

No dashboard de webhooks:
```
https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks
```

Você deve ver:
- ✅ Nome: `auto-process-embeddings`
- ✅ Status: **Enabled** (verde)
- ✅ Table: `public.sources`
- ✅ Events: INSERT, UPDATE

---

## 🐛 Troubleshooting

### Problema: Webhook não dispara

**Verificações:**

1. **Webhook está enabled?**
   - Vá em: Database → Webhooks
   - Confirme que o toggle está verde (enabled)

2. **URL está correta?**
   - Deve ser: `https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue`
   - Verifique se não tem espaços extras

3. **Headers estão corretos?**
   - Authorization: `Bearer eyJhbG...` (começa com "Bearer ")
   - Content-Type: `application/json`

4. **Condition está correta?**
   - Copie exatamente da seção CONDITION acima

5. **Função está deployada?**
   - Execute: `./deploy-functions.sh`
   - Confirme que `process-embeddings-queue` foi deployado com sucesso

---

### Problema: Status fica em "pending"

Isso pode significar que:

1. **Webhook não está configurado** → Siga este guia
2. **Função teve erro** → Verifique logs:
   ```
   https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/logs/edge-functions
   ```
3. **Arquivo muito grande** → Embeddings podem demorar 1-2 minutos

---

### Problema: Erro 401 Unauthorized

**Solução:** Verifique o header Authorization

Deve ser EXATAMENTE:
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU
```

(Começa com "Bearer " + um espaço + o token)

---

## 📊 Monitoramento

### Ver Logs do Webhook

1. Vá para: **Database → Webhooks**
2. Clique no webhook `auto-process-embeddings`
3. Clique na aba **"Logs"**
4. Veja os disparos recentes e se houve erros

### Ver Logs da Edge Function

```
https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/logs/edge-functions
```

Filtre por: `process-embeddings-queue`

---

## 🎯 Resultado Esperado

Depois de configurar o webhook corretamente:

1. **Você faz upload de um PDF**
2. **Arquivo é salvo com `embeddings_status = 'pending'`**
3. **Webhook dispara automaticamente** (em < 1 segundo)
4. **Função `process-embeddings-queue` executa:**
   - Divide o texto em chunks
   - Gera embeddings com Gemini
   - Salva no banco de dados
5. **Status muda para `completed`** (em 10-30 segundos)
6. **Quiz, flashcards e chat já funcionam com busca semântica!**

---

## 📚 Arquivos de Referência

- `WEBHOOK_CONFIG.txt` - Configuração resumida para copiar/colar
- `COMANDOS_PRONTOS.sh` - Comandos para testar manualmente
- `INICIO_RAPIDO.md` - Guia completo do sistema
- `TEST_AUTO_EMBEDDINGS.sql` - Teste SQL completo

---

## ❓ Ainda com Problemas?

Se o webhook não funcionar após seguir este guia:

1. Execute o script de deploy primeiro:
   ```bash
   ./deploy-functions.sh
   ```

2. Verifique os logs do Supabase para ver erros

3. Tente processar manualmente para testar:
   ```bash
   curl -X POST \
     https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU" \
     -H "Content-Type: application/json" \
     -d '{"max_items": 1}'
   ```

Se funcionar manualmente mas não pelo webhook, o problema está na configuração do webhook.
