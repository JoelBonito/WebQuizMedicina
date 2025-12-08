# 🚀 Início Rápido - Sistema Automático de Embeddings

## 🎯 Seu Problema: Sources ficam em "pending" para sempre

**Causa:** O sistema automático não está configurado ainda.

**Solução:** Siga um dos guias abaixo (15 minutos).

---

## 📚 Qual Arquivo Usar?

### 🏃‍♂️ **Para Setup Rápido (RECOMENDADO)**

**1. Execute:** `./COMANDOS_PRONTOS.sh`
- Script com todos os comandos já preenchidos
- Mostra exatamente o que fazer
- Valores do seu projeto já configurados

**2. Configure webhook:** Abra `WEBHOOK_CONFIG.txt`
- Cole os valores no Dashboard do Supabase
- Copy/paste direto, sem editar

**3. (Opcional) Cron job:** Execute `CRON_JOB.sql`
- Processamento de backup a cada 5 minutos
- Garantia caso webhook falhe

---

### 📖 **Para Entender o Sistema Completo**

**Leia:** `SETUP_AUTOMATICO.md`
- Guia completo passo a passo
- Explicações detalhadas
- Troubleshooting
- Todas as opções disponíveis

---

### 🧪 **Para Testar Sem Configurar Webhook**

**Use:** `MANUAL_TEST_EMBEDDINGS.sql`
- Processar sources manualmente
- Útil para debugar
- 3 opções: curl, SQL, ou source específico

---

### 📋 **Outros Recursos**

| Arquivo | Quando Usar |
|---------|-------------|
| `TEST_AUTO_EMBEDDINGS.sql` | Validar instalação completa (8 partes) |
| `AUTO_EMBEDDINGS_SYSTEM.md` | Documentação técnica completa |
| `QUICK_START_AUTO_EMBEDDINGS.md` | Guia rápido original |
| `RAG_IMPLEMENTATION_GUIDE.md` | Entender o sistema RAG |

---

## ⚡ Ação Imediata (3 Passos)

### **Passo 1: Deploy Edge Function** (2 min)

Na sua máquina local:
```bash
cd /caminho/para/WebQuizMedicina
supabase functions deploy process-embeddings-queue --project-ref bwgglfforazywrjhbxsa
```

### **Passo 2: Configurar Webhook** (5 min)

1. Abra: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks
2. Clique: "Create a new hook"
3. Copie valores de: `WEBHOOK_CONFIG.txt`

### **Passo 3: Testar** (2 min)

Execute no SQL Editor:
```sql
-- Criar source de teste
INSERT INTO sources (project_id, name, type, storage_path, extracted_content, status, embeddings_status)
SELECT id, '[TESTE] ' || NOW()::TEXT, 'pdf', '/test.pdf', 'Conteúdo de teste.', 'ready', 'pending'
FROM projects LIMIT 1;

-- Aguardar 10 segundos...

-- Verificar status
SELECT name, embeddings_status, metadata->>'embeddings_chunks' as chunks
FROM sources WHERE name LIKE '[TESTE]%' ORDER BY created_at DESC LIMIT 1;
```

**Resultado esperado:**
- `embeddings_status` = `completed` ✅
- `chunks` = número > 0

**Se funcionou:** Sistema 100% automático! 🎉

---

## 🆘 Precisa de Ajuda?

### Source continua em 'pending'?

1. **Verifique edge function:**
   ```bash
   supabase functions list --project-ref bwgglfforazywrjhbxsa
   ```

2. **Teste manualmente:**
   ```bash
   curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue \
     -H "Authorization: Bearer SUA_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"max_items": 10}'
   ```

3. **Verifique webhook:**
   - Dashboard → Database → Webhooks
   - Deve aparecer: `auto-process-embeddings`

4. **Use processamento manual:**
   - Execute: `MANUAL_TEST_EMBEDDINGS.sql`

### Mais problemas?

- Ver: `SETUP_AUTOMATICO.md` → Seção Troubleshooting
- Logs: `supabase functions logs process-embeddings-queue --tail`

---

## ✅ Checklist Rápido

- [ ] Edge function deployed
- [ ] Webhook configurado
- [ ] Teste passou (pending → completed em 10s)
- [ ] (Opcional) Cron job configurado

---

## 🎉 Resultado Final

Após configuração, o fluxo será:

```
Upload PDF → Extract text (2-3s) → Status: pending
         ↓ (webhook dispara automaticamente)
Edge function processa (3-7s) → Status: completed
         ↓
Quiz usa RAG automaticamente com embeddings! ✨
```

**Sem ação do usuário! 100% automático! 🚀**

---

## 📊 Seu Projeto

- **URL:** https://bwgglfforazywrjhbxsa.supabase.co
- **Project REF:** bwgglfforazywrjhbxsa
- **Dashboard:** https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa

Pronto para começar? Execute `./COMANDOS_PRONTOS.sh` 🚀
