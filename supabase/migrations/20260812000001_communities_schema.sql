-- Communities feature (Phase 1 MVP): communities, membership/follow, events,
-- RSVP/attendance, and a lightweight post feed. See the approved architecture
-- plan for full context — in short: reuses the personal_trainers approval-queue
-- pattern (review_status), the pt_clients/gym_trainer_clients dual-sided-roster
-- RLS shape (community_members), and experience_bookings' flat-payment-columns
-- shape for paid events with no underlying `sessions` row (community_event_attendees).

-- ══════════════════════════════════════════════════════════════════════════
-- communities
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.communities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  slug             text        UNIQUE,
  description      text,
  category         text        NOT NULL CHECK (category IN (
                     'running','walking','cycling','strength','boxing','yoga',
                     'pilates','hiking','dance','outdoor_fitness','football','other')),
  location         text,
  logo_url         text,
  cover_url        text,
  community_type   text        NOT NULL DEFAULT 'open' CHECK (community_type IN ('open','approval_required')),
  review_status    text        NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  rejection_reason text,
  -- Phase 3 corporate-communities hook: inert for MVP, not referenced by any RLS policy below.
  visibility       text        NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  owner_user_id    uuid        NOT NULL REFERENCES auth.users(id),
  member_count     int         NOT NULL DEFAULT 0,
  social_links     jsonb,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX communities_category_idx      ON public.communities (category);
CREATE INDEX communities_review_status_idx ON public.communities (review_status);
CREATE INDEX communities_owner_idx         ON public.communities (owner_user_id);

-- Slug auto-gen — same collision-loop shape as generate_pt_slug() (20260524000001).
CREATE OR REPLACE FUNCTION public.generate_community_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  counter   int := 0;
BEGIN
  base_slug := trim(both '-' from regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
  candidate := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.communities WHERE slug = candidate AND id != NEW.id);
    counter   := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_community_slug
  BEFORE INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.generate_community_slug();

CREATE TRIGGER communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════
-- community_members
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.community_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','removed')),
  joined_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX community_members_user_idx           ON public.community_members (user_id);
CREATE INDEX community_members_community_role_idx ON public.community_members (community_id, role);

-- Owner-membership bootstrap — same AFTER INSERT SECURITY DEFINER trigger shape
-- as upsert_pt_client() (20260726000001). Runs in the same transaction as the
-- communities INSERT, so community creation needs no edge function.
CREATE OR REPLACE FUNCTION public.create_owner_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, role, status, joined_at)
  VALUES (NEW.id, NEW.owner_user_id, 'owner', 'active', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER communities_create_owner_membership
  AFTER INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.create_owner_membership();

-- member_count denorm: recount-on-write. New pattern for this repo (no existing
-- trigger-counter precedent) — correctness over micro-optimization, community
-- member counts are never large enough for COUNT(*)-on-write to matter.
CREATE OR REPLACE FUNCTION public.recount_community_members()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE cid uuid := COALESCE(NEW.community_id, OLD.community_id);
BEGIN
  UPDATE public.communities
  SET member_count = (SELECT count(*) FROM public.community_members WHERE community_id = cid AND status = 'active')
  WHERE id = cid;
  RETURN NULL;
END;
$$;

CREATE TRIGGER community_members_recount
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.recount_community_members();

-- ══════════════════════════════════════════════════════════════════════════
-- community_follows — independent of membership, no cascade logic either way
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.community_follows (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX community_follows_user_idx ON public.community_follows (user_id);

-- ══════════════════════════════════════════════════════════════════════════
-- community_events
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.community_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  description       text,
  event_type        text        NOT NULL CHECK (event_type IN ('free','paid','partner_session','external')),
  -- Same vocabulary as communities.category, not activities.activity_type (too
  -- narrow — that enum was built for Strava data, missing boxing/yoga/dance/etc).
  activity_type     text        CHECK (activity_type IN (
                      'running','walking','cycling','strength','boxing','yoga',
                      'pilates','hiking','dance','outdoor_fitness','football','other')),
  difficulty        text        CHECK (difficulty IN ('beginner','intermediate','advanced')),
  date              date        NOT NULL,
  start_time        time        NOT NULL,
  end_time          time,
  location          text        NOT NULL,
  gym_id            uuid        REFERENCES public.gyms(id),
  session_id        uuid        REFERENCES public.sessions(id),
  external_url      text,
  distance_km       numeric,
  capacity          int,
  price_kes         numeric,
  organiser_user_id uuid        REFERENCES auth.users(id),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type != 'partner_session' OR (gym_id IS NOT NULL AND session_id IS NOT NULL)),
  CHECK (event_type != 'external' OR external_url IS NOT NULL),
  CHECK (event_type != 'paid' OR (price_kes IS NOT NULL AND price_kes > 0))
);

CREATE INDEX community_events_community_date_idx ON public.community_events (community_id, date);
CREATE INDEX community_events_gym_idx             ON public.community_events (gym_id);
CREATE INDEX community_events_session_idx         ON public.community_events (session_id);

CREATE TRIGGER community_events_updated_at
  BEFORE UPDATE ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════
-- community_event_attendees — RSVP + booking + attendance in one row (one
-- activity, multiple related fields, per the no-double-counting principle).
-- booking_id is ONLY for partner_session (a real bookings row exists there —
-- bookings.session_id is NOT NULL so it can't represent a standalone paid
-- community event). Paid events get flat payment columns mirroring
-- experience_bookings exactly, written only by the book-community-event edge
-- function (service-role — see the RLS policy below).
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.community_event_attendees (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid        NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES auth.users(id),
  status              text        NOT NULL DEFAULT 'going' CHECK (status IN ('going','cancelled','waitlisted')),
  booking_id          uuid        REFERENCES public.bookings(id),
  session_price       numeric(12,2),
  deposit_pct         numeric(5,2),
  deposit_amount      numeric(12,2),
  remainder_amount    numeric(12,2),
  payment_phone       text,
  deposit_paid_at     timestamptz,
  deposit_payment_id  text,
  confirmation_code   text,
  qr_payload          text,
  checked_in          boolean     NOT NULL DEFAULT false,
  check_in_time       timestamptz,
  -- Phase 2 hook (Strava/activity linkage) — unpopulated in MVP.
  activity_id         uuid        REFERENCES public.activities(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX community_event_attendees_event_idx ON public.community_event_attendees (event_id);
CREATE INDEX community_event_attendees_user_idx  ON public.community_event_attendees (user_id);

CREATE TRIGGER community_event_attendees_updated_at
  BEFORE UPDATE ON public.community_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Capacity enforcement: deterministic, not a race-prone app-level check-then-insert.
CREATE OR REPLACE FUNCTION public.enforce_event_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cap         int;
  going_count int;
BEGIN
  IF NEW.status != 'going' THEN RETURN NEW; END IF;
  SELECT capacity INTO cap FROM public.community_events WHERE id = NEW.event_id;
  IF cap IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO going_count FROM public.community_event_attendees WHERE event_id = NEW.event_id AND status = 'going';
  IF going_count >= cap THEN NEW.status := 'waitlisted'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_event_attendees_capacity
  BEFORE INSERT ON public.community_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();

-- ══════════════════════════════════════════════════════════════════════════
-- community_posts — lightweight announcement/event-update/member-post feed
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.community_posts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_user_id uuid        NOT NULL REFERENCES auth.users(id),
  post_type      text        NOT NULL CHECK (post_type IN ('announcement','event_update','community_post')),
  event_id       uuid        REFERENCES public.community_events(id),
  body           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_posts_feed_idx  ON public.community_posts (community_id, created_at DESC);
CREATE INDEX community_posts_event_idx ON public.community_posts (event_id);

-- ══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ══════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER helper (same pattern as public.is_admin()) — required
-- because a plain "EXISTS (SELECT 1 FROM community_members WHERE ...)" inside
-- community_members' OWN policies causes "infinite recursion detected in
-- policy for relation community_members" (Postgres re-evaluates that table's
-- RLS policies for the subquery itself). SECURITY DEFINER runs as the owning
-- role, which bypasses RLS on the table it queries — same reason is_admin()
-- can safely query public.users from within users-adjacent policies.
CREATE OR REPLACE FUNCTION public.is_community_admin(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id AND user_id = auth.uid() AND role IN ('owner','admin') AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_community_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid) TO authenticated;

ALTER TABLE public.communities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_follows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts          ENABLE ROW LEVEL SECURITY;

-- ── communities ──────────────────────────────────────────────────────────
CREATE POLICY "Public read approved active communities"
  ON public.communities FOR SELECT
  USING (review_status = 'approved' AND is_active = true);

CREATE POLICY "Owners/admins view and manage own community"
  ON public.communities FOR ALL
  USING (public.is_community_admin(id))
  WITH CHECK (public.is_community_admin(id));

-- Belt-and-suspenders alongside the is_community_admin()-based policy above:
-- PostgREST's INSERT ... RETURNING (i.e. any .insert().select() call) requires
-- a SELECT policy to pass for the just-inserted row, evaluated before the
-- AFTER INSERT create_owner_membership trigger has run — so at that instant
-- there's no community_members row yet for is_community_admin() to find. This
-- policy checks owner_user_id directly (no trigger dependency), so it always
-- works, including on the very first insert.
CREATE POLICY "Owner views and manages own community by ownership"
  ON public.communities FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Anyone can self-serve create a community"
  ON public.communities FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Admins have full access to communities"
  ON public.communities FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── community_members ────────────────────────────────────────────────────
CREATE POLICY "Owners/admins view their community roster"
  ON public.community_members FOR SELECT
  USING (public.is_community_admin(community_id));

CREATE POLICY "Owners/admins manage their community roster"
  ON public.community_members FOR UPDATE
  USING (public.is_community_admin(community_id));

CREATE POLICY "Owners/admins remove roster rows"
  ON public.community_members FOR DELETE
  USING (public.is_community_admin(community_id));

CREATE POLICY "Members view own membership rows"
  ON public.community_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users self-serve join open or request approval_required communities"
  ON public.community_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND role = 'member' AND
    (
      (status = 'active'  AND EXISTS (SELECT 1 FROM public.communities WHERE id = community_id AND community_type = 'open' AND review_status = 'approved'))
      OR
      (status = 'pending' AND EXISTS (SELECT 1 FROM public.communities WHERE id = community_id AND community_type = 'approval_required' AND review_status = 'approved'))
    )
  );

CREATE POLICY "Members leave own community"
  ON public.community_members FOR DELETE
  USING (user_id = auth.uid() AND role = 'member');

CREATE POLICY "Admins have full access to community_members"
  ON public.community_members FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── community_follows ────────────────────────────────────────────────────
CREATE POLICY "Users manage own follows"
  ON public.community_follows FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Public read follow counts"
  ON public.community_follows FOR SELECT USING (true);

-- ── community_events ─────────────────────────────────────────────────────
CREATE POLICY "Public read active events of approved communities"
  ON public.community_events FOR SELECT
  USING (status = 'active' AND EXISTS (
    SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.review_status = 'approved' AND c.is_active = true));

CREATE POLICY "Owners/admins manage own community's events"
  ON public.community_events FOR ALL
  USING (public.is_community_admin(community_id))
  WITH CHECK (public.is_community_admin(community_id));

CREATE POLICY "Admins have full access to community_events"
  ON public.community_events FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── community_event_attendees ────────────────────────────────────────────
CREATE POLICY "Users view own RSVPs"
  ON public.community_event_attendees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Organisers view attendees of their own events"
  ON public.community_event_attendees FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = event_id AND public.is_community_admin(e.community_id)));

-- Free/partner_session only: paid events are written by the service-role edge
-- function below (money moves), partner_session's booking_id proves payment
-- already happened via the existing gym-session checkout flow.
CREATE POLICY "Users self-serve RSVP to free/partner_session events"
  ON public.community_event_attendees FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND checked_in = false AND
    EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = event_id AND e.event_type IN ('free','partner_session'))
  );

-- WITH CHECK forces checked_in to stay false on self-updates — the organiser
-- UPDATE policy below is the only path that can ever set it true.
CREATE POLICY "Users update/cancel own RSVP"
  ON public.community_event_attendees FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND checked_in = false AND status IN ('going','cancelled'));

CREATE POLICY "Organisers check in / manage attendees of their own events"
  ON public.community_event_attendees FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = event_id AND public.is_community_admin(e.community_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = event_id AND public.is_community_admin(e.community_id)));

CREATE POLICY "Service role manages paid event attendee payment rows"
  ON public.community_event_attendees FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins have full access to community_event_attendees"
  ON public.community_event_attendees FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── community_posts ──────────────────────────────────────────────────────
CREATE POLICY "Public read posts of approved communities"
  ON public.community_posts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.review_status = 'approved' AND c.is_active = true));

CREATE POLICY "Owners/admins post announcements and event updates"
  ON public.community_posts FOR INSERT
  WITH CHECK (author_user_id = auth.uid() AND public.is_community_admin(community_id));

CREATE POLICY "Members post community_post type"
  ON public.community_posts FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid() AND post_type = 'community_post' AND
    EXISTS (SELECT 1 FROM public.community_members
            WHERE community_id = community_posts.community_id AND user_id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Authors delete own posts"
  ON public.community_posts FOR DELETE USING (author_user_id = auth.uid());

CREATE POLICY "Owners/admins delete any post in their community"
  ON public.community_posts FOR DELETE
  USING (public.is_community_admin(community_id));

CREATE POLICY "Admins have full access to community_posts"
  ON public.community_posts FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
