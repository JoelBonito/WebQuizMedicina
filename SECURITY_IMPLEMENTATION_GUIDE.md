# Guia de Implementação de Segurança - Web Quiz Medicina

## 📋 Visão Geral

Este guia mostra **como aplicar todas as camadas de segurança implementadas** nas Edge Functions existentes e em novos componentes frontend.

**Status:** As ferramentas de segurança foram criadas. Agora precisam ser aplicadas em todas as Edge Functions.

---

## 🚀 Etapas de Implementação

### Etapa 1: Atualizar Dependências

```bash
# Instalar novas dependências de segurança
npm install

# Verificar vulnerabilidades
npm run security:audit

# Corrigir automaticamente (quando possível)
npm run security:fix
```

### Etapa 2: Executar Migration de Segurança

```sql
-- No Supabase Dashboard > SQL Editor
-- Execute: supabase/migrations/003_security_audit_logs.sql

-- Isso criará:
-- - Tabela audit_logs
-- - Tabela rate_limits
-- - Triggers de auditoria
-- - Views de segurança
-- - Funções de cleanup
```

Verificar sucesso:
```sql
SELECT * FROM audit_logs LIMIT 1;
SELECT * FROM security_failed_logins;
```

### Etapa 3: Configurar Secrets do Supabase

```bash
# Configurar variáveis de ambiente em produção
supabase secrets set GEMINI_API_KEY=your_actual_key_here
supabase secrets set ALLOWED_ORIGIN=https://your-domain.com
supabase secrets set ENVIRONMENT=production

# Verificar
supabase secrets list
```

---

## 🔧 Refatorar Edge Functions

### Template de Edge Function Segura

Use este template para **todas** as Edge Functions:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  authenticateRequest,
  checkRateLimit,
  RATE_LIMITS,
  securityHeaders,
  createSuccessResponse,
  createErrorResponse,
  RateLimitError,
} from '../_shared/security.ts';
import {
  validateRequest,
  yourSchema, // Import appropriate schema
  ValidationError,
} from '../_shared/validation.ts';
import {
  getAuditLogger,
  AuditEventType,
} from '../_shared/audit.ts';

serve(async (req) => {
  const audit = getAuditLogger();
  const origin = req.headers.get('origin') || undefined;

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { ...getCorsHeaders(origin), ...securityHeaders },
    });
  }

  try {
    // 2. Rate Limiting
    const rateLimitResult = await checkRateLimit(req, RATE_LIMITS.AI_GENERATION); // Choose appropriate limit

    if (!rateLimitResult.allowed) {
      await audit.logSecurity(
        AuditEventType.SECURITY_RATE_LIMIT_EXCEEDED,
        req
      );
      throw new RateLimitError(rateLimitResult.resetAt);
    }

    // 3. Authentication
    const { user, supabaseClient } = await authenticateRequest(req);

    // 4. Input Validation
    const validatedData = await validateRequest(req, yourSchema);

    // 5. Authorization (check resource ownership)
    // Example:
    const { data: project } = await supabaseClient
      .from('projects')
      .select('user_id')
      .eq('id', validatedData.project_id)
      .single();

    if (!project || project.user_id !== user.id) {
      await audit.logSecurity(
        AuditEventType.SECURITY_UNAUTHORIZED_ACCESS,
        req,
        user.id,
        { resource: 'project', resource_id: validatedData.project_id }
      );
      throw new Error('Unauthorized');
    }

    // 6. Business Logic
    // ... your actual function logic ...

    // 7. Audit Logging
    await audit.logAIGeneration( // Or appropriate log type
      AuditEventType.AI_QUIZ_GENERATED,
      user.id,
      validatedData.project_id,
      req,
      { /* metadata */ }
    );

    // 8. Success Response
    return createSuccessResponse({
      success: true,
      data: result,
    });

  } catch (error) {
    // Error Handling
    console.error('Error:', error);

    if (error instanceof ValidationError) {
      return new Response(JSON.stringify(error.toJSON()), {
        status: error.statusCode,
        headers: { ...getCorsHeaders(origin), ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (error instanceof RateLimitError) {
      return new Response(JSON.stringify(error.toJSON()), {
        status: error.statusCode,
        headers: {
          ...getCorsHeaders(origin),
          ...securityHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((error.resetAt - Date.now()) / 1000)),
        },
      });
    }

    return createErrorResponse(error as Error, 500);
  }
});
```

### Checklist de Refatoração por Function

Para **cada** Edge Function existente:

- [ ] `generate-quiz/index.ts`
  - [ ] Adicionar rate limiting (AI_GENERATION)
  - [ ] Adicionar validação com `generateQuizSchema`
  - [ ] Adicionar audit logging
  - [ ] Substituir corsHeaders por getCorsHeaders()
  - [ ] Adicionar authorization check
  - [ ] Usar createSuccessResponse/createErrorResponse

- [ ] `generate-flashcards/index.ts`
  - [ ] Adicionar rate limiting (AI_GENERATION)
  - [ ] Adicionar validação com `generateFlashcardsSchema`
  - [ ] Adicionar audit logging
  - [ ] Substituir corsHeaders por getCorsHeaders()
  - [ ] Adicionar authorization check
  - [ ] Usar createSuccessResponse/createErrorResponse

- [ ] `generate-summary/index.ts`
  - [ ] Adicionar rate limiting (AI_GENERATION)
  - [ ] Adicionar validação com `generateSummarySchema`
  - [ ] Adicionar audit logging
  - [ ] Substituir corsHeaders por getCorsHeaders()
  - [ ] Adicionar authorization check
  - [ ] Usar createSuccessResponse/createErrorResponse

- [ ] `generate-focused-summary/index.ts`
  - [ ] Adicionar rate limiting (AI_GENERATION)
  - [ ] Adicionar validação com `generateFocusedSummarySchema`
  - [ ] Adicionar audit logging
  - [ ] Substituir corsHeaders por getCorsHeaders()
  - [ ] Adicionar authorization check
  - [ ] Usar createSuccessResponse/createErrorResponse

- [ ] `chat/index.ts`
  - [ ] Adicionar rate limiting (CHAT)
  - [ ] Adicionar validação com `chatMessageSchema`
  - [ ] Adicionar audit logging
  - [ ] Substituir corsHeaders por getCorsHeaders()
  - [ ] Adicionar authorization check
  - [ ] Usar createSuccessResponse/createErrorResponse

### Exemplo Completo

Ver arquivo de referência: `supabase/functions/generate-quiz/index.secure.ts`

Este arquivo mostra a implementação completa de todas as camadas de segurança.

---

## 🎨 Refatorar Frontend Components

### Sanitizar HTML Rendering

**Antes:**
```tsx
<div dangerouslySetInnerHTML={{ __html: summary.conteudo_html }} />
```

**Depois:**
```tsx
import { createSafeMarkup } from '@/lib/sanitize';

<div dangerouslySetInnerHTML={createSafeMarkup(summary.conteudo_html, 'rich')} />
```

### Sanitizar User Input

**Antes:**
```tsx
const handleSubmit = (data: FormData) => {
  await saveComment(data.comment);
};
```

**Depois:**
```tsx
import { sanitizeHtml } from '@/lib/sanitize';

const handleSubmit = (data: FormData) => {
  const safeComment = sanitizeHtml(data.comment);
  await saveComment(safeComment);
};
```

### Validar URLs

**Antes:**
```tsx
<a href={user.website}>Visit</a>
```

**Depois:**
```tsx
import { sanitizeUrl } from '@/lib/sanitize';

<a href={sanitizeUrl(user.website)} target="_blank" rel="noopener noreferrer">
  Visit
</a>
```

### Checklist de Components

- [ ] `SummaryViewer.tsx`
  - [ ] Usar createSafeMarkup() para HTML
  - [ ] Sanitizar texto selecionado antes de enviar ao chat

- [ ] `ContentPanel.tsx`
  - [ ] Usar createSafeMarkup() para resumos
  - [ ] Sanitizar texto antes de chat

- [ ] `QuizSession.tsx`
  - [ ] Sanitizar perguntas e alternativas (se vierem de user input)

- [ ] `ChatPanel.tsx`
  - [ ] Sanitizar mensagens do usuário antes de enviar
  - [ ] Usar sanitizeHtml() nas respostas da IA

- [ ] `DifficultiesPanel.tsx`
  - [ ] Sanitizar tópicos de dificuldade (se editáveis)

---

## 🧪 Testes de Segurança

### Executar Testes

```bash
# Adicionar Vitest ao projeto (se ainda não instalado)
npm install -D vitest @vitest/ui

# Adicionar script ao package.json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}

# Executar testes
npm test

# Ver cobertura
npm run test:coverage
```

### Testes Manuais

#### 1. Testar XSS

```typescript
// Tentar injetar script via formulário
const maliciousInput = '<script>alert("XSS")</script>';
// Deve ser sanitizado e não executar
```

#### 2. Testar SQL Injection

```typescript
// Tentar SQL injection em busca
const maliciousQuery = "'; DROP TABLE users; --";
// Deve ser escapado pela validação Zod
```

#### 3. Testar Rate Limiting

```bash
# Fazer 15 requests seguidas para Edge Function
for i in {1..15}; do
  curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"project_id":"uuid"}'
done

# Esperado: 429 Too Many Requests após 10 requests
```

#### 4. Testar CORS

```bash
# Tentar acessar de origem não permitida
curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz \
  -H "Origin: https://evil-site.com" \
  -H "Authorization: Bearer $TOKEN"

# Esperado: CORS error se ALLOWED_ORIGIN configurado
```

#### 5. Testar Autorização

```bash
# Tentar acessar projeto de outro usuário
curl -X POST https://bwgglfforazywrjhbxsa.supabase.co/functions/v1/generate-quiz \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -d '{"project_id":"USER_B_PROJECT_ID"}'

# Esperado: 403 Forbidden ou 404 Not Found
```

---

## 📊 Monitoramento Pós-Deploy

### 1. Verificar Audit Logs

```sql
-- Ver últimos eventos
SELECT * FROM audit_logs
ORDER BY created_at DESC
LIMIT 100;

-- Ver eventos de segurança
SELECT * FROM audit_logs
WHERE severity IN ('warning', 'error', 'critical')
ORDER BY created_at DESC;

-- Ver failed logins
SELECT * FROM security_failed_logins;

-- Ver custos de IA
SELECT * FROM ai_generation_stats
WHERE generation_date > CURRENT_DATE - INTERVAL '7 days';
```

### 2. Monitorar Rate Limits

```sql
-- Ver rate limit hits
SELECT
  event_type,
  COUNT(*) as hits,
  COUNT(DISTINCT user_id) as unique_users
FROM audit_logs
WHERE event_type = 'security.rate_limit_exceeded'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;
```

### 3. Alertas Recomendados

Configure alertas para:
- 5+ failed logins do mesmo IP em 1 hora
- 100+ rate limit exceeded em 1 hora
- Qualquer evento de severidade CRITICAL
- SQL injection attempts detectados
- Tentativas de acesso não autorizado

---

## 🔄 Processo de Deploy

### 1. Deploy Local (Teste)

```bash
# Testar Edge Functions localmente
supabase functions serve generate-quiz --env-file .env

# Testar com curl
curl -X POST http://localhost:54321/functions/v1/generate-quiz \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"project_id":"uuid","count":5}'
```

### 2. Deploy Production

```bash
# 1. Verificar secrets configurados
supabase secrets list

# 2. Deploy functions individualmente (com testes)
supabase functions deploy generate-quiz
# Testar...
supabase functions deploy generate-flashcards
# Testar...
# ... etc

# 3. Verificar logs
supabase functions logs generate-quiz --tail
```

### 3. Rollback (se necessário)

```bash
# Ver histórico de deploys
supabase functions list

# Fazer rollback se houver problema
# (redeploy versão anterior do código)
```

---

## ✅ Checklist Final

Antes de considerar a implementação completa:

### Backend
- [ ] Todas as 5 Edge Functions refatoradas com segurança
- [ ] Migration 003_security_audit_logs executada
- [ ] Secrets configurados no Supabase
- [ ] Rate limiting testado e funcionando
- [ ] Audit logs sendo gravados corretamente
- [ ] CORS configurado restritivamente em produção

### Frontend
- [ ] Todas as instâncias de dangerouslySetInnerHTML usando sanitização
- [ ] User input sendo sanitizado antes de envio
- [ ] URLs sendo validadas
- [ ] Filenames sendo sanitizados

### CI/CD
- [ ] GitHub Actions security workflow funcionando
- [ ] Dependabot configurado e ativo
- [ ] npm audit passando sem vulnerabilidades críticas

### Documentação
- [ ] SECURITY.md atualizado
- [ ] README.md inclui link para SECURITY.md
- [ ] Código comentado com notas de segurança

### Testes
- [ ] Testes de segurança executando e passando
- [ ] Testes manuais de XSS realizados
- [ ] Testes de rate limiting realizados
- [ ] Testes de autorização realizados

---

## 📚 Recursos Adicionais

- [OWASP Top 10 2024](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Zod Documentation](https://zod.dev/)

---

## 🆘 Troubleshooting

### Problema: Rate Limiting muito agressivo

**Solução:** Ajustar limites em `_shared/security.ts`
```typescript
export const RATE_LIMITS = {
  AI_GENERATION: {
    maxRequests: 20, // aumentar de 10 para 20
    windowMs: 60 * 1000,
  },
};
```

### Problema: CORS bloqueando requests válidos

**Solução:** Adicionar origin à whitelist
```typescript
// _shared/cors.ts
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://your-vercel-app.vercel.app',
  Deno.env.get('ALLOWED_ORIGIN') || '*',
];
```

### Problema: Sanitização removendo HTML necessário

**Solução:** Usar configuração 'rich' para conteúdo IA
```typescript
import { createSafeMarkup } from '@/lib/sanitize';

// Use 'rich' para resumos IA (permite mais tags)
<div dangerouslySetInnerHTML={createSafeMarkup(html, 'rich')} />
```

### Problema: Audit logs crescendo muito

**Solução:** Executar cleanup manualmente
```sql
-- Limpar logs antigos
SELECT archive_old_audit_logs();
SELECT cleanup_rate_limits();
```

---

**Dúvidas?** Consulte SECURITY.md ou abra uma issue.
