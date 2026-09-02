-- Platform-funded discount on experiences: an admin can subsidise part of an
-- event's price so the customer pays less, while the venue/PT partner is
-- still paid out based on the full, undiscounted price. The partner payout
-- calculation (apps/partners revenue.tsx, apps/web pt-dashboard/revenue)
-- reads experience_bookings.deposit_amount, which continues to reflect the
-- FULL price — only the amount actually collected from the customer via
-- STK push is reduced. The platform absorbs the difference.

ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS discount_kes NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (discount_kes >= 0);

COMMENT ON COLUMN public.experiences.discount_kes IS
  'Platform-funded discount in KES, admin-set only. Customer pays price_kes - discount_kes; partner payout is still based on the full price_kes.';

-- Snapshot of the discount actually applied at booking time, so past bookings
-- keep an accurate record even if the experience''s discount changes later.
ALTER TABLE public.experience_bookings
  ADD COLUMN IF NOT EXISTS discount_kes NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (discount_kes >= 0);

COMMENT ON COLUMN public.experience_bookings.discount_kes IS
  'Platform-funded discount applied to this booking''s deposit at the time it was made. amount actually charged to the customer = deposit_amount - discount_kes.';
