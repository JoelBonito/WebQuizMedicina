-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can upload to own project folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own project files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own project files" ON storage.objects;

-- Create improved storage policies
-- The path structure is: {user_id}/{project_id}/{filename}

-- Policy for uploading files
CREATE POLICY "Users can upload to own project folders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

-- Policy for viewing files
CREATE POLICY "Users can view own project files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

-- Policy for updating files
CREATE POLICY "Users can update own project files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);

-- Policy for deleting files
CREATE POLICY "Users can delete own project files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-sources' AND
  (string_to_array(name, '/'))[1] = auth.uid()::text
);
