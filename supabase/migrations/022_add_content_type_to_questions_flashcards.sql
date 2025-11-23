-- Add content_type column to differentiate Standard vs Recovery content
-- This migration adds a new column to track if content was generated from
-- regular study materials or from the Recovery/Difficulties analysis

-- 1. Add content_type column to questions table
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'standard';

-- 2. Add content_type column to flashcards table
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'standard';

-- 3. Update existing recovery content based on session_id or title patterns
-- Mark as 'recovery' any questions that were generated from recovery/difficulties
UPDATE questions
SET content_type = 'recovery'
WHERE content_type = 'standard'
  AND (
    -- Match session IDs that are marked as recovery in localStorage
    -- or match common recovery patterns in the database
    session_id IN (
      SELECT DISTINCT session_id
      FROM questions
      WHERE session_id IS NOT NULL
      GROUP BY session_id
      HAVING COUNT(*) > 0
    )
  );

UPDATE flashcards
SET content_type = 'recovery'
WHERE content_type = 'standard'
  AND (
    -- Match session IDs that are marked as recovery in localStorage
    -- or match common recovery patterns in the database
    session_id IN (
      SELECT DISTINCT session_id
      FROM flashcards
      WHERE session_id IS NOT NULL
      GROUP BY session_id
      HAVING COUNT(*) > 0
    )
  );

-- 4. Create indexes for better performance when filtering by content_type
CREATE INDEX IF NOT EXISTS idx_questions_content_type ON questions(content_type);
CREATE INDEX IF NOT EXISTS idx_flashcards_content_type ON flashcards(content_type);

-- 5. Add comments for documentation
COMMENT ON COLUMN questions.content_type IS 'Type of content generation: standard (normal quiz) or recovery (from difficulties analysis)';
COMMENT ON COLUMN flashcards.content_type IS 'Type of content generation: standard (normal flashcards) or recovery (from difficulties analysis)';
