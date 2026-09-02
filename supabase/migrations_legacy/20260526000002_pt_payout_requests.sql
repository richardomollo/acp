CREATE TABLE IF NOT EXISTS public.pt_payout_requests (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id           uuid           NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  amount          numeric(10, 2) NOT NULL CHECK (amount > 0),
  method          text           NOT NULL CHECK (method IN ('mpesa', 'bank')),
  phone           text,
  bank_name       text,
  account_number  text,
  account_name    text,
  status          text           NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reference       text,
  notes           text,
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.pt_payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PTs view own payout requests"
  ON public.pt_payout_requests FOR SELECT
  USING (pt_id IN (
    SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()
  ));

CREATE POLICY "PTs create payout requests"
  ON public.pt_payout_requests FOR INSERT
  WITH CHECK (pt_id IN (
    SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()
  ));

CREATE INDEX pt_payout_requests_pt_idx ON public.pt_payout_requests (pt_id);
