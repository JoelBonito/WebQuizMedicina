-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Sources table
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- pdf, mp3, txt, jpg, png, etc
  storage_path TEXT NOT NULL,
  extracted_content TEXT,
  metadata JSONB,
  status TEXT DEFAULT 'pending', -- pending, processing, ready, error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  pergunta TEXT NOT NULL,
  opcoes JSONB NOT NULL, -- ["A) ...", "B) ...", "C) ...", "D) ..."]
  resposta_correta TEXT NOT NULL,
  dica TEXT,
  justificativa TEXT,
  topico TEXT,
  dificuldade TEXT DEFAULT 'médio',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Flashcards table
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  frente TEXT NOT NULL,
  verso TEXT NOT NULL,
  topico TEXT,
  dificuldade TEXT DEFAULT 'médio',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  conteudo_html TEXT NOT NULL,
  topicos JSONB,
  source_ids JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Progress table
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  flashcard_id UUID REFERENCES flashcards(id) ON DELETE CASCADE,
  acertou BOOLEAN,
  clicou_nao_sei BOOLEAN DEFAULT false,
  tempo_resposta INTEGER, -- em segundos
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Difficulties table (CORE)
CREATE TABLE IF NOT EXISTS difficulties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  topico TEXT NOT NULL,
  tipo_origem TEXT NOT NULL, -- quiz, flashcard, chat
  nivel INTEGER DEFAULT 1,
  resolvido BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL, -- user, assistant
  content TEXT NOT NULL,
  sources_cited JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sources_project_id ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_questions_project_id ON questions(project_id);
CREATE INDEX IF NOT EXISTS idx_questions_source_id ON questions(source_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_project_id ON flashcards(project_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_source_id ON flashcards(source_id);
CREATE INDEX IF NOT EXISTS idx_summaries_project_id ON summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_difficulties_user_id ON difficulties(user_id);
CREATE INDEX IF NOT EXISTS idx_difficulties_project_id ON difficulties(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulties ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sources
CREATE POLICY "Users can view sources from own projects"
  ON sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert sources to own projects"
  ON sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sources from own projects"
  ON sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sources from own projects"
  ON sources FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sources.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for questions (similar pattern)
CREATE POLICY "Users can view questions from own projects"
  ON questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = questions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert questions to own projects"
  ON questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = questions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update questions from own projects"
  ON questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = questions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete questions from own projects"
  ON questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = questions.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for flashcards
CREATE POLICY "Users can view flashcards from own projects"
  ON flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = flashcards.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert flashcards to own projects"
  ON flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = flashcards.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards from own projects"
  ON flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = flashcards.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete flashcards from own projects"
  ON flashcards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = flashcards.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for summaries
CREATE POLICY "Users can view summaries from own projects"
  ON summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = summaries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert summaries to own projects"
  ON summaries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = summaries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update summaries from own projects"
  ON summaries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = summaries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete summaries from own projects"
  ON summaries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = summaries.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for progress
CREATE POLICY "Users can view own progress"
  ON progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
  ON progress FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for difficulties
CREATE POLICY "Users can view own difficulties"
  ON difficulties FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own difficulties"
  ON difficulties FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own difficulties"
  ON difficulties FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own difficulties"
  ON difficulties FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view messages from own projects"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages to own projects"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update messages from own projects"
  ON chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages from own projects"
  ON chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );
