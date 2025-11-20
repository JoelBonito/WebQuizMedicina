-- Add session_id to questions and flashcards tables to group generated content

-- 1. Add session_id column to questions table
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS session_id UUID;

-- 2. Add session_id column to flashcards table
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS session_id UUID;

-- 3. Create indexes for better performance when querying by session_id
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_session_id ON flashcards(session_id);

-- 4. For existing questions and flashcards without session_id,
-- group them by created_at (within 1 minute) and assign the same session_id
-- This allows existing content to appear as sessions in the UI

-- Generate session_id for existing questions grouped by project and creation time
WITH question_sessions AS (
  SELECT
    id,
    project_id,
    -- Group questions created within 1 minute of each other
    date_trunc('minute', created_at) as session_time,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, date_trunc('minute', created_at)
      ORDER BY created_at
    ) as rn
  FROM questions
  WHERE session_id IS NULL
),
session_ids AS (
  SELECT DISTINCT
    project_id,
    session_time,
    gen_random_uuid() as new_session_id
  FROM question_sessions
)
UPDATE questions q
SET session_id = s.new_session_id
FROM question_sessions qs
JOIN session_ids s ON qs.project_id = s.project_id AND qs.session_time = s.session_time
WHERE q.id = qs.id AND q.session_id IS NULL;

-- Generate session_id for existing flashcards grouped by project and creation time
WITH flashcard_sessions AS (
  SELECT
    id,
    project_id,
    -- Group flashcards created within 1 minute of each other
    date_trunc('minute', created_at) as session_time,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, date_trunc('minute', created_at)
      ORDER BY created_at
    ) as rn
  FROM flashcards
  WHERE session_id IS NULL
),
session_ids AS (
  SELECT DISTINCT
    project_id,
    session_time,
    gen_random_uuid() as new_session_id
  FROM flashcard_sessions
)
UPDATE flashcards f
SET session_id = s.new_session_id
FROM flashcard_sessions fs
JOIN session_ids s ON fs.project_id = s.project_id AND fs.session_time = s.session_time
WHERE f.id = fs.id AND f.session_id IS NULL;

-- 5. Make session_id NOT NULL for future inserts (after data migration)
-- Note: We're not setting NOT NULL constraint to allow flexibility,
-- but edge functions should always provide a session_id
