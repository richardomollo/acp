CREATE TABLE IF NOT EXISTS public.mpesa_c2b_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trans_id TEXT UNIQUE NOT NULL,
  trans_amount NUMERIC(12, 2) NOT NULL,
  bill_ref_number TEXT NOT NULL,
  msisdn TEXT,
  trans_time TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  business_short_code TEXT,
  used_at TIMESTAMPTZ,
  booking_id UUID,
  experience_booking_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mpesa_c2b_transactions ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — only service role writes/reads this table
