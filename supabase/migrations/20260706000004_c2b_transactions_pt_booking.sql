ALTER TABLE public.mpesa_c2b_transactions
  ADD COLUMN IF NOT EXISTS pt_booking_id UUID REFERENCES public.pt_bookings(id);
