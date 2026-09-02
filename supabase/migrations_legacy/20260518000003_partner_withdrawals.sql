CREATE TABLE IF NOT EXISTS public.partner_withdrawals (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          uuid         NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  partner_email   text         NOT NULL,
  amount          numeric(10, 2) NOT NULL CHECK (amount > 0),
  method          text         NOT NULL CHECK (method IN ('mpesa', 'bank')),
  phone           text,
  bank_name       text,
  account_number  text,
  account_name    text,
  status          text         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reference       text,
  notes           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own withdrawals"
  ON public.partner_withdrawals FOR SELECT
  USING (partner_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Partners create withdrawals"
  ON public.partner_withdrawals FOR INSERT
  WITH CHECK (partner_email = (auth.jwt() ->> 'email'));

CREATE INDEX partner_withdrawals_gym_id_idx ON public.partner_withdrawals (gym_id);
CREATE INDEX partner_withdrawals_email_idx  ON public.partner_withdrawals (partner_email);
