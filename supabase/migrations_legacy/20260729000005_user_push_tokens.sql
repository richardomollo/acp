-- Expo push tokens for the consumer mobile app, so server-side events (a
-- trainer assigning a task or workout) can reach a user's device even when
-- the app isn't open — mirrors apps/partners' partner_push_tokens table/shape.
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token   text        NOT NULL UNIQUE,
  device_id         text,
  platform          text,
  active            boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON public.user_push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX user_push_tokens_user_id_idx ON public.user_push_tokens (user_id);
