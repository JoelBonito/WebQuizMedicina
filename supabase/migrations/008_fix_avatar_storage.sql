-- Create avatars bucket in user-uploads if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies for user-uploads bucket
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Policy for uploading avatars
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' AND
  (
    -- Allow project sources: {user_id}/{project_id}/{filename}
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    -- Allow avatars: avatars/{user_id}-{timestamp}.{ext}
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);

-- Policy for viewing files (public bucket)
CREATE POLICY "Anyone can view user uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-uploads');

-- Policy for updating own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-uploads' AND
  (
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);

-- Policy for deleting own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-uploads' AND
  (
    (string_to_array(name, '/'))[1] = auth.uid()::text
    OR
    name LIKE 'avatars/' || auth.uid()::text || '%'
  )
);
