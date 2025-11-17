#!/bin/bash

# Script para deploy das Edge Functions com correções de CORS
# Execute: bash deploy-functions.sh

echo "🚀 Deploy de Edge Functions - Correção de CORS"
echo "=============================================="
echo ""

PROJECT_REF="bwgglfforazywrjhbxsa"

echo "📦 Funções a serem deployadas:"
echo "  - generate-quiz"
echo "  - generate-flashcards"
echo "  - generate-summary"
echo "  - generate-focused-summary"
echo "  - chat"
echo ""

# Verificar se está no diretório correto
if [ ! -d "supabase/functions" ]; then
    echo "❌ Erro: Execute este script na raiz do projeto WebQuizMedicina"
    exit 1
fi

echo "🔐 Fazendo login no Supabase..."
npx supabase login

if [ $? -ne 0 ]; then
    echo "❌ Login falhou. Verifique suas credenciais."
    exit 1
fi

echo ""
echo "🚀 Iniciando deploy..."
echo ""

# Deploy de cada função
FUNCTIONS=(
    "generate-quiz"
    "generate-flashcards"
    "generate-summary"
    "generate-focused-summary"
    "chat"
)

SUCCESS_COUNT=0
FAILED_COUNT=0

for func in "${FUNCTIONS[@]}"; do
    echo "📤 Deployando $func..."
    npx supabase functions deploy "$func" --project-ref "$PROJECT_REF"

    if [ $? -eq 0 ]; then
        echo "✅ $func deployado com sucesso!"
        ((SUCCESS_COUNT++))
    else
        echo "❌ Falha ao deployar $func"
        ((FAILED_COUNT++))
    fi
    echo ""
done

echo "=============================================="
echo "📊 Resumo do Deploy:"
echo "  ✅ Sucesso: $SUCCESS_COUNT"
echo "  ❌ Falhas: $FAILED_COUNT"
echo ""

if [ $FAILED_COUNT -eq 0 ]; then
    echo "🎉 Todas as funções foram deployadas com sucesso!"
    echo ""
    echo "🧪 Teste agora no console do navegador (F12):"
    echo ""
    echo "fetch('https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz', {"
    echo "  method: 'OPTIONS',"
    echo "  headers: { 'Origin': 'https://web-quiz-medicina.vercel.app' }"
    echo "}).then(r => console.log('Status:', r.status, 'CORS:', r.headers.get('access-control-allow-origin')))"
    echo ""
    echo "Resultado esperado: Status: 200 CORS: https://web-quiz-medicina.vercel.app"
else
    echo "⚠️  Algumas funções falharam. Verifique os erros acima."
fi

echo ""
