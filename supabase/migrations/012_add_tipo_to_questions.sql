-- Add tipo (question type) column to questions table

-- 1. Create enum type for question types
DO $$ BEGIN
  CREATE TYPE question_type AS ENUM (
    'multipla_escolha',
    'verdadeiro_falso',
    'citar',
    'completar',
    'caso_clinico'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add tipo column to questions table
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS tipo question_type DEFAULT 'multipla_escolha';

-- 3. Update existing questions to have tipo = 'multipla_escolha' (default)
UPDATE questions
SET tipo = 'multipla_escolha'
WHERE tipo IS NULL;

-- 4. Create index for better performance when filtering by tipo
CREATE INDEX IF NOT EXISTS idx_questions_tipo ON questions(tipo);
