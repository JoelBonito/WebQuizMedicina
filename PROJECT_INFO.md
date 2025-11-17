# 📋 Informações do Projeto - Web Quiz Medicina

## 🔗 Links e Recursos

### GitHub
- **Repositório:** [JoelBonito/WebQuizMedicina](https://github.com/JoelBonito/WebQuizMedicina)
- **Branch Principal:** `main`
- **Branch de Desenvolvimento:** `develop`
- **Tecnologias:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn/UI

### Supabase
- **Nome do Projeto:** WebQuizMedicina
- **Project ID:** `bwgglfforazywrjhbxsa`
- **Região:** `sa-east-1` (São Paulo, Brasil)
- **Status:** ✅ ACTIVE_HEALTHY
- **Database:** PostgreSQL 17
- **URL Base:** https://bwgglfforazywrjhbxsa.supabase.co

**Credenciais Públicas:**
```bash
VITE_SUPABASE_URL=https://bwgglfforazywrjhbxsa.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU
```

**Dashboard:** https://supabase.com/dashboard/project/bwgglfforazywrjhbxsa

**Endpoints das Edge Functions:**
- Base URL: `https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/`
- `generate-quiz`
- `generate-flashcards`
- `generate-summary`
- `generate-focused-summary`
- `chat`

### Vercel (Deploy)
- **Projeto:** web-quiz-medicina
- **URL de Produção:** [A ser configurada]
- **Framework:** Vite (React)
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

---

## ⚙️ Configuração Inicial

### 1. Clone do Repositório
```bash
git clone https://github.com/JoelBonito/WebQuizMedicina.git
cd WebQuizMedicina
```

### 2. Instalação de Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
```bash
# Copiar .env.example para .env
cp .env.example .env

# O arquivo .env já vem pré-configurado com as credenciais do Supabase
# Você só precisa adicionar a GEMINI_API_KEY
```

Edite `.env` e adicione sua chave do Gemini:
```bash
GEMINI_API_KEY=sua_chave_aqui
```

Obtenha a chave em: https://makersuite.google.com/app/apikey

### 4. Executar Migrations do Supabase

No Supabase Dashboard > SQL Editor, execute em ordem:

```sql
-- 1. Schema inicial
-- Execute: supabase/migrations/001_initial_schema.sql

-- 2. Storage setup
-- Execute: supabase/migrations/002_storage_setup.sql

-- 3. Security & Audit Logs
-- Execute: supabase/migrations/003_security_audit_logs.sql
```

### 5. Configurar Secrets do Supabase

```bash
# Instalar Supabase CLI
brew install supabase/tap/supabase  # macOS
# ou
scoop install supabase              # Windows

# Login
supabase login

# Link com o projeto
supabase link --project-ref bwgglfforazywrjhbxsa

# Configurar secrets
supabase secrets set GEMINI_API_KEY=sua_chave_gemini
supabase secrets set ALLOWED_ORIGIN=https://seu-dominio-vercel.app
supabase secrets set ENVIRONMENT=production
```

### 6. Deploy das Edge Functions

```bash
# Deploy individual
supabase functions deploy generate-quiz --project-ref bwgglfforazywrjhbxsa
supabase functions deploy generate-flashcards --project-ref bwgglfforazywrjhbxsa
supabase functions deploy generate-summary --project-ref bwgglfforazywrjhbxsa
supabase functions deploy generate-focused-summary --project-ref bwgglfforazywrjhbxsa
supabase functions deploy chat --project-ref bwgglfforazywrjhbxsa

# Ou usar o script
./deploy-edge-function.sh
```

### 7. Rodar Localmente

```bash
npm run dev
```

Acesse: http://localhost:5173

---

## 🚀 Deploy em Produção (Vercel)

### Pré-requisitos
- Conta no Vercel
- Projeto conectado ao GitHub

### Passos

1. **Conectar Repositório**
   - Acesse: https://vercel.com/new
   - Importe o repositório: `JoelBonito/WebQuizMedicina`
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

2. **Configurar Environment Variables**
   ```
   VITE_SUPABASE_URL=https://bwgglfforazywrjhbxsa.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU
   ```

3. **Deploy**
   - Click "Deploy"
   - Aguardar build e deploy
   - Copiar URL de produção

4. **Configurar CORS no Supabase**
   ```bash
   # Atualizar ALLOWED_ORIGIN com a URL do Vercel
   supabase secrets set ALLOWED_ORIGIN=https://seu-app.vercel.app
   ```

5. **Redeployar Edge Functions**
   ```bash
   # Necessário para aplicar novo ALLOWED_ORIGIN
   supabase functions deploy generate-quiz --project-ref bwgglfforazywrjhbxsa
   # ... repetir para todas as functions
   ```

---

## 📊 Estrutura do Banco de Dados

### Tabelas Principais
- `projects` - Projetos de estudo
- `sources` - Fontes (PDFs, áudios, textos)
- `questions` - Perguntas de quiz
- `flashcards` - Flashcards para repetição espaçada
- `summaries` - Resumos gerados
- `difficulties` - Dificuldades do aluno (sistema "NÃO SEI")
- `progress` - Progresso em quiz/flashcards
- `chat_messages` - Histórico de chat com IA
- `audit_logs` - Logs de auditoria de segurança

### Storage Buckets
- `project-sources` - Arquivos enviados pelos usuários (privado)

---

## 🔒 Segurança

### Secrets Necessários (Supabase)
```bash
GEMINI_API_KEY=xxx           # API key do Google Gemini
ALLOWED_ORIGIN=https://...   # Domínio permitido para CORS
ENVIRONMENT=production        # Ambiente (development/production)
```

### Configurações de Segurança
- ✅ RLS (Row Level Security) habilitado em todas as tabelas
- ✅ CORS restritivo (configurar ALLOWED_ORIGIN)
- ✅ Rate limiting nas Edge Functions
- ✅ Audit logging completo
- ✅ Headers de segurança (CSP, HSTS, etc)
- ✅ Validação de input com Zod
- ✅ Sanitização XSS com DOMPurify

Ver: `SECURITY.md` para documentação completa

---

## 🧪 Testes

### Testes de Segurança
```bash
npm test                    # Rodar todos os testes
npm run security:check      # Verificar vulnerabilidades
npm run security:audit      # NPM audit completo
```

### Testes Manuais
```bash
# Testar Edge Function
curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"uuid","count":5}'
```

---

## 📖 Documentação

- **README.md** - Visão geral e setup
- **SECURITY.md** - Política de segurança completa
- **SECURITY_IMPLEMENTATION_GUIDE.md** - Guia de implementação de segurança
- **DEPLOY_EDGE_FUNCTION.md** - Deploy de Edge Functions
- **IMPLEMENTATION_STATUS.md** - Status de implementação
- **PROJECT_INFO.md** - Este arquivo

---

## 🆘 Troubleshooting

### Problema: Edge Functions não funcionando
**Solução:**
1. Verificar se GEMINI_API_KEY está configurada
2. Verificar logs: `supabase functions logs nome-da-function`
3. Verificar CORS (ALLOWED_ORIGIN)

### Problema: CORS Error no frontend
**Solução:**
```bash
# Configurar origem permitida
supabase secrets set ALLOWED_ORIGIN=https://seu-dominio.vercel.app

# Redeployar functions
supabase functions deploy generate-quiz --project-ref bwgglfforazywrjhbxsa
```

### Problema: Rate Limit Error
**Solução:**
- Aguardar reset (1 minuto)
- Ajustar limites em `supabase/functions/_shared/security.ts`

### Problema: Database RLS Error
**Solução:**
1. Verificar se migrations foram executadas
2. Verificar se usuário está autenticado
3. Verificar políticas RLS no Supabase Dashboard

---

## 📞 Suporte e Contato

- **Issues:** https://github.com/JoelBonito/WebQuizMedicina/issues
- **Security:** Ver SECURITY.md para reportar vulnerabilidades
- **Autor:** Joel Bonito - [GitHub](https://github.com/JoelBonito)

---

**Última atualização:** 2025-11-16
**Versão:** 1.0.0 (8 Fases Completas)
