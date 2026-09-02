-- Expand destination_type to support bank transfers and make phone nullable

ALTER TABLE public.partner_withdrawals
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS account_number  text,
  ADD COLUMN IF NOT EXISTS business_number text,
  ADD COLUMN IF NOT EXISTS bank_name       text;

ALTER TABLE public.partner_withdrawals
  DROP CONSTRAINT IF EXISTS partner_withdrawals_destination_type_check;
ALTER TABLE public.partner_withdrawals
  ADD CONSTRAINT partner_withdrawals_destination_type_check
    CHECK (destination_type IN ('MPESA_NUMBER', 'MPESA_PAYBILL', 'BANK'));

ALTER TABLE public.pt_payout_requests
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS account_number  text,
  ADD COLUMN IF NOT EXISTS business_number text,
  ADD COLUMN IF NOT EXISTS bank_name       text;

ALTER TABLE public.pt_payout_requests
  DROP CONSTRAINT IF EXISTS pt_payout_requests_destination_type_check;
ALTER TABLE public.pt_payout_requests
  ADD CONSTRAINT pt_payout_requests_destination_type_check
    CHECK (destination_type IN ('MPESA_NUMBER', 'MPESA_PAYBILL', 'BANK'));
