# Edge Functions - Web Quiz Medicina

Este diretório contém as Edge Functions do Supabase que usam Google Gemini 2.5 para gerar conteúdo educacional.

## 📁 Estrutura

```
functions/
├── _shared/              # Código compartilhado
│   ├── cors.ts          # Headers CORS
│   └── gemini.ts        # Cliente Gemini API
├── generate-quiz/       # Gera perguntas de quiz
│   └── index.ts
├── generate-flashcards/ # Gera flashcards
│   └── index.ts
└── generate-summary/    # Gera resumos
    └── index.ts
```

## 🚀 Deploy

### Pré-requisitos

1. **Supabase CLI instalado**:
```bash
npm install -g supabase
```

2. **Chave de API do Google Gemini**:
   - Acesse [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Crie uma nova chave de API
   - Copie a chave

### Passo a Passo

#### 1. Login no Supabase

```bash
supabase login
```

#### 2. Link com seu projeto

```bash
supabase link --project-ref tpwkthafekcmhbcxvupd
```

#### 3. Configure a chave do Gemini

```bash
supabase secrets set GEMINI_API_KEY=sua_chave_aqui
```

#### 4. Deploy todas as Edge Functions

```bash
# Deploy de todas as funções
supabase functions deploy generate-quiz
supabase functions deploy generate-flashcards
supabase functions deploy generate-summary
```

Ou deploy todas de uma vez:

```bash
cd supabase/functions
for func in generate-quiz generate-flashcards generate-summary; do
  supabase functions deploy $func
done
```

## 📝 Edge Functions

### 1. `generate-quiz`

Gera perguntas de múltipla escolha baseadas no conteúdo das fontes.

**Request:**
```json
{
  "source_id": "uuid",     // Opcional: ID de uma fonte específica
  "project_id": "uuid",    // Opcional: ID do projeto (gera de todas as fontes)
  "count": 15              // Quantidade de perguntas (padrão: 15)
}
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "questions": [
    {
      "id": "uuid",
      "pergunta": "Qual é...",
      "opcoes": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "resposta_correta": "A",
      "justificativa": "...",
      "dica": "...",
      "topico": "Cardiologia",
      "dificuldade": "médio"
    }
  ]
}
```

### 2. `generate-flashcards`

Gera flashcards (frente/verso) para memorização ativa.

**Request:**
```json
{
  "source_id": "uuid",
  "project_id": "uuid",
  "count": 20
}
```

**Response:**
```json
{
  "success": true,
  "count": 20,
  "flashcards": [
    {
      "id": "uuid",
      "frente": "O que é...?",
      "verso": "É a definição...",
      "topico": "Farmacologia",
      "dificuldade": "fácil"
    }
  ]
}
```

### 3. `generate-summary`

Gera resumo estruturado em HTML.

**Request:**
```json
{
  "source_id": "uuid",
  "project_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "id": "uuid",
    "titulo": "Fundamentos de Anatomia",
    "conteudo_html": "<h2>Introdução</h2><p>...</p>",
    "topicos": ["Anatomia", "Fisiologia"],
    "source_ids": ["uuid1", "uuid2"]
  }
}
```

## 🔧 Teste Local

Para testar localmente antes do deploy:

```bash
# Inicie o servidor local
supabase functions serve

# Teste uma função
curl -i --location --request POST 'http://localhost:54321/functions/v1/generate-quiz' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"project_id":"uuid","count":5}'
```

## 🐛 Debug

Ver logs em tempo real:

```bash
# Logs de todas as funções
supabase functions logs

# Logs de uma função específica
supabase functions logs generate-quiz

# Seguir logs em tempo real
supabase functions logs --follow
```

## 📊 Monitoramento

Acesse o dashboard do Supabase:
- `Functions` → `Edge Functions`
- Veja invocações, erros, latência
- Monitore uso de API do Gemini

## 💡 Dicas

1. **Rate Limits do Gemini**: Configure retry logic se necessário
2. **Timeouts**: Edge Functions têm timeout padrão de 30s
3. **Custos**: Monitore uso da API do Gemini (2.5 Flash = melhor custo-benefício)
4. **Cache**: Considere cachear resultados para economizar
5. **Modelos Disponíveis**:
   - **Gemini 2.5 Flash** (padrão): Melhor custo-benefício, rápido
   - **Gemini 2.5 Pro**: Mais avançado, usado para resumos complexos
   - **Gemini 2.5 Flash-Lite**: Mais rápido, otimizado para eficiência

## 🔐 Segurança

- ✅ Autenticação via JWT do Supabase
- ✅ RLS verificado nas queries
- ✅ CORS configurado
- ✅ Chave Gemini em secrets (não no código)

## 🆘 Troubleshooting

### Erro: "GEMINI_API_KEY not configured"
```bash
supabase secrets set GEMINI_API_KEY=sua_chave
```

### Erro: "Unauthorized"
- Verifique se o token JWT está no header Authorization
- Confirme que o usuário tem acesso ao projeto/fonte

### Erro: "No content available"
- Certifique-se de que as fontes têm `status = 'ready'`
- Verifique se `extracted_content` não está vazio

### Timeout
- Reduza a quantidade de perguntas/flashcards
- Use Gemini 2.5 Flash (padrão) ao invés de 2.5 Pro para respostas mais rápidas
- Considere usar Gemini 2.5 Flash-Lite para máxima velocidade
