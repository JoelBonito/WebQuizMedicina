#!/bin/bash
# ============================================================================
# COMANDOS PRONTOS - Sistema Automático de Embeddings
# ============================================================================
# Execute estes comandos na sua máquina local
# Seus valores já estão preenchidos!
# ============================================================================

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setup Sistema Automático de Embeddings${NC}"
echo ""

# ============================================================================
# Passo 1: Deploy da Edge Function
# ============================================================================
echo -e "${YELLOW}📦 Passo 1: Deploy da Edge Function${NC}"
echo ""
echo "Execute este comando na pasta raiz do projeto:"
echo ""
echo "  supabase functions deploy process-embeddings-queue --project-ref bwgglfforazywrjhbxsa"
echo ""
echo -e "${GREEN}✅ Após o deploy, copie a URL da função que aparecerá${NC}"
echo ""

# ============================================================================
# Passo 2: Testar Edge Function
# ============================================================================
echo -e "${YELLOW}🧪 Passo 2: Testar Edge Function${NC}"
echo ""
echo "Cole este comando no terminal (substitua SUA_ANON_KEY pela chave do dashboard):"
echo ""
cat << 'EOF'
curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_items": 10}'
EOF
echo ""
echo ""
echo "Para pegar sua ANON_KEY:"
echo "  Dashboard → Settings → API → Project API keys → anon public"
echo ""
echo "Ou use a do .env.example (se ainda não trocou):"
echo "  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU"
echo ""
echo -e "${GREEN}✅ Se retornar {\"success\":true,...} está funcionando!${NC}"
echo ""

# ============================================================================
# Passo 3: Configurar Webhook (via Dashboard)
# ============================================================================
echo -e "${YELLOW}⚡ Passo 3: Configurar Webhook no Dashboard${NC}"
echo ""
echo "Abra: https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks"
echo ""
echo "Clique em 'Create a new hook' e preencha:"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Name: auto-process-embeddings"
echo "Table: public.sources"
echo "Events: ☑ INSERT, ☑ UPDATE"
echo "Type: HTTP Request"
echo "Method: POST"
echo "───────────────────────────────────────────────────────────────"
echo "URL:"
echo "  https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue"
echo "───────────────────────────────────────────────────────────────"
echo "HTTP Headers (adicionar 2):"
echo ""
echo "  Header 1:"
echo "    Name: Authorization"
echo "    Value: Bearer SUA_ANON_KEY"
echo ""
echo "  Header 2:"
echo "    Name: Content-Type"
echo "    Value: application/json"
echo "───────────────────────────────────────────────────────────────"
echo "HTTP Payload:"
cat << 'EOF'
  {
    "source_id": "{{ record.id }}",
    "max_items": 1
  }
EOF
echo "───────────────────────────────────────────────────────────────"
echo "Condition:"
cat << 'EOF'
  new.embeddings_status = 'pending'
  AND new.extracted_content IS NOT NULL
  AND new.extracted_content != ''
  AND (old.extracted_content IS NULL OR old.extracted_content = '')
EOF
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✅ Clique em 'Create webhook'${NC}"
echo ""

# ============================================================================
# Passo 4: Testar Sistema Automático
# ============================================================================
echo -e "${YELLOW}✅ Passo 4: Testar Sistema Automático${NC}"
echo ""
echo "Cole este SQL no Supabase SQL Editor:"
echo "  https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/editor"
echo ""
cat << 'EOF'
-- Criar source de teste
INSERT INTO sources (
  project_id,
  name,
  type,
  storage_path,
  extracted_content,
  status,
  embeddings_status
)
SELECT
  id,
  '[TESTE WEBHOOK] ' || NOW()::TEXT,
  'pdf',
  '/test/webhook-test.pdf',
  'Teste do webhook automático. Deve processar em 3-10 segundos.',
  'ready',
  'pending'
FROM projects
LIMIT 1;

-- Aguardar 10 segundos e verificar
SELECT
  name,
  embeddings_status,
  metadata->>'embeddings_chunks' as chunks,
  updated_at
FROM sources
WHERE name LIKE '[TESTE WEBHOOK]%'
ORDER BY created_at DESC
LIMIT 1;
EOF
echo ""
echo -e "${GREEN}✅ Se embeddings_status = 'completed' → FUNCIONOU! 🎉${NC}"
echo ""

# ============================================================================
# Passo 5: Cron Job (Opcional)
# ============================================================================
echo -e "${YELLOW}🔄 Passo 5 (Opcional): Cron Job de Backup${NC}"
echo ""
echo "Para garantir processamento a cada 5 minutos, cole no SQL Editor:"
echo ""
cat << 'EOF'
-- 1. Ativar extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar job (SUBSTITUA SUA_ANON_KEY!)
SELECT cron.schedule(
  'process-pending-embeddings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/process-embeddings-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SUA_ANON_KEY'
    ),
    body := jsonb_build_object('max_items', 10)
  );
  $$
);

-- 3. Verificar jobs ativos
SELECT * FROM cron.job;
EOF
echo ""
echo -e "${GREEN}✅ Cron job criado! Processará pendentes a cada 5 minutos${NC}"
echo ""

# ============================================================================
# Resumo
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}📋 RESUMO - O QUE FAZER:${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. Deploy edge function:"
echo "   supabase functions deploy process-embeddings-queue --project-ref bwgglfforazywrjhbxsa"
echo ""
echo "2. Testar com curl (ver comando acima)"
echo ""
echo "3. Configurar webhook no dashboard:"
echo "   https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa/database/webhooks"
echo ""
echo "4. Testar com SQL (ver query acima)"
echo ""
echo "5. (Opcional) Criar cron job (ver SQL acima)"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 Sistema ficará 100% automático!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
