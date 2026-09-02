-- Add image URL to PT offerings
ALTER TABLE public.pt_offerings
  ADD COLUMN IF NOT EXISTS image_url TEXT;
