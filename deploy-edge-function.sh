#!/bin/bash

# Script to deploy the new generate-focused-summary Edge Function
# Run this after installing and configuring Supabase CLI

set -e

echo "🚀 Deploying generate-focused-summary Edge Function..."
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "Please install it first:"
    echo "  brew install supabase/tap/supabase  # macOS"
    echo "  scoop install supabase              # Windows"
    echo "  # or see: https://supabase.com/docs/guides/cli"
    echo ""
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Not logged in to Supabase"
    echo "Running: supabase login"
    supabase login
fi

echo "✅ Authenticated"
echo ""

# Deploy the function
echo "📦 Deploying generate-focused-summary..."
supabase functions deploy generate-focused-summary --project-ref tpwkthafekcmhbcxvupd

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Verify in dashboard: https://supabase.com/dashboard/project/tpwkthafekcmhbcxvupd/functions"
echo "  2. Test in app: Go to Dificuldades tab → Click 'Gerar Resumo Focado'"
echo "  3. Check logs: supabase functions logs generate-focused-summary"
echo ""
