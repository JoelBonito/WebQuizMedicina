# 🚀 Deploy de Correções de CORS - Edge Functions

Este guia explica como aplicar as correções de CORS nas Edge Functions do Supabase para resolver o erro:
```
Access to fetch at 'https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz'
from origin 'https://web-quiz-medicina.vercel.app' has been blocked by CORS policy
```

## 📋 O Que Foi Corrigido

### Problema 1: Barra Final no ALLOWED_ORIGIN
**Antes:**
- Variável de ambiente: `ALLOWED_ORIGIN=https://web-quiz-medicina.vercel.app/` (com `/`)
- Requisição do browser: `https://web-quiz-medicina.vercel.app` (sem `/`)
- Resultado: ❌ CORS bloqueado (match exato necessário)

**Depois:**
- Função `getAllowedOrigin()` remove automaticamente a barra final
- Resultado: ✅ CORS funciona independente de barra final

### Problema 2: OPTIONS Preflight com Status Incorreto
**Antes:**
```typescript
return new Response('ok', { headers: securityHeaders });
```
- Retornava string 'ok' sem status explícito
- Alguns browsers interpretam como status não-200

**Depois:**
```typescript
return new Response(null, {
  status: 200,
  headers: securityHeaders
});
```
- Status HTTP 200 explícito
- Body vazio (padrão para OPTIONS)

### Problema 3: Headers CORS Incompletos
**Adicionado:**
- `Access-Control-Allow-Credentials: true`
- `x-requested-with` aos headers permitidos
- Método `GET` adicionado aos permitidos

## 🔧 Como Aplicar as Correções

### Opção 1: Deploy via Supabase CLI (Recomendado)

```bash
# 1. Certifique-se de ter o Supabase CLI instalado
npm install -g supabase

# 2. Login no Supabase
supabase login

# 3. Link com seu projeto (se ainda não fez)
supabase link --project-ref bwgglfforazywrjhbxsa

# 4. Deploy TODAS as Edge Functions atualizadas
supabase functions deploy generate-quiz
supabase functions deploy generate-flashcards
supabase functions deploy generate-summary
supabase functions deploy generate-focused-summary
supabase functions deploy chat

# 5. Configurar variáveis de ambiente (IMPORTANTE!)
supabase secrets set ALLOWED_ORIGIN=https://web-quiz-medicina.vercel.app
supabase secrets set GEMINI_API_KEY=SEU_GEMINI_API_KEY_AQUI
supabase secrets set ENVIRONMENT=production
```

### Opção 2: Deploy Manual via Dashboard

**IMPORTANTE:** O deploy manual pelo dashboard não é recomendado pois você precisa copiar o código manualmente.

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions**
4. Para CADA função, clique em "..." > **Edit Function**
5. Cole o código atualizado do arquivo correspondente
6. Clique em **Deploy**

**Funções que precisam ser atualizadas:**
- ✅ `generate-quiz`
- ✅ `generate-flashcards`
- ✅ `generate-summary`
- ✅ `generate-focused-summary`
- ✅ `chat`

## ⚙️ Configurar Variáveis de Ambiente

**CRÍTICO:** As Edge Functions precisam destas variáveis de ambiente configuradas:

### Via CLI:
```bash
# Produção
supabase secrets set ALLOWED_ORIGIN=https://web-quiz-medicina.vercel.app
supabase secrets set GEMINI_API_KEY=AIzaSyDIXaLmfhpN5l2HDi0bCy6EWtRsXkJW-LE
supabase secrets set ENVIRONMENT=production
```

### Via Dashboard:
1. Vá em **Project Settings** > **Edge Functions** > **Environment Variables**
2. Adicione as variáveis:
   - `ALLOWED_ORIGIN`: `https://web-quiz-medicina.vercel.app` (SEM barra final!)
   - `GEMINI_API_KEY`: Sua chave da API do Google Gemini
   - `ENVIRONMENT`: `production`

## ✅ Verificar Se Funcionou

### Teste 1: Verificar Deploy
```bash
# Listar funções deployadas
supabase functions list

# Verificar logs de uma função
supabase functions logs generate-quiz
```

### Teste 2: Testar na Aplicação

1. Acesse https://web-quiz-medicina.vercel.app
2. Faça login
3. Selecione um projeto
4. Tente gerar um quiz
5. Abra o console do navegador (F12)
6. **Sucesso:** Sem erros de CORS, quiz gerado
7. **Falha:** Ainda vê erro de CORS? Veja Troubleshooting abaixo

### Teste 3: Verificar Headers CORS

Use o console do navegador (F12 > Network):

```javascript
// Teste direto
fetch('https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz', {
  method: 'OPTIONS',
  headers: {
    'Origin': 'https://web-quiz-medicina.vercel.app'
  }
}).then(response => {
  console.log('Status:', response.status); // Deve ser 200
  console.log('CORS Headers:', {
    'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
    'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
    'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
  });
});
```

**Resposta esperada:**
```
Status: 200
CORS Headers: {
  'Access-Control-Allow-Origin': 'https://web-quiz-medicina.vercel.app',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with'
}
```

## 🔍 Troubleshooting

### Erro persiste após deploy?

**1. Limpe o cache do browser**
```
Ctrl + Shift + Delete > Limpar cache
```

**2. Verifique as variáveis de ambiente**
```bash
# Via CLI
supabase secrets list

# Deve mostrar:
# ALLOWED_ORIGIN
# GEMINI_API_KEY
# ENVIRONMENT
```

**3. Verifique os logs das Edge Functions**
```bash
supabase functions logs generate-quiz --tail
```

**4. Teste com cURL**
```bash
# Teste OPTIONS (preflight)
curl -X OPTIONS \
  https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz \
  -H "Origin: https://web-quiz-medicina.vercel.app" \
  -v

# Deve retornar:
# < HTTP/2 200
# < access-control-allow-origin: https://web-quiz-medicina.vercel.app
# < access-control-allow-methods: POST, GET, OPTIONS
```

**5. Verifique o ALLOWED_ORIGIN no código**
```typescript
// Em security.ts, deve estar assim:
function getAllowedOrigin(): string {
  const origin = Deno.env.get('ALLOWED_ORIGIN') || '*';
  return origin === '*' ? '*' : origin.replace(/\/$/, '');
}
```

### Headers incorretos?

Se os headers CORS estão incorretos:

1. **Re-deploy** a função com `--no-verify-jwt` para debug:
   ```bash
   supabase functions deploy generate-quiz --no-verify-jwt
   ```

2. **Verifique** se importou `securityHeaders` corretamente:
   ```typescript
   import { securityHeaders } from '../_shared/security.ts';
   ```

3. **Confirme** que o OPTIONS retorna os headers:
   ```typescript
   if (req.method === 'OPTIONS') {
     return new Response(null, {
       status: 200,
       headers: securityHeaders  // ✅ DEVE usar securityHeaders
     });
   }
   ```

### Desenvolvimento Local

Para testar localmente antes de fazer deploy:

```bash
# Inicie as funções localmente
supabase functions serve

# Em outro terminal, teste
curl -X OPTIONS http://localhost:54321/functions/v1/generate-quiz \
  -H "Origin: http://localhost:5173" \
  -v
```

## 📚 Arquivos Modificados

Estes arquivos foram atualizados com as correções:

- ✅ `supabase/functions/_shared/security.ts`
- ✅ `supabase/functions/generate-quiz/index.ts`
- ✅ `supabase/functions/generate-flashcards/index.ts`
- ✅ `supabase/functions/generate-summary/index.ts`
- ✅ `supabase/functions/generate-focused-summary/index.ts`
- ✅ `supabase/functions/chat/index.ts`

## 🎯 Próximos Passos

Após aplicar as correções:

1. ✅ **Deploy** todas as Edge Functions
2. ✅ **Configure** as variáveis de ambiente
3. ✅ **Teste** a geração de quiz, flashcards e resumos
4. ✅ **Monitore** os logs para garantir que não há erros
5. ✅ **Limpe** cache do browser e CDN se necessário

---

💡 **Dica:** Se tudo estiver correto mas ainda houver problemas, pode ser cache do Cloudflare (usado pelo Vercel). Aguarde 5-10 minutos ou force a limpeza do cache no Vercel.

🔗 **Mais informações:**
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [CORS em Edge Functions](https://supabase.com/docs/guides/functions/cors)
