-- Allow experiences to be owned by a personal trainer instead of (or in addition to) a gym
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS pt_id UUID REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS experiences_pt_id_idx ON public.experiences (pt_id);

-- RLS: PTs can manage their own experiences
CREATE POLICY "PTs manage own experiences"
  ON public.experiences
  FOR ALL
  USING (
    pt_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()
    )
  );

-- experience_bookings.gym_id must be nullable for PT-owned experiences
ALTER TABLE public.experience_bookings
  ALTER COLUMN gym_id DROP NOT NULL;

-- PTs can read bookings for their experiences
CREATE POLICY "PTs read own experience bookings"
  ON public.experience_bookings
  FOR SELECT
  USING (
    experience_id IN (
      SELECT e.id FROM public.experiences e
      JOIN public.personal_trainers pt ON pt.id = e.pt_id
      WHERE pt.user_id = auth.uid()
    )
  );
