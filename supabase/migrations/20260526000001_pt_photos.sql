-- Add cover photo to personal trainers
ALTER TABLE public.personal_trainers
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Create public storage bucket for PT photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pt-photos',
  'pt-photos',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "pt_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pt-photos');

CREATE POLICY "pt_photos_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');

CREATE POLICY "pt_photos_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');

CREATE POLICY "pt_photos_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');
