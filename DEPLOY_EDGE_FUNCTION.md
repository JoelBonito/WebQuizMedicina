# 🚀 Deployment Guide - New Edge Function

## ✅ What Was Implemented

A new Edge Function `generate-focused-summary` has been created and committed to the repository.

**Location:** `supabase/functions/generate-focused-summary/index.ts`

**Purpose:** Generates personalized educational summaries focused exclusively on topics where the student clicked "NÃO SEI" or rated as "Difícil".

## 📋 Deployment Steps

### Option 1: Using Supabase CLI (Recommended)

If you have Supabase CLI installed, run:

```bash
# Make sure you're logged in
supabase login

# Link to your project (if not already linked)
supabase link --project-ref tpwkthafekcmhbcxvupd

# Deploy the new function
supabase functions deploy generate-focused-summary

# Verify deployment
supabase functions list
```

### Option 2: Using Supabase Dashboard (Manual)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/tpwkthafekcmhbcxvupd
2. Navigate to **Edge Functions** in the left sidebar
3. Click **"Deploy a new function"**
4. Name: `generate-focused-summary`
5. Copy the contents of `supabase/functions/generate-focused-summary/index.ts`
6. Paste into the editor
7. Click **"Deploy function"**

**Important:** You'll also need to upload the shared dependencies:
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/gemini.ts`

### Option 3: Using GitHub Integration

If you have Supabase GitHub integration configured:

1. Push your code to the repository (already done ✅)
2. Go to Supabase Dashboard → Settings → CI/CD
3. Enable GitHub integration
4. Supabase will automatically deploy on push

## ✅ Verify Deployment

After deployment, test the function:

```bash
curl -i --location --request POST \
  'https://tpwkthafekcmhbcxvupd.supabase.co/functions/v1/generate-focused-summary' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"project_id":"YOUR_PROJECT_ID"}'
```

Expected response:
```json
{
  "success": true,
  "summary": {
    "id": "uuid",
    "titulo": "🎯 Resumo Focado nas Suas Dificuldades",
    "conteudo_html": "...",
    "topicos": ["topic1", "topic2"],
    "tipo": "personalizado"
  },
  "difficulties_count": 8,
  "top_topics": ["topic1", "topic2", "..."]
}
```

## 🔑 Required Environment Variables

Make sure the following secrets are configured in your Supabase project:

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

Or via Dashboard:
- Project Settings → Edge Functions → Secrets
- Add `GEMINI_API_KEY` with your Google Gemini API key

## 📊 Frontend Integration Status

The frontend is already integrated and ready to use this function:

✅ **DifficultiesPanel.tsx** - Button "Gerar Resumo Focado" calls the function
✅ **useSummaries.ts** - Hook `generateFocusedSummary()` makes the API call
✅ **SummaryViewer.tsx** - Displays summaries with text selection feature
✅ **ContentPanel.tsx** - Integrates SummaryViewer with chat

## 🎯 User Flow

1. Student studies with Quiz/Flashcards and clicks "NÃO SEI" multiple times
2. System accumulates difficulties in database (table: `difficulties`)
3. Student navigates to **Dashboard de Dificuldades** tab
4. Clicks **"Gerar Resumo Focado"** button (blue/purple)
5. Edge Function generates personalized summary focused on difficult topics
6. Student studies the summary
7. Can select text and click **"Perguntar ao Chat"** for clarification
8. After studying, clicks **"Gerar Quiz + Flashcards"** to practice

## ❓ Troubleshooting

### Error: "Function not found"
- The function hasn't been deployed yet. Follow deployment steps above.

### Error: "No difficulties found"
- Student needs to study with quiz/flashcards first and mark topics as "NÃO SEI"

### Error: "GEMINI_API_KEY not configured"
- Set the Gemini API key in Supabase secrets (see above)

### Timeout error
- The function uses Gemini 2.5 Pro which is slower but higher quality
- Consider reducing the number of difficulties analyzed (currently top 10)

## 📝 Notes

- This function uses **Gemini 2.5 Pro** (not Flash) for better educational content quality
- It generates structured HTML with specific pedagogical sections
- Summaries are marked with `tipo: 'personalizado'` for special UI treatment
- The function requires at least 1 unresolved difficulty to work
