# Security Policy - Web Quiz Medicina

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Camadas de Segurança Implementadas](#camadas-de-segurança-implementadas)
- [Reportar Vulnerabilidades](#reportar-vulnerabilidades)
- [Versões Suportadas](#versões-suportadas)
- [Configuração de Segurança](#configuração-de-segurança)
- [Melhores Práticas](#melhores-práticas)
- [Auditoria e Compliance](#auditoria-e-compliance)

---

## 🔒 Visão Geral

Este documento descreve as medidas de segurança implementadas na aplicação **Web Quiz Medicina** e como reportar vulnerabilidades de segurança.

**Última atualização:** 2025-11-16
**Padrões seguidos:** OWASP Top 10 2024, CWE Top 25

---

## 🛡️ Camadas de Segurança Implementadas

### 1. Autenticação e Autorização

#### ✅ Implementado

- **JWT Tokens via Supabase Auth**
  - Tokens assinados e verificados com algoritmo HS256
  - Refresh token rotation automático
  - Session management com timeout configurável (24h default)
  - Token armazenado em httpOnly cookies (quando possível)

- **Row Level Security (RLS)**
  - Todas as tabelas protegidas com políticas RLS
  - Acesso isolado por usuário (user_id)
  - Service role apenas para operações administrativas

- **Autorização de Recursos**
  - Validação de ownership em todas operações CRUD
  - Verificação em Edge Functions antes de processar
  - Exemplo: `src/shared/security.ts:authorizeResourceAccess()`

#### 📍 Localização no Código

```typescript
// Edge Functions: supabase/functions/_shared/security.ts
export async function authenticateRequest(req: Request) { ... }
export async function authorizeResourceAccess(...) { ... }
```

---

### 2. Validação e Sanitização de Input

#### ✅ Implementado

- **Validação de Input com Zod**
  - Schemas definidos para todas as APIs
  - Validação de tipos, formatos e ranges
  - Prevenção de SQL Injection via prepared statements
  - Localização: `supabase/functions/_shared/validation.ts`

- **Sanitização XSS com DOMPurify**
  - Sanitização de HTML user-generated content
  - Remoção de scripts, iframes e event handlers
  - Configurações por contexto (strict, default, rich)
  - Localização: `src/lib/sanitize.ts`

- **Validação de URLs**
  - Bloqueio de protocolos perigosos (javascript:, data:, vbscript:)
  - Whitelist de protocolos permitidos (https, http, mailto, tel)

- **Validação de Filenames**
  - Prevenção de path traversal (../)
  - Sanitização de caracteres especiais
  - Limite de comprimento (255 chars)

#### 📍 Exemplos de Uso

```typescript
// Backend (Edge Functions)
import { validateRequest, generateQuizSchema } from '../_shared/validation.ts';
const data = await validateRequest(req, generateQuizSchema);

// Frontend
import { sanitizeHtml, sanitizeUrl } from '@/lib/sanitize';
const safeHtml = sanitizeHtml(userInput);
const safeUrl = sanitizeUrl(userProvidedUrl);
```

---

### 3. Segurança de API (Edge Functions)

#### ✅ Implementado

- **Rate Limiting**
  - Implementação in-memory (trocar por Redis em produção)
  - Limites por endpoint e tipo de operação:
    - AI Generation: 10 req/min por usuário
    - Chat: 30 req/min por usuário
    - Read operations: 100 req/min por usuário
    - Auth: 5 req/min por IP
  - Headers de rate limit: `X-RateLimit-Remaining`, `Retry-After`
  - Localização: `supabase/functions/_shared/security.ts`

- **CORS Restritivo**
  - Whitelist de origens permitidas
  - Configurável via variável de ambiente `ALLOWED_ORIGIN`
  - Default development: `localhost:3000`, `localhost:5173`
  - Production: configurar domínio específico
  - Localização: `supabase/functions/_shared/cors.ts`

- **Request Signing (HMAC)**
  - Disponível para APIs críticas
  - Verificação de integridade de requests
  - Algoritmo: HMAC-SHA256

#### 📍 Configuração

```bash
# .env ou Supabase Secrets
ALLOWED_ORIGIN=https://seu-dominio.com
HMAC_SECRET=your-secret-here
```

---

### 4. Proteção de Dados

#### ✅ Implementado

- **Encryption at Rest**
  - Banco de dados Supabase com criptografia nativa
  - Storage de arquivos criptografado (AES-256)
  - Secrets gerenciados via Supabase Secrets

- **HTTPS Only**
  - HSTS header com preload
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - Redirecionamento HTTP → HTTPS automático

- **Password Hashing**
  - Bcrypt via Supabase Auth (cost factor 10)
  - Nunca armazenamos senhas em plain text

- **Environment Variables**
  - Secrets NUNCA hardcoded no código
  - Uso de `.env` para desenvolvimento
  - Supabase Secrets para produção
  - `.env.example` documentado sem valores reais

#### ⚠️ Secrets Management

```bash
# Configurar secrets em produção
supabase secrets set GEMINI_API_KEY=your_key_here
supabase secrets set ALLOWED_ORIGIN=https://seu-dominio.com

# Nunca commitar .env
# Sempre usar .env.example como template
```

---

### 5. Headers de Segurança

#### ✅ Headers Implementados

Todos os headers estão em: `supabase/functions/_shared/security.ts`

```typescript
{
  // Prevent MIME sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // XSS Protection (legacy)
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy (disable unused features)
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',

  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
  ].join('; '),

  // HSTS (production only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}
```

#### 🔍 Validação

Teste headers com: https://securityheaders.com/

---

### 6. Logging e Monitoramento

#### ✅ Implementado

- **Audit Logging System**
  - Tabela `audit_logs` para rastreamento de ações
  - Eventos auditados:
    - Autenticação (login, logout, falhas)
    - Operações de dados (CRUD)
    - Geração de IA (custo estimado)
    - Eventos de segurança (rate limit, acesso não autorizado)
  - Localização: `supabase/functions/_shared/audit.ts`

- **Event Types Rastreados**
  ```typescript
  enum AuditEventType {
    AUTH_LOGIN, AUTH_FAILED_LOGIN,
    DATA_CREATE, DATA_UPDATE, DATA_DELETE,
    AI_QUIZ_GENERATED, AI_CHAT_MESSAGE,
    SECURITY_RATE_LIMIT_EXCEEDED,
    SECURITY_UNAUTHORIZED_ACCESS,
  }
  ```

- **Severity Levels**
  - INFO: Operações normais
  - WARNING: Eventos suspeitos (3+ failed logins)
  - ERROR: Erros de aplicação
  - CRITICAL: Violações de segurança

- **Retenção de Dados**
  - Logs INFO/WARNING: 90 dias
  - Logs ERROR/CRITICAL: 365 dias
  - Cleanup automático via função SQL

#### 📍 Uso

```typescript
import { getAuditLogger, AuditEventType } from '../_shared/audit.ts';

const audit = getAuditLogger();
await audit.logSecurity(
  AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
  req,
  userId,
  { endpoint: 'generate-quiz' }
);
```

#### 🔍 Monitoramento

```sql
-- Ver falhas de login suspeitas
SELECT * FROM security_failed_logins;

-- Ver custos de IA por usuário
SELECT * FROM ai_generation_stats WHERE generation_date > NOW() - INTERVAL '7 days';

-- Bloquear IP suspeito
SELECT is_ip_blocked('192.168.1.1');
```

---

### 7. Gestão de Dependências

#### ✅ Implementado

- **Dependabot**
  - Configuração: `.github/dependabot.yml`
  - Verificação semanal de vulnerabilidades
  - Auto-update de patches de segurança
  - Agrupamento de updates por tipo

- **NPM Audit**
  - Scripts de auditoria: `npm run security:audit`
  - CI/CD checks em todas PRs
  - Limite de severidade: `moderate`

- **GitHub Actions**
  - Workflow de segurança: `.github/workflows/security.yml`
  - Scans inclusos:
    - NPM Audit
    - CodeQL (SAST)
    - Dependency Review
    - Secret Scanning (TruffleHog)
    - OWASP Dependency Check
    - Custom security tests

#### 🔧 Comandos

```bash
# Auditar dependências
npm run security:audit

# Corrigir vulnerabilidades automaticamente
npm run security:fix

# Verificar apenas moderate+
npm run security:check
```

---

## 🚨 Reportar Vulnerabilidades

### Processo de Reporte

1. **NÃO crie issues públicas** para vulnerabilidades de segurança
2. Envie email para: **joel.bonito@example.com** (substituir com email real)
3. Inclua:
   - Descrição da vulnerabilidade
   - Steps to reproduce
   - Impacto potencial
   - Sugestões de correção (opcional)
   - Seu nome/handle para créditos (opcional)

### O que esperar

- **Confirmação:** 24-48 horas
- **Análise inicial:** 3-5 dias
- **Fix e deploy:** 7-14 dias (dependendo da severidade)
- **Divulgação pública:** Após fix implantado + 30 dias

### Recompensas

Este projeto é open-source e educacional. Reconhecimento público será dado a pesquisadores de segurança que reportarem vulnerabilidades responsavelmente.

---

## ✅ Versões Suportadas

| Versão | Suportada | Notas                          |
|--------|-----------|--------------------------------|
| main   | ✅        | Branch principal               |
| develop| ✅        | Development branch             |
| < v1.0 | ❌        | Versões antigas não suportadas |

---

## ⚙️ Configuração de Segurança

### Variáveis de Ambiente

```bash
# .env (development)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyXXX...

# Supabase Secrets (production)
GEMINI_API_KEY=your_gemini_key
ALLOWED_ORIGIN=https://seu-dominio.com
ENVIRONMENT=production
```

### Supabase RLS

Execute migrations na ordem:
```bash
supabase db push 001_initial_schema.sql
supabase db push 002_storage_setup.sql
supabase db push 003_security_audit_logs.sql
```

### Edge Functions

```bash
# Deploy com secrets configurados
supabase functions deploy generate-quiz
supabase functions deploy chat
# ... outras functions
```

---

## 📚 Melhores Práticas

### Para Desenvolvedores

1. **Nunca commitar secrets**
   - Use `.env` local
   - Adicione `.env` no `.gitignore`
   - Use `.env.example` como template

2. **Sempre validar input**
   - Use Zod schemas em Edge Functions
   - Sanitize com DOMPurify no frontend
   - Nunca confie em dados do cliente

3. **Sanitizar output**
   - Use `sanitizeHtml()` antes de `dangerouslySetInnerHTML`
   - Escape caracteres especiais em SQL queries
   - Valide URLs antes de redirecionamentos

4. **Testar segurança**
   - Execute `npm run security:check` antes de commits
   - Teste com inputs maliciosos
   - Verifique headers com SecurityHeaders.com

5. **Code Review**
   - Revisar mudanças em autenticação
   - Verificar novos endpoints de API
   - Validar configurações de CORS/CSP

### Para Deploy

1. **Configurar CORS restritivo**
   ```bash
   supabase secrets set ALLOWED_ORIGIN=https://seu-dominio.com
   ```

2. **Habilitar HTTPS only**
   - Configure Cloudflare/AWS com SSL
   - Ative HSTS
   - Redirecione HTTP → HTTPS

3. **Monitorar logs**
   - Configure alertas para eventos críticos
   - Revise `audit_logs` regularmente
   - Monitor failed login attempts

4. **Rate limiting em produção**
   - Use Redis para rate limiting distribuído
   - Configure limites por tier de usuário
   - Implemente IP blocking para abuse

---

## 🔍 Auditoria e Compliance

### OWASP Top 10 2024 - Status

| Categoria | Status | Mitigação |
|-----------|--------|-----------|
| A01:2024 – Broken Access Control | ✅ | RLS, Authorization checks |
| A02:2024 – Cryptographic Failures | ✅ | Encryption at rest, HTTPS, bcrypt |
| A03:2024 – Injection | ✅ | Zod validation, DOMPurify, prepared statements |
| A04:2024 – Insecure Design | ✅ | Security by design, threat modeling |
| A05:2024 – Security Misconfiguration | ✅ | Security headers, CORS, CSP |
| A06:2024 – Vulnerable Components | ✅ | Dependabot, npm audit, CodeQL |
| A07:2024 – Auth Failures | ✅ | Supabase Auth, rate limiting, audit logs |
| A08:2024 – Data Integrity Failures | ✅ | HMAC signing, RLS policies |
| A09:2024 – Logging Failures | ✅ | Audit system, comprehensive logging |
| A10:2024 – SSRF | ⚠️ | URL validation (implementar whitelist completo) |

### CWE Top 25 - Cobertura

- ✅ CWE-79: XSS → DOMPurify
- ✅ CWE-89: SQL Injection → Prepared statements, Zod
- ✅ CWE-20: Input Validation → Zod schemas
- ✅ CWE-22: Path Traversal → Filename sanitization
- ✅ CWE-352: CSRF → SameSite cookies, tokens
- ✅ CWE-287: Authentication → Supabase Auth, JWT
- ✅ CWE-190: Integer Overflow → Zod min/max validation
- ⚠️ CWE-918: SSRF → Partial (adicionar whitelist de domains)

---

## 📞 Contato

- **Security Issues:** joel.bonito@example.com (privado)
- **Geral:** [GitHub Issues](https://github.com/JoelBonito/WebQuizMedicina/issues)
- **Documentação:** [README.md](./README.md)

---

## 📝 Changelog de Segurança

### 2025-11-16 - Implementação Inicial

- ✅ Sistema de validação com Zod
- ✅ Sanitização XSS com DOMPurify
- ✅ Rate limiting em Edge Functions
- ✅ Audit logging system
- ✅ Security headers (HSTS, CSP, etc)
- ✅ CORS restritivo
- ✅ Dependabot configurado
- ✅ GitHub Actions security workflows
- ✅ Migration para audit_logs

---

**Este documento é atualizado regularmente. Última revisão: 2025-11-16**
