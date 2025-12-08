# Vercel API Routes - Setup Guide

## 📋 Visão Geral

Migração da geração de resumos (generate-summary) do Supabase Edge Functions para Vercel Serverless Functions.

**Por que migrar?**
- ✅ Sem limites de timeout (60s → 300s)
- ✅ Mais memória disponível (128MB → 1024MB)
- ✅ API key segura no backend
- ✅ Mesma infraestrutura do frontend (Vercel)
- ✅ Deploy automático com git push

---

## 🚀 Configuração Inicial

### 1. Instalar Dependências

Adicione ao `package.json`:

```bash
npm install @vercel/node @supabase/supabase-js
```

**Nota:** Se já tiver `@supabase/supabase-js` instalado, não precisa reinstalar.

### 2. Configurar Variáveis de Ambiente no Vercel

#### Via Dashboard (Recomendado):

1. Acesse: https://vercel.com/seu-usuario/web-quiz-medicina/settings/environment-variables

2. Adicione as seguintes variáveis:

| Nome | Valor | Ambiente |
|------|-------|----------|
| `GEMINI_API_KEY` | `sua-chave-gemini-aqui` | Production, Preview, Development |
| `VITE_SUPABASE_URL` | `https://bwgglfforazywrjhbxsa.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `sua-anon-key` | Production, Preview, Development |

#### Via CLI:

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Adicionar variáveis
vercel env add GEMINI_API_KEY
# Cole sua chave quando solicitado
# Selecione: Production, Preview, Development

vercel env add VITE_SUPABASE_URL
# Cole: https://bwgglfforazywrjhbxsa.supabase.co

vercel env add VITE_SUPABASE_ANON_KEY
# Cole sua anon key do Supabase
```

### 3. Obter Gemini API Key

1. Acesse: https://makersuite.google.com/app/apikey
2. Clique em "Create API Key"
3. Copie a chave gerada
4. **⚠️ NUNCA commite esta chave no código!**

---

## 📁 Estrutura de Arquivos Criada

```
WebQuizMedicina/
├── api/
│   ├── lib/
│   │   ├── gemini.ts           # Cliente Gemini API
│   │   └── sanitization.ts     # Segurança XSS
│   └── generate-summary.ts     # API route principal
├── src/
│   └── hooks/
│       └── useSummaries.ts     # ✅ Atualizado para usar /api
└── vercel.json                  # ✅ Configurações de deploy
```

---

## 🔧 Como Funciona

### Fluxo de Execução:

```
1. User clica "Gerar Resumo"
   ↓
2. Frontend chama /api/generate-summary
   ↓
3. Vercel Function autentica via Supabase
   ↓
4. Busca sources do banco de dados
   ↓
5. Chama Gemini API (key no backend, segura)
   ↓
6. Processa resposta (SINGLE ou BATCHED)
   ↓
7. Sanitiza HTML (XSS protection)
   ↓
8. Salva no Supabase
   ↓
9. Retorna resultado ao frontend
```

### Estratégias de Geração:

- **SINGLE** (< 300k chars): Um único prompt consolidado
- **BATCHED** (≥ 300k chars): Seções paralelas + consolidação final

---

## 🧪 Testando Localmente

### 1. Configurar `.env` local:

```bash
# Copie o .env.example
cp .env.example .env

# Adicione sua GEMINI_API_KEY
# Edite o arquivo .env e adicione:
GEMINI_API_KEY=sua-chave-aqui
```

### 2. Instalar Vercel CLI (se ainda não tiver):

```bash
npm i -g vercel
```

### 3. Baixar variáveis de ambiente do Vercel:

```bash
vercel env pull .env.local
```

### 4. Rodar em desenvolvimento:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Vercel Functions (se necessário testar localmente)
vercel dev
```

### 5. Testar geração de resumo:

1. Abra http://localhost:5173
2. Faça login
3. Crie/abra um projeto
4. Faça upload de uma fonte
5. Clique em "Gerar Resumo"

**Logs:**
- Frontend: Console do browser (F12)
- Backend: Terminal onde rodou `vercel dev`

---

## 🚢 Deploy para Produção

### Deploy Automático (Git Push):

```bash
git add .
git commit -m "feat: Migrate generate-summary to Vercel API"
git push origin sua-branch
```

Vercel vai:
1. Detectar mudanças em `/api`
2. Buildar as Serverless Functions
3. Fazer deploy automático
4. Usar as variáveis de ambiente configuradas

### Deploy Manual:

```bash
vercel --prod
```

### Verificar Deploy:

1. Acesse: https://vercel.com/seu-usuario/web-quiz-medicina/deployments
2. Clique no último deploy
3. Verifique "Functions" tab
4. Deve aparecer: `api/generate-summary.ts` ✅

---

## 📊 Limites e Capacidade

### Vercel Hobby (Grátis):

| Recurso | Limite |
|---------|--------|
| Timeout | 10s (mas podemos usar Pro: 300s) |
| Memória | 1024 MB |
| Invocações/dia | 100,000 |
| Bandwidth | 100 GB/mês |

### Vercel Pro ($20/mês):

| Recurso | Limite |
|---------|--------|
| Timeout | **300s** ← Ideal para resumos grandes |
| Memória | 3008 MB |
| Invocações/dia | 1,000,000 |
| Bandwidth | 1 TB/mês |

**Recomendação:**
- Hobby: OK para testes e MVP
- Pro: Necessário para produção com resumos grandes (BATCHED strategy)

---

## 🐛 Troubleshooting

### Erro: "GEMINI_API_KEY not configured"

**Causa:** Variável de ambiente não configurada no Vercel

**Solução:**
```bash
vercel env add GEMINI_API_KEY
# Cole sua chave
# Redeploy: vercel --prod
```

### Erro: "Unauthorized" (401)

**Causa:** Token de autenticação inválido ou expirado

**Solução:**
1. Faça logout e login novamente
2. Verifique se VITE_SUPABASE_* estão corretas
3. Teste autenticação: `supabase auth debug`

### Erro: "Function timeout" (504)

**Causa:** Resumo muito grande ultrapassou 10s (Hobby plan)

**Solução:**
1. Upgrade para Vercel Pro ($20/mês)
2. Ou: Reduza o tamanho do conteúdo fonte
3. Ou: Use menos sources por vez

### Erro: CORS

**Causa:** Origin não permitido

**Solução:**
- Adicione seu domínio em `ALLOWED_ORIGINS` no `api/generate-summary.ts`:
```typescript
const ALLOWED_ORIGINS = [
  'https://web-quiz-medicina.vercel.app',
  'https://seu-dominio-custom.com', // ← Adicione aqui
  'http://localhost:5173',
];
```

---

## 🔒 Segurança

### ✅ Implementado:

- API key no backend (nunca exposta ao browser)
- Autenticação via Supabase JWT
- Sanitização de HTML (XSS prevention)
- CORS restrito a origins específicos
- Rate limiting via Supabase RLS

### 🔜 Próximos passos:

- Rate limiting no Vercel (via middleware)
- Monitoring com Sentry
- Logs estruturados com Winston

---

## 📈 Monitoramento

### Vercel Analytics:

1. Acesse: https://vercel.com/seu-usuario/web-quiz-medicina/analytics
2. Veja:
   - Invocações/hora
   - Duração média
   - Erros (4xx/5xx)
   - Bandwidth usado

### Gemini API Quota:

1. Acesse: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
2. Monitore:
   - Requests per day
   - Tokens per minute
   - Custo estimado

---

## 💰 Custos Estimados

### Gemini API (Flash 2.0):

- Input: $0.075 / 1M tokens
- Output: $0.30 / 1M tokens
- Cache hit: 75% desconto

**Exemplo:**
- 100 resumos/dia
- 50k tokens input + 10k tokens output cada
- Custo: ~$4.50/mês

### Vercel:

- Hobby: $0 (até 100k invocações)
- Pro: $20/mês (necessário para resumos grandes)

**Total estimado:** $20-25/mês (com Vercel Pro)

---

## 📚 Próximas Migrações

Depois de testar generate-summary com sucesso, migrar:

1. ✅ generate-summary (completo)
2. ⏳ generate-quiz
3. ⏳ generate-flashcards
4. ⏳ generate-focused-summary
5. ⏳ chat

---

## 🆘 Suporte

**Problemas?**
1. Verifique logs no Vercel Dashboard
2. Teste localmente com `vercel dev`
3. Revise este documento
4. Abra issue no GitHub

**Contato:**
- GitHub Issues: https://github.com/JoelBonito/WebQuizMedicina/issues
- Vercel Docs: https://vercel.com/docs/functions
