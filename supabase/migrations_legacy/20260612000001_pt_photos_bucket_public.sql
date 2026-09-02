-- Ensure pt-photos bucket is public.
-- ON CONFLICT DO NOTHING in the original migration silently skipped the
-- public = true update if the bucket already existed as private.
UPDATE storage.buckets
SET public = true
WHERE id = 'pt-photos';
