# 🎯 Web Quiz Medicina

Aplicação web educacional moderna para estudantes de medicina criarem conteúdo de estudo (quiz, flashcards, resumos) a partir de múltiplas fontes (PDFs, áudios, textos, imagens) usando IA (Gemini 2.5).

## 🚀 Stack Tecnológica

- **Frontend**: React + TypeScript + Vite
- **UI**: Shadcn/UI + Tailwind CSS (Glassmorphism/Liquid Glass)
- **Backend**: Supabase (PostgreSQL + Edge Functions + Storage)
- **IA**: Google Gemini 2.5 Flash/Pro
- **Autenticação**: Supabase Auth

## 🎨 Funcionalidades

### ✅ Implementado (Fase 1)

- ✅ Autenticação com email/senha e Google OAuth
- ✅ Dashboard de projetos (criar, editar, deletar)
- ✅ Upload de fontes com drag & drop
- ✅ Suporte para múltiplos formatos (PDF, TXT, MD, MP3, WAV, M4A, JPG, PNG)
- ✅ Extração automática de texto de PDFs
- ✅ Armazenamento em Supabase Storage
- ✅ Sistema de RLS (Row Level Security)

### 🚧 Em Desenvolvimento

- 🚧 Edge Functions para geração de conteúdo com IA
- 🚧 Sistema de Quiz interativo com "NÃO SEI"
- 🚧 Flashcards com repetição espaçada
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
│   │   ├── ChatPanel.tsx   # Chat com IA
│   │   └── ui/             # Componentes shadcn/ui
│   ├── hooks/              # Custom hooks
│   │   ├── useAuth.ts      # Gerenciamento de autenticação
│   │   ├── useProjects.ts  # CRUD de projetos
│   │   └── useSources.ts   # Upload e gestão de fontes
│   ├── lib/                # Utilitários
│   │   ├── supabase.ts     # Cliente Supabase
│   │   ├── database.types.ts # Types do banco
│   │   └── fileUtils.ts    # Processamento de arquivos
│   └── App.tsx             # Componente principal
├── supabase/
│   └── migrations/         # Migrations SQL
│       ├── 001_initial_schema.sql
│       └── 002_storage_setup.sql
└── package.json
```

## 🛠️ Setup Local

### 1. Pré-requisitos

- Node.js 18+ e npm
- Conta no Supabase
- Chave de API do Google Gemini (para Edge Functions)

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

### 5. Rodar localmente

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

### Fase 2: Geração de Conteúdo

- [ ] Edge Function: `generate-quiz`
- [ ] Edge Function: `generate-flashcards`
- [ ] Edge Function: `generate-summary`
- [ ] Integração com Gemini 2.5

### Fase 3: Sistema de Quiz

- [ ] Interface de quiz interativo
- [ ] Botão "NÃO SEI"
- [ ] Sistema de dificuldades
- [ ] Feedback com justificativas

### Fase 4: Flashcards

- [ ] Interface com flip animation
- [ ] Sistema de repetição espaçada
- [ ] Integração com dificuldades

### Fase 5: Chat com IA

- [ ] RAG sobre fontes do projeto
- [ ] Edge Function: `chat`
- [ ] Citação de fontes
- [ ] Sugestões baseadas em dificuldades

### Fase 6: Dashboard de Dificuldades

- [ ] Visualização de tópicos fracos
- [ ] Geração de conteúdo personalizado
- [ ] Marcar como resolvido

## 🤝 Contribuindo

Este é um projeto educacional. Contribuições são bem-vindas!

## 📝 Licença

MIT

## 👨‍💻 Autor

Joel Bonito - [GitHub](https://github.com/JoelBonito)
