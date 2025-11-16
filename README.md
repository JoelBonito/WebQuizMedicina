# 🎯 Web Quiz Medicina

Aplicação web educacional moderna para estudantes de medicina criarem conteúdo de estudo (quiz, flashcards, resumos) a partir de múltiplas fontes (PDFs, áudios, textos, imagens) usando IA (Gemini 2.5).

## 🚀 Stack Tecnológica

- **Frontend**: React + TypeScript + Vite
- **UI**: Shadcn/UI + Tailwind CSS (Glassmorphism/Liquid Glass)
- **Backend**: Supabase (PostgreSQL + Edge Functions + Storage)
- **IA**: Google Gemini 2.5 Flash/Pro
- **Autenticação**: Supabase Auth

## 🎨 Funcionalidades

### ✅ Implementado

**Fase 1: Autenticação e Upload**
- ✅ Autenticação com email/senha e Google OAuth
- ✅ Dashboard de projetos (criar, editar, deletar)
- ✅ Upload de fontes com drag & drop
- ✅ Suporte para múltiplos formatos (PDF, TXT, MD, MP3, WAV, M4A, JPG, PNG)
- ✅ Extração automática de texto de PDFs
- ✅ Armazenamento em Supabase Storage
- ✅ Sistema de RLS (Row Level Security)

**Fase 2: Geração de Conteúdo com IA**
- ✅ Edge Function: `generate-quiz` (15 perguntas personalizadas)
- ✅ Edge Function: `generate-flashcards` (20 flashcards)
- ✅ Edge Function: `generate-summary` (resumos estruturados em HTML)
- ✅ Integração completa com Google Gemini 2.5 Flash/Pro
- ✅ Interface para gerar e visualizar conteúdo
- ✅ Sistema de prompts otimizados para medicina
- ✅ Suporte a múltiplas fontes por geração

**Fase 3: Sistema de Quiz Interativo**
- ✅ Interface de quiz fullscreen com 3 estados (questão, feedback, sumário)
- ✅ Botão "NÃO SEI" para rastrear dificuldades
- ✅ Sistema de progresso (salva acertos, erros, tempo)
- ✅ Sistema de dificuldades (auto-incrementa nível por tópico)
- ✅ Feedback com justificativa e dica
- ✅ Timer para rastrear tempo de resposta
- ✅ Tela de sumário final com estatísticas

**Fase 4: Sistema de Flashcards com Repetição Espaçada** 🆕
- ✅ Interface de flashcard com flip animation (3D)
- ✅ Algoritmo SM-2 para repetição espaçada
- ✅ Botões de avaliação (Fácil/Médio/Difícil)
- ✅ Cálculo automático de próxima revisão
- ✅ Integração com sistema de dificuldades
- ✅ Tela de sumário com estatísticas de revisão

### 🚧 Próximas Fases

- 🚧 Chat com IA e RAG
- 🚧 Dashboard de dificuldades
- 🚧 Suporte a áudio nativo (sem transcrição)

## 📁 Estrutura do Projeto

```
WebQuizMedicina/
├── src/
│   ├── components/          # Componentes React
│   │   ├── Auth.tsx        # Autenticação
│   │   ├── Dashboard.tsx   # Lista de projetos
│   │   ├── SourcesPanel.tsx # Upload e gestão de fontes
│   │   ├── ContentPanel.tsx # Quiz, Flashcards, Resumos
│   │   ├── QuizSession.tsx # Interface de quiz interativo (fullscreen)
│   │   ├── FlashcardSession.tsx # Interface de flashcards com repetição espaçada
│   │   ├── ChatPanel.tsx   # Chat com IA
│   │   └── ui/             # Componentes shadcn/ui
│   ├── hooks/              # Custom hooks
│   │   ├── useAuth.ts      # Gerenciamento de autenticação
│   │   ├── useProjects.ts  # CRUD de projetos
│   │   ├── useSources.ts   # Upload e gestão de fontes
│   │   ├── useQuestions.ts # Quiz + geração com IA
│   │   ├── useFlashcards.ts # Flashcards + geração com IA
│   │   ├── useSummaries.ts # Resumos + geração com IA
│   │   ├── useProgress.ts  # Salvar progresso de quiz/flashcards
│   │   └── useDifficulties.ts # Sistema NÃO SEI (rastrear dificuldades)
│   ├── lib/                # Utilitários
│   │   ├── supabase.ts     # Cliente Supabase
│   │   ├── database.types.ts # Types do banco
│   │   └── fileUtils.ts    # Processamento de arquivos
│   └── App.tsx             # Componente principal
├── supabase/
│   ├── functions/          # Edge Functions
│   │   ├── _shared/        # Código compartilhado (Gemini API, CORS)
│   │   ├── generate-quiz/
│   │   ├── generate-flashcards/
│   │   ├── generate-summary/
│   │   └── README.md       # Docs das Edge Functions
│   └── migrations/         # Migrations SQL
│       ├── 001_initial_schema.sql
│       └── 002_storage_setup.sql
└── package.json
```

## 🛠️ Setup Local

### 1. Pré-requisitos

- Node.js 18+ e npm
- Conta no Supabase
- Chave de API do Google Gemini

### 2. Instalação

```bash
# Clone o repositório
git clone https://github.com/JoelBonito/WebQuizMedicina.git
cd WebQuizMedicina

# Instale as dependências
npm install
```

### 3. Configurar Supabase

#### a) Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Copie a URL e a chave ANON do projeto

#### b) Executar migrations

1. No dashboard do Supabase, vá em "SQL Editor"
2. Execute o conteúdo de `supabase/migrations/001_initial_schema.sql`
3. Execute o conteúdo de `supabase/migrations/002_storage_setup.sql`

#### c) Criar bucket de storage

1. Vá em "Storage" no dashboard
2. Verifique se o bucket `project-sources` foi criado
3. Se não, crie manualmente com o nome `project-sources` e marque como **privado**

### 4. Configurar variáveis de ambiente

```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite o .env e adicione suas credenciais
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anon
```

### 5. Deploy das Edge Functions 🆕

```bash
# Instale o Supabase CLI
npm install -g supabase

# Login
supabase login

# Link com seu projeto
supabase link --project-ref tpwkthafekcmhbcxvupd

# Configure a chave do Gemini
supabase secrets set GEMINI_API_KEY=sua_chave_gemini

# Deploy das funções
supabase functions deploy generate-quiz
supabase functions deploy generate-flashcards
supabase functions deploy generate-summary
```

> **📖 Documentação completa:** Ver `supabase/functions/README.md`

### 6. Rodar localmente

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

- **projects**: Projetos do usuário
- **sources**: Fontes de estudo (PDFs, áudios, etc)
- **questions**: Perguntas de quiz geradas
- **flashcards**: Flashcards gerados
- **summaries**: Resumos gerados
- **progress**: Progresso do usuário (acertos, erros, tempo)
- **difficulties**: Tópicos com dificuldade (sistema "NÃO SEI")
- **chat_messages**: Histórico de chat com IA

### Storage

- **project-sources**: Arquivos enviados pelos usuários

## 🎯 Roadmap

### ✅ Fase 2: Geração de Conteúdo (Concluída!)

- ✅ Edge Function: `generate-quiz`
- ✅ Edge Function: `generate-flashcards`
- ✅ Edge Function: `generate-summary`
- ✅ Integração com Gemini 2.5

### ✅ Fase 3: Sistema de Quiz (Concluída!)

- ✅ Interface de quiz interativo fullscreen
- ✅ Botão "NÃO SEI" (orange-themed)
- ✅ Sistema de dificuldades com auto-incremento
- ✅ Feedback com justificativas e dicas
- ✅ Timer de resposta
- ✅ Tela de sumário com estatísticas

### ✅ Fase 4: Flashcards (Concluída!) 🎉

- ✅ Interface com flip animation 3D (Framer Motion)
- ✅ Sistema de repetição espaçada (SM-2)
- ✅ Botões de avaliação (Fácil/Médio/Difícil)
- ✅ Cálculo automático de próxima revisão
- ✅ Integração com dificuldades
- ✅ Tela de sumário com estatísticas

### Fase 5: Chat com IA

- [ ] RAG sobre fontes do projeto
- [ ] Edge Function: `chat`
- [ ] Citação de fontes
- [ ] Sugestões baseadas em dificuldades

### Fase 6: Dashboard de Dificuldades

- [ ] Visualização de tópicos fracos
- [ ] Geração de conteúdo personalizado
- [ ] Marcar como resolvido

## 💡 Como Usar

1. **Criar conta** ou fazer login
2. **Criar um projeto** (ex: "Farmacologia Geral")
3. **Upload de fontes** (PDFs, textos, áudios)
4. **Gerar conteúdo com IA**:
   - Clique em "Gerar Quiz" → IA cria 15 perguntas personalizadas
   - Clique em "Gerar Flashcards" → IA cria 20 flashcards
   - Clique em "Gerar Resumo" → IA cria resumo estruturado
5. **Estudar de forma interativa**:
   - **Quiz**: Clique em "Iniciar Quiz" → responda as questões ou clique "NÃO SEI" para marcar dificuldades
   - **Flashcards**: Clique em "Iniciar Flashcards" → vire os cards e avalie (Fácil/Médio/Difícil) para repetição espaçada
   - Sistema rastreia automaticamente seus tópicos fracos para revisão personalizada

## 🤝 Contribuindo

Este é um projeto educacional. Contribuições são bem-vindas!

## 📝 Licença

MIT

## 👨‍💻 Autor

Joel Bonito - [GitHub](https://github.com/JoelBonito)
