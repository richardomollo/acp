-- ─── Cancellation & Rescheduling System ─────────────────────────────────────
-- Adds proper cancellation tracking, refund records, and reschedule support
-- to the ACP booking system.
--
-- Business rule: full refund if cancelled > 24 h before session start.
-- Default cutoff is 24 h (changed from the old 2 h default on gyms).

-- ── 1. bookings: new columns ──────────────────────────────────────────────────

ALTER TABLE bookings
  -- Who initiated the cancellation
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('customer', 'partner', 'admin', 'system')),

  -- Refund lifecycle
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),

  -- Rescheduling
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_booking_id UUID REFERENCES bookings(id),
  ADD COLUMN IF NOT EXISTS rescheduled_to_booking_id UUID REFERENCES bookings(id);

-- New status values in use (existing statuses remain valid for old rows):
--   cancelled_by_customer  – customer cancelled > 24 h before
--   cancelled_by_partner   – partner cancelled (always full refund)
--   rescheduled            – booking moved to a new slot

-- Update gyms default: ACP policy is 24 h (was previously 2 h)
ALTER TABLE gyms
  ALTER COLUMN cancellation_cutoff_hours SET DEFAULT 24;

-- Back-fill existing gyms that still have the old 2-h default
UPDATE gyms
  SET cancellation_cutoff_hours = 24
  WHERE cancellation_cutoff_hours = 2;

-- ── 2. refund_transactions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refund_transactions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_provider   TEXT        NOT NULL DEFAULT 'mpesa',
  provider_reference TEXT,                        -- M-Pesa B2C transaction ID when processed
  amount             NUMERIC(10,2) NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  notes              TEXT,
  processed_by       TEXT,                        -- admin email who approved
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;

-- Customers can see refunds for their own bookings
CREATE POLICY "refund_transactions: users view own"
  ON refund_transactions FOR SELECT
  USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id = auth.uid()
    )
  );

-- ── 3. partner_cancellation_metrics view ──────────────────────────────────────

CREATE OR REPLACE VIEW partner_cancellation_metrics AS
SELECT
  b.gym_id,
  g.name                                                                AS gym_name,
  COUNT(*)                                                              AS total_bookings,
  COUNT(*) FILTER (WHERE b.cancelled_by = 'partner')                   AS partner_cancellations,
  COUNT(*) FILTER (WHERE b.cancelled_by = 'customer')                  AS customer_cancellations,
  COUNT(*) FILTER (WHERE b.status = 'no_show')                         AS no_shows,
  ROUND(
    COUNT(*) FILTER (WHERE b.cancelled_by = 'partner')::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                                     AS partner_cancellation_rate_pct
FROM bookings b
JOIN gyms g ON g.id = b.gym_id
GROUP BY b.gym_id, g.name;
