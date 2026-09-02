-- bookings.credits_used is NOT NULL with no default, but neither of the
-- web checkout paths (book-session / guest-book-session edge functions)
-- have ever supplied it -- every insert from those functions was failing
-- with "null value in column credits_used violates not-null constraint".
-- Only 1 booking was created via any web path in the last 7 days, so this
-- was already silently breaking session bookings in production before
-- today's free-booking work surfaced it. credits_used only has a nonzero
-- value when a booking is paid for with subscription credits (a separate,
-- unrelated flow); 0 is the correct default for every other path.

ALTER TABLE public.bookings ALTER COLUMN credits_used SET DEFAULT 0;
