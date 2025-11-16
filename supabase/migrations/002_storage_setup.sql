-- Create storage bucket for project sources
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-sources', 'project-sources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project-sources bucket
CREATE POLICY "Users can upload to own project folders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own project files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'project-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
