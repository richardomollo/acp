-- Ensure fitpass-images bucket exists and has correct storage policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fitpass-images',
  'fitpass-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Drop any stale policies that may already exist before recreating
DROP POLICY IF EXISTS "fitpass_images_public_read"       ON storage.objects;
DROP POLICY IF EXISTS "fitpass_images_auth_insert"       ON storage.objects;
DROP POLICY IF EXISTS "fitpass_images_auth_update"       ON storage.objects;
DROP POLICY IF EXISTS "fitpass_images_auth_delete"       ON storage.objects;

CREATE POLICY "fitpass_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fitpass-images');

CREATE POLICY "fitpass_images_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');

CREATE POLICY "fitpass_images_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');

CREATE POLICY "fitpass_images_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');
