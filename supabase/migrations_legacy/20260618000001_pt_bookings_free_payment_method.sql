-- Allow 'free' as a valid payment method for zero-cost intro sessions
ALTER TABLE pt_bookings
  DROP CONSTRAINT IF EXISTS pt_bookings_payment_method_check,
  ADD CONSTRAINT pt_bookings_payment_method_check
    CHECK (payment_method IN ('credits', 'mpesa', 'wallet', 'free'));
