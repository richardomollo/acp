-- Post-event feedback: a short survey (event rating, would-book-again,
-- app/web booking-experience rating, optional comment) sent a few hours
-- after a session/experience/community event ends, once, via email + push.

-- 1. Platform tracking on bookings, set by the client/route at booking time
-- rather than asked in the survey (self-reported platform is unreliable and
-- costs a question; we already know which app made the request).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.experience_bookings ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.community_event_attendees ADD COLUMN IF NOT EXISTS platform text;

-- 2. Track whether a feedback request has already gone out, separate from
-- whether feedback was actually submitted (a member who ignores the email
-- shouldn't get re-prompted daily).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz;
ALTER TABLE public.experience_bookings ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz;
ALTER TABLE public.community_event_attendees ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz;

-- 3. Feedback table. booking_type + booking_id is a polymorphic reference
-- (no single FK target across three tables) — same shape already used for
-- community_posts.event_id-style loose references elsewhere in this schema.
CREATE TABLE public.feedback (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_type       text        NOT NULL CHECK (booking_type IN ('session', 'experience', 'community_event')),
  booking_id         uuid        NOT NULL,
  user_id            uuid        REFERENCES auth.users(id),
  email              text,
  rating             int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_book_again   boolean,
  platform_rating    int         CHECK (platform_rating BETWEEN 1 AND 5),
  comment            text,
  platform           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_type, booking_id)
);
CREATE INDEX feedback_booking_idx ON public.feedback (booking_type, booking_id);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to feedback" ON public.feedback FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Submission is confirmation-code-gated (same "code as bearer token"
-- pattern used for QR check-in everywhere else in this schema) rather than
-- requiring login, since guest bookings have no user_id to scope RLS to.
-- SECURITY DEFINER so it can read the booking tables (no public SELECT
-- policy needed) purely to verify the code before writing.
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_booking_type text,
  p_booking_id uuid,
  p_confirmation_code text,
  p_rating int,
  p_would_book_again boolean,
  p_platform_rating int,
  p_comment text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_email text;
  v_user_id uuid;
  v_platform text;
BEGIN
  IF p_booking_type = 'session' THEN
    SELECT confirmation_code, COALESCE(guest_email, (SELECT email FROM users WHERE id = bookings.user_id)), user_id, platform
      INTO v_code, v_email, v_user_id, v_platform
      FROM bookings WHERE id = p_booking_id;
  ELSIF p_booking_type = 'experience' THEN
    SELECT confirmation_code, COALESCE(email, (SELECT u.email FROM users u WHERE u.id = experience_bookings.user_id)), user_id, platform
      INTO v_code, v_email, v_user_id, v_platform
      FROM experience_bookings WHERE id = p_booking_id;
  ELSIF p_booking_type = 'community_event' THEN
    SELECT confirmation_code, (SELECT u.email FROM users u WHERE u.id = community_event_attendees.user_id), user_id, platform
      INTO v_code, v_email, v_user_id, v_platform
      FROM community_event_attendees WHERE id = p_booking_id;
  ELSE
    RAISE EXCEPTION 'Invalid booking_type';
  END IF;

  IF v_code IS NULL OR v_code IS DISTINCT FROM p_confirmation_code THEN
    RAISE EXCEPTION 'Invalid confirmation code';
  END IF;

  INSERT INTO public.feedback (booking_type, booking_id, user_id, email, rating, would_book_again, platform_rating, comment, platform)
  VALUES (p_booking_type, p_booking_id, v_user_id, v_email, p_rating, p_would_book_again, p_platform_rating, p_comment, v_platform)
  ON CONFLICT (booking_type, booking_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    would_book_again = EXCLUDED.would_book_again,
    platform_rating = EXCLUDED.platform_rating,
    comment = EXCLUDED.comment;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(text, uuid, text, int, boolean, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text, uuid, text, int, boolean, int, text) TO authenticated, anon;
