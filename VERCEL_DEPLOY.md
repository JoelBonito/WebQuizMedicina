# 🚀 Deploy na Vercel - Web Quiz Medicina

Este guia ensina como fazer o deploy da aplicação Web Quiz Medicina na Vercel.

## 📋 Pré-requisitos

- Conta na [Vercel](https://vercel.com)
- Projeto Supabase configurado (veja README.md)
- Repositório Git com o código

---

## 🔧 Passo a Passo

### 1. Importar Projeto na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New..."** → **"Project"**
3. Importe o repositório `JoelBonito/WebQuizMedicina`
4. Configure o projeto:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (raiz)
   - **Build Command**: `npm run build` (padrão)
   - **Output Directory**: `dist` (padrão)

### 2. Configurar Variáveis de Ambiente

**IMPORTANTE**: Sem estas variáveis, o site não funcionará!

#### Na aba "Environment Variables", adicione:

| Nome | Valor | Ambientes |
|------|-------|-----------|
| `VITE_SUPABASE_URL` | `https://bwgglfforazywrjhbxsa.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Z2dsZmZvcmF6eXdyamhieHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMDIwMzMsImV4cCI6MjA3ODg3ODAzM30.Ngf582OBWuPXO9sshKBYcWxk8J7z3AqJ8gGjdsCyCkU` | Production, Preview, Development |

> **💡 Dica**: Estes valores também estão disponíveis em `.env.example`

#### Como adicionar:

1. Vá em **Settings** → **Environment Variables**
2. Clique em **"Add New"**
3. Cole o **Nome** da variável (ex: `VITE_SUPABASE_URL`)
4. Cole o **Valor** correspondente
5. Selecione **todos os ambientes** (Production, Preview, Development)
6. Clique em **"Save"**
7. Repita para a segunda variável

### 3. Deploy

1. Clique em **"Deploy"**
2. Aguarde a build completar (geralmente 1-2 minutos)
3. Acesse a URL gerada (ex: `https://web-quiz-medicina.vercel.app`)

---

## 🔄 Atualizar Variáveis de Ambiente

Se você precisar atualizar as variáveis depois do deploy:

1. Vá em **Settings** → **Environment Variables**
2. Clique no ícone de **editar** (lápis) ao lado da variável
3. Atualize o valor
4. **IMPORTANTE**: Faça um **Redeploy**:
   - Vá em **Deployments**
   - Clique nos **3 pontinhos** do último deployment
   - Clique em **"Redeploy"**
   - Marque **"Use existing Build Cache"** (opcional, mais rápido)

> **⚠️ Atenção**: Mudanças em variáveis de ambiente NÃO são aplicadas automaticamente! Você DEVE fazer um redeploy.

---

## 🐛 Troubleshooting

### Erro: "Missing Supabase environment variables"

**Causa**: Variáveis `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` não configuradas na Vercel.

**Solução**:
1. Verifique em **Settings** → **Environment Variables** se as variáveis estão lá
2. Confirme que os valores estão corretos (sem espaços extras)
3. Confirme que os ambientes estão selecionados (Production, Preview, Development)
4. Faça um **Redeploy** após adicionar/atualizar

### Erro 404 em rotas

**Causa**: SPA (Single Page Application) precisa de configuração de rewrites.

**Solução**: A Vercel detecta automaticamente Vite e configura corretamente. Se o problema persistir, crie `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Build falha com "MODULE_NOT_FOUND"

**Causa**: Dependências não instaladas corretamente.

**Solução**:
1. Verifique se `package.json` está commitado
2. Tente limpar cache: **Settings** → **General** → **Clear Build Cache & Redeploy**

---

## 🔒 Segurança

### ✅ Boas Práticas

1. **NUNCA** commite arquivos `.env` no Git
2. **SEMPRE** use variáveis de ambiente na Vercel para valores sensíveis
3. As variáveis `VITE_*` são **públicas** (expostas no browser)
   - Apenas use para dados que podem ser públicos (URLs, chaves ANON)
4. Chaves sensíveis (API keys, secrets) devem ir nas **Edge Functions** do Supabase, não no frontend

### 🔐 Rotação de Chaves

Se você precisar trocar a `SUPABASE_ANON_KEY`:

1. Gere nova chave no [Dashboard do Supabase](https://supabase.com/dashboard)
2. Atualize a variável `VITE_SUPABASE_ANON_KEY` na Vercel
3. Faça um **Redeploy**
4. Revogue a chave antiga no Supabase (se necessário)

---

## 📊 Monitoramento

### Ver Logs de Deployment

1. Vá em **Deployments**
2. Clique no deployment desejado
3. Veja a aba **"Building"** para logs de build
4. Veja a aba **"Functions"** para logs de runtime (se houver)

### Analytics

A Vercel fornece analytics gratuitos:
- Vá em **Analytics** para ver métricas de uso
- Veja **Speed Insights** para performance

---

## 🌐 Domínio Customizado (Opcional)

1. Vá em **Settings** → **Domains**
2. Clique em **"Add"**
3. Digite seu domínio (ex: `quizmedicina.com`)
4. Siga as instruções para configurar DNS

---

## 🚀 Deploy Automático via Git

A Vercel faz deploy automático quando você:
- Faz **push** para a branch `main` → Deploy em **Production**
- Abre um **Pull Request** → Deploy de **Preview** (URL temporária)

Para desabilitar:
1. **Settings** → **Git**
2. Configure quais branches devem fazer deploy automático

---

## 📚 Recursos Adicionais

- [Documentação Vercel](https://vercel.com/docs)
- [Vite + Vercel Guide](https://vercel.com/guides/deploying-vite-with-vercel)
- [Environment Variables Docs](https://vercel.com/docs/concepts/projects/environment-variables)

---

## 📝 Checklist de Deploy

- [ ] Projeto importado na Vercel
- [ ] Variável `VITE_SUPABASE_URL` configurada
- [ ] Variável `VITE_SUPABASE_ANON_KEY` configurada
- [ ] Ambientes selecionados (Production, Preview, Development)
- [ ] Deploy realizado com sucesso
- [ ] Site abrindo sem erros (testar em https://web-quiz-medicina.vercel.app)
- [ ] Autenticação funcionando
- [ ] Upload de arquivos funcionando
- [ ] Edge Functions configuradas no Supabase (ver DEPLOY_EDGE_FUNCTION.md)

---

**✅ Tudo pronto!** Seu site está no ar: https://web-quiz-medicina.vercel.app

Se encontrar problemas, consulte a seção **Troubleshooting** acima ou abra uma issue no GitHub.
