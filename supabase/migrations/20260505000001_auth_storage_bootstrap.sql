-- =============================================================================
-- ACP baseline companion — non-`public` schema objects.
--
-- The baseline (20260505000000) is a `supabase db dump --schema public`, which
-- by construction cannot include objects that live in the `auth` or `storage`
-- schemas. This migration re-creates the ones ACP depends on. Every statement
-- is idempotent and matches what production already has, so it is safe to apply
-- anywhere.
--
--   1. auth.users AFTER INSERT trigger -> public.handle_new_user()
--      (originally supabase/migrations_legacy/20260506000001_trial_provisioning.sql;
--       handle_new_user() itself is a public function and IS in the baseline).
--   2. storage buckets  fitpass-images, pt-photos  (both public read)
--      + their storage.objects RLS policies
--      (originally migrations_legacy/20260607000005, /20260526000001,
--       /20260612000001, /20260627000001).
-- =============================================================================

-- 1. Signup provisioning trigger ------------------------------------------------
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- 2. Storage buckets ----------------------------------------------------------
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('fitpass-images', 'fitpass-images', true, 10485760,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT ("id") DO UPDATE SET "public" = true;

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('pt-photos', 'pt-photos', true, 5242880,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT ("id") DO UPDATE SET "public" = true;

-- Storage RLS policies (public read; authenticated write) for both buckets.
DROP POLICY IF EXISTS "fitpass_images_public_read"   ON "storage"."objects";
DROP POLICY IF EXISTS "fitpass_images_auth_insert"   ON "storage"."objects";
DROP POLICY IF EXISTS "fitpass_images_auth_update"   ON "storage"."objects";
DROP POLICY IF EXISTS "fitpass_images_auth_delete"   ON "storage"."objects";
DROP POLICY IF EXISTS "pt_photos_public_read"           ON "storage"."objects";
DROP POLICY IF EXISTS "pt_photos_authenticated_insert"  ON "storage"."objects";
DROP POLICY IF EXISTS "pt_photos_authenticated_update"  ON "storage"."objects";
DROP POLICY IF EXISTS "pt_photos_authenticated_delete"  ON "storage"."objects";

CREATE POLICY "fitpass_images_public_read"  ON "storage"."objects" FOR SELECT
  USING (bucket_id = 'fitpass-images');
CREATE POLICY "fitpass_images_auth_insert"  ON "storage"."objects" FOR INSERT
  WITH CHECK (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');
CREATE POLICY "fitpass_images_auth_update"  ON "storage"."objects" FOR UPDATE
  USING (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');
CREATE POLICY "fitpass_images_auth_delete"  ON "storage"."objects" FOR DELETE
  USING (bucket_id = 'fitpass-images' AND auth.role() = 'authenticated');

CREATE POLICY "pt_photos_public_read"          ON "storage"."objects" FOR SELECT
  USING (bucket_id = 'pt-photos');
CREATE POLICY "pt_photos_authenticated_insert" ON "storage"."objects" FOR INSERT
  WITH CHECK (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');
CREATE POLICY "pt_photos_authenticated_update" ON "storage"."objects" FOR UPDATE
  USING (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');
CREATE POLICY "pt_photos_authenticated_delete" ON "storage"."objects" FOR DELETE
  USING (bucket_id = 'pt-photos' AND auth.role() = 'authenticated');
