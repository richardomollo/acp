-- Extend partner_withdrawals with B2C transaction fields
ALTER TABLE public.partner_withdrawals
  ADD COLUMN IF NOT EXISTS originator_conversation_id text,
  ADD COLUMN IF NOT EXISTS conversation_id             text,
  ADD COLUMN IF NOT EXISTS receipt_number              text,
  ADD COLUMN IF NOT EXISTS failure_reason              text,
  ADD COLUMN IF NOT EXISTS completed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS destination_type            text DEFAULT 'MPESA_NUMBER'
                             CHECK (destination_type IN ('MPESA_NUMBER', 'MPESA_PAYBILL'));

-- Allow service role to update withdrawals (for edge function callbacks)
CREATE POLICY "Service role update withdrawals"
  ON public.partner_withdrawals FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Extend pt_payout_requests with B2C transaction fields
ALTER TABLE public.pt_payout_requests
  ADD COLUMN IF NOT EXISTS originator_conversation_id text,
  ADD COLUMN IF NOT EXISTS conversation_id             text,
  ADD COLUMN IF NOT EXISTS receipt_number              text,
  ADD COLUMN IF NOT EXISTS failure_reason              text,
  ADD COLUMN IF NOT EXISTS completed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS destination_type            text DEFAULT 'MPESA_NUMBER'
                             CHECK (destination_type IN ('MPESA_NUMBER', 'MPESA_PAYBILL'));

-- Allow service role to update pt payout requests
CREATE POLICY "Service role update pt payout requests"
  ON public.pt_payout_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Index on conversation_id for fast callback lookup
CREATE INDEX IF NOT EXISTS partner_withdrawals_conv_id_idx ON public.partner_withdrawals (originator_conversation_id);
CREATE INDEX IF NOT EXISTS pt_payout_requests_conv_id_idx  ON public.pt_payout_requests  (originator_conversation_id);
