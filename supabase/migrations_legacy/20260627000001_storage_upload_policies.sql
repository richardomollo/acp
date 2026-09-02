-- Allow authenticated users to upload/update PT photos
CREATE POLICY "authenticated can insert pt-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pt-photos');

CREATE POLICY "authenticated can update pt-photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pt-photos');

-- Allow authenticated users to upload/update fitpass images
CREATE POLICY "authenticated can insert fitpass-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fitpass-images');

CREATE POLICY "authenticated can update fitpass-images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'fitpass-images');
