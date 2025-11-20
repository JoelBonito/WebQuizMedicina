-- Add response_language field to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS response_language TEXT DEFAULT 'pt' CHECK (response_language IN ('pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar'));

-- Update existing profiles to have default language
UPDATE public.profiles
SET response_language = 'pt'
WHERE response_language IS NULL;

-- Create index for faster language lookups
CREATE INDEX IF NOT EXISTS profiles_response_language_idx ON public.profiles(response_language);

-- Update the handle_new_user function to include default language
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, response_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'response_language', 'pt')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
