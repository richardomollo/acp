-- Support the paid-event booking flow (book-community-event edge function):
-- the attendee row is created immediately in 'pending_payment' (mirroring
-- bookings/experience_bookings' lifecycle), then flipped to 'going' by
-- mpesa-callback once the STK push succeeds. 'pending_payment' rows don't
-- count against capacity — only add the status value here, the existing
-- enforce_event_capacity() trigger already guards on `NEW.status != 'going'`.
ALTER TABLE public.community_event_attendees DROP CONSTRAINT community_event_attendees_status_check;
ALTER TABLE public.community_event_attendees
  ADD CONSTRAINT community_event_attendees_status_check
  CHECK (status IN ('pending_payment', 'going', 'cancelled', 'waitlisted'));

-- Re-run capacity enforcement when a pending_payment row is confirmed to
-- 'going' by the payment callback, not just on the original INSERT.
DROP TRIGGER IF EXISTS community_event_attendees_capacity ON public.community_event_attendees;
CREATE TRIGGER community_event_attendees_capacity
  BEFORE INSERT OR UPDATE OF status ON public.community_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();
