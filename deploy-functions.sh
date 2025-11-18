#!/bin/bash
# ============================================================================
# DEPLOY EDGE FUNCTIONS - WebQuizMedicina
# ============================================================================
# Este script faz deploy das edge functions atualizadas para o Supabase
# ============================================================================

set -e  # Exit on error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploy Edge Functions - WebQuizMedicina${NC}"
echo ""

# Project ref
PROJECT_REF="bwgglfforazywrjhbxsa"

# ============================================================================
# Verificar Supabase CLI
# ============================================================================
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI não encontrado!${NC}"
    echo ""
    echo "Instale o Supabase CLI primeiro:"
    echo ""
    echo "  # macOS"
    echo "  brew install supabase/tap/supabase"
    echo ""
    echo "  # Linux"
    echo "  brew install supabase/tap/supabase"
    echo ""
    echo "  # Windows (PowerShell)"
    echo "  scoop install supabase"
    echo ""
    echo "  # Ou via npm"
    echo "  npm install -g supabase"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI encontrado: $(supabase --version)${NC}"
echo ""

# ============================================================================
# Verificar se está na pasta correta
# ============================================================================
if [ ! -d "supabase/functions" ]; then
    echo -e "${RED}❌ Erro: Pasta supabase/functions não encontrada!${NC}"
    echo "Execute este script na raiz do projeto WebQuizMedicina"
    exit 1
fi

echo -e "${GREEN}✅ Pasta supabase/functions encontrada${NC}"
echo ""

# ============================================================================
# Link com projeto (se necessário)
# ============================================================================
echo -e "${YELLOW}🔗 Verificando link com projeto...${NC}"

if ! supabase projects list 2>/dev/null | grep -q "$PROJECT_REF"; then
    echo -e "${YELLOW}⚠️ Projeto não linkado. Fazendo link...${NC}"
    supabase link --project-ref "$PROJECT_REF"
else
    echo -e "${GREEN}✅ Projeto já linkado${NC}"
fi
echo ""

# ============================================================================
# Deploy Edge Functions
# ============================================================================
echo -e "${YELLOW}📦 Fazendo deploy das edge functions com correções...${NC}"
echo ""

# Deploy generate-quiz (com correção de JSON truncado)
echo -e "${YELLOW}[1/3] Deploying: generate-quiz${NC}"
if supabase functions deploy generate-quiz --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}✅ generate-quiz deployed com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro ao fazer deploy de generate-quiz${NC}"
    exit 1
fi
echo ""

# Deploy generate-flashcards (com correção de JSON truncado)
echo -e "${YELLOW}[2/3] Deploying: generate-flashcards${NC}"
if supabase functions deploy generate-flashcards --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}✅ generate-flashcards deployed com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro ao fazer deploy de generate-flashcards${NC}"
    exit 1
fi
echo ""

# Deploy chat (com correção de schema)
echo -e "${YELLOW}[3/3] Deploying: chat${NC}"
if supabase functions deploy chat --project-ref "$PROJECT_REF"; then
    echo -e "${GREEN}✅ chat deployed com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro ao fazer deploy de chat${NC}"
    exit 1
fi
echo ""

# ============================================================================
# Resumo
# ============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 Deploy concluído com sucesso!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "✅ Correções aplicadas em TODAS as funções:"
echo ""
echo "   📝 generate-quiz:"
echo "      • Auto-recuperação de JSON truncado"
echo "      • Batches menores (12 questões)"
echo "      • Chunks otimizados (8 ao invés de 15)"
echo "      • Limite de contexto para evitar MAX_TOKENS"
echo ""
echo "   📇 generate-flashcards:"
echo "      • Auto-detecção de array key"
echo "      • Batches menores (18 flashcards)"
echo "      • Chunks otimizados (8 ao invés de 15)"
echo "      • Limite de contexto para evitar MAX_TOKENS"
echo ""
echo "   💬 chat:"
echo "      • Schema correto (role + content)"
echo "      • Chunks otimizados (6 ao invés de 10)"
echo "      • Histórico de conversação funcional"
echo ""
echo "🔗 URLs das funções:"
echo "   https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz"
echo "   https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-flashcards"
echo "   https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/chat"
echo ""
echo "🧪 Agora você pode testar todas as funcionalidades no aplicativo!"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
