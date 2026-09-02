-- Auto-link a booking to a gym_programme_enrollments row when the booked
-- session is a programme's designated intro session.
--
-- The plan originally assumed a client-side "link_intro" call after booking
-- (mirroring PtOfferingBookButton, which uses a bespoke BookingModal with an
-- onConfirmed callback). But the intro session here is booked through the
-- generic session BookButton, which for paid sessions just redirects to
-- /checkout and never returns to a page that could make that call — so
-- client-side linking would silently miss every paid intro booking. A DB
-- trigger on bookings fires uniformly regardless of free/paid or how the
-- booking was made (web, mobile, guest), and this codebase already has the
-- identical shape for pt_programme_enrollments -> pt_clients
-- (upsert_pt_client(), 20260726000001_pt_clients_workout_assignment.sql).
CREATE OR REPLACE FUNCTION public.gym_programme_link_intro() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_programme RECORD;
BEGIN
  SELECT id, gym_id INTO v_programme FROM public.gym_programmes WHERE intro_session_id = NEW.session_id LIMIT 1;
  IF v_programme.id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.gym_programme_enrollments WHERE intro_booking_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.gym_programme_enrollments
    (programme_id, gym_id, user_id, guest_name, guest_email, guest_phone, intro_booking_id, status)
  VALUES
    (v_programme.id, v_programme.gym_id, NEW.user_id, NEW.guest_name, NEW.guest_email, NEW.guest_phone, NEW.id, 'intro_booked');

  RETURN NEW;
END;
$$;

CREATE TRIGGER gym_programme_link_intro_trigger
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.gym_programme_link_intro();
