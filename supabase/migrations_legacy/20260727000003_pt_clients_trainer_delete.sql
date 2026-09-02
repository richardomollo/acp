-- Let a trainer cancel an invite they sent (or, symmetrically with the
-- client-side delete policy already in place, remove any of their own
-- roster rows) — there was previously no way to undo a mis-sent invite or
-- an unredeemed code.

CREATE POLICY "Trainers remove own roster rows"
  ON public.pt_clients FOR DELETE
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));
