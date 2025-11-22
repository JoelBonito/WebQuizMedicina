-- Migration: Create difficulty taxonomy and auto-resolution (Phase 4C)
-- This enables topic normalization and automatic difficulty resolution

-- ============================================
-- PART 1: Difficulty Taxonomy Table
-- ============================================

-- Table to store canonical medical terms and their synonyms
CREATE TABLE IF NOT EXISTS public.difficulty_taxonomy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_term TEXT NOT NULL UNIQUE,
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  category TEXT, -- Ex: 'Cardiologia', 'Endocrinologia', 'Farmacologia'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster synonym lookups
CREATE INDEX idx_difficulty_taxonomy_synonyms ON public.difficulty_taxonomy USING GIN(synonyms);
CREATE INDEX idx_difficulty_taxonomy_category ON public.difficulty_taxonomy(category);

-- RLS Policies (Read-only for authenticated users, admin can modify)
ALTER TABLE public.difficulty_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view taxonomy"
  ON public.difficulty_taxonomy FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can modify taxonomy"
  ON public.difficulty_taxonomy FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- PART 2: Normalize Topic Function
-- ============================================

-- Function to normalize a topic using the taxonomy table
CREATE OR REPLACE FUNCTION public.normalize_difficulty_topic(
  input_topic TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_topic TEXT;
BEGIN
  -- Trim and lowercase for comparison
  input_topic := LOWER(TRIM(input_topic));

  -- Check if input matches a canonical term
  SELECT canonical_term INTO normalized_topic
  FROM public.difficulty_taxonomy
  WHERE LOWER(canonical_term) = input_topic
  LIMIT 1;

  IF normalized_topic IS NOT NULL THEN
    RETURN normalized_topic;
  END IF;

  -- Check if input matches any synonym
  SELECT canonical_term INTO normalized_topic
  FROM public.difficulty_taxonomy
  WHERE input_topic = ANY(
    SELECT LOWER(unnest(synonyms))
  )
  LIMIT 1;

  IF normalized_topic IS NOT NULL THEN
    RETURN normalized_topic;
  END IF;

  -- If no match found, return original (capitalized first letter)
  RETURN INITCAP(TRIM(input_topic));
END;
$$;

-- ============================================
-- PART 3: Auto-Resolution Tracking
-- ============================================

-- Add column to track consecutive correct answers
ALTER TABLE public.difficulties
ADD COLUMN IF NOT EXISTS consecutive_correct INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_resolved_at TIMESTAMPTZ;

-- Create index for auto-resolution queries
CREATE INDEX IF NOT EXISTS idx_difficulties_auto_resolution
  ON public.difficulties(user_id, project_id, topico, resolvido, consecutive_correct);

-- ============================================
-- PART 4: Function to Check and Auto-Resolve Difficulties
-- ============================================

-- Function to check if a difficulty should be auto-resolved
CREATE OR REPLACE FUNCTION public.check_auto_resolve_difficulty(
  p_user_id UUID,
  p_project_id UUID,
  p_topic TEXT,
  p_correct BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_difficulty_id UUID;
  v_consecutive_correct INTEGER;
  v_auto_resolved BOOLEAN := false;
  v_threshold INTEGER := 3; -- 3 consecutive correct answers to resolve
BEGIN
  -- Get the difficulty record
  SELECT id, consecutive_correct INTO v_difficulty_id, v_consecutive_correct
  FROM public.difficulties
  WHERE user_id = p_user_id
    AND project_id = p_project_id
    AND topico = p_topic
    AND resolvido = false
  LIMIT 1;

  -- If no difficulty found, return early
  IF v_difficulty_id IS NULL THEN
    RETURN jsonb_build_object(
      'difficulty_found', false,
      'auto_resolved', false
    );
  END IF;

  -- Update consecutive correct count
  IF p_correct THEN
    v_consecutive_correct := COALESCE(v_consecutive_correct, 0) + 1;

    -- Check if threshold reached
    IF v_consecutive_correct >= v_threshold THEN
      -- Auto-resolve the difficulty
      UPDATE public.difficulties
      SET
        resolvido = true,
        consecutive_correct = v_consecutive_correct,
        last_attempt_at = NOW(),
        auto_resolved_at = NOW()
      WHERE id = v_difficulty_id;

      v_auto_resolved := true;
    ELSE
      -- Update consecutive count
      UPDATE public.difficulties
      SET
        consecutive_correct = v_consecutive_correct,
        last_attempt_at = NOW()
      WHERE id = v_difficulty_id;
    END IF;
  ELSE
    -- Reset consecutive count on incorrect answer
    UPDATE public.difficulties
    SET
      consecutive_correct = 0,
      last_attempt_at = NOW()
    WHERE id = v_difficulty_id;

    v_consecutive_correct := 0;
  END IF;

  RETURN jsonb_build_object(
    'difficulty_found', true,
    'difficulty_id', v_difficulty_id,
    'consecutive_correct', v_consecutive_correct,
    'auto_resolved', v_auto_resolved,
    'threshold', v_threshold
  );
END;
$$;

-- ============================================
-- PART 5: Initial Taxonomy Data (Common Medical Terms)
-- ============================================

-- Insert common medical topics with their synonyms
INSERT INTO public.difficulty_taxonomy (canonical_term, synonyms, category, description) VALUES
  -- Cardiologia
  ('Cardiologia', ARRAY['Coração', 'Cardíaco', 'Cardio', 'Sistema Cardiovascular'], 'Cardiologia', 'Estudo do coração e sistema cardiovascular'),
  ('Hipertensão', ARRAY['HAS', 'Pressão Alta', 'Hipertensão Arterial'], 'Cardiologia', 'Pressão arterial elevada'),
  ('Insuficiência Cardíaca', ARRAY['IC', 'ICC', 'Insuficiência Cardíaca Congestiva'], 'Cardiologia', 'Incapacidade do coração de bombear sangue adequadamente'),

  -- Endocrinologia
  ('Diabetes Mellitus Tipo 1', ARRAY['DM1', 'Diabetes Tipo 1', 'Diabetes Insulinodependente'], 'Endocrinologia', 'Diabetes autoimune com deficiência absoluta de insulina'),
  ('Diabetes Mellitus Tipo 2', ARRAY['DM2', 'Diabetes Tipo 2', 'Diabetes não Insulinodependente'], 'Endocrinologia', 'Diabetes com resistência à insulina'),
  ('Insulina', ARRAY['Hormônio Insulina'], 'Endocrinologia', 'Hormônio regulador da glicemia'),
  ('Cetoacidose Diabética', ARRAY['CAD', 'Cetoacidose'], 'Endocrinologia', 'Complicação aguda do diabetes'),
  ('Hipoglicemia', ARRAY['Glicemia Baixa'], 'Endocrinologia', 'Glicemia < 70 mg/dL'),
  ('Hemoglobina Glicada', ARRAY['HbA1c', 'A1C', 'Hemoglobina Glicosilada'], 'Endocrinologia', 'Marcador de controle glicêmico'),
  ('Tireoide', ARRAY['Glândula Tireoide', 'Tireóide'], 'Endocrinologia', 'Glândula endócrina do pescoço'),

  -- Pneumologia
  ('Asma', ARRAY['Asma Brônquica'], 'Pneumologia', 'Doença inflamatória das vias aéreas'),
  ('DPOC', ARRAY['Doença Pulmonar Obstrutiva Crônica', 'Enfisema', 'Bronquite Crônica'], 'Pneumologia', 'Obstrução crônica do fluxo aéreo'),

  -- Nefrologia
  ('Insuficiência Renal', ARRAY['IR', 'IRC', 'Insuficiência Renal Crônica'], 'Nefrologia', 'Perda de função renal'),

  -- Hematologia
  ('Anemia', ARRAY['Anemia Ferropriva', 'Falta de Ferro'], 'Hematologia', 'Redução de hemoglobina'),

  -- Farmacologia
  ('Farmacologia', ARRAY['Medicamentos', 'Drogas', 'Fármacos'], 'Farmacologia', 'Estudo dos medicamentos'),
  ('Anti-hipertensivos', ARRAY['Medicamentos para Pressão', 'Drogas Anti-hipertensivas'], 'Farmacologia', 'Medicamentos para hipertensão'),

  -- Anatomia
  ('Anatomia', ARRAY['Anatomia Humana', 'Estruturas Anatômicas'], 'Anatomia', 'Estudo das estruturas do corpo'),
  ('Pâncreas', ARRAY['Glândula Pancreática'], 'Anatomia', 'Glândula digestiva e endócrina'),

  -- Fisiologia
  ('Fisiologia', ARRAY['Fisiologia Humana', 'Funções Fisiológicas'], 'Fisiologia', 'Estudo das funções do corpo'),
  ('Metabolismo', ARRAY['Metabolismo Energético', 'Vias Metabólicas'], 'Fisiologia', 'Processos químicos do organismo')
ON CONFLICT (canonical_term) DO NOTHING;

-- ============================================
-- PART 6: Comments
-- ============================================

COMMENT ON TABLE public.difficulty_taxonomy IS 'Taxonomy table for normalizing difficulty topics';
COMMENT ON FUNCTION public.normalize_difficulty_topic IS 'Normalizes a topic name using the taxonomy table';
COMMENT ON FUNCTION public.check_auto_resolve_difficulty IS 'Checks and auto-resolves difficulties after consecutive correct answers';
COMMENT ON COLUMN public.difficulties.consecutive_correct IS 'Number of consecutive correct answers for this difficulty';
COMMENT ON COLUMN public.difficulties.auto_resolved_at IS 'Timestamp when difficulty was auto-resolved';
