import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover | Lana",
  description:
    "Browse gyms, book fitness classes, discover wellness experiences, and connect with personal trainers across Nairobi.",
  openGraph: {
    title: "Discover | Lana",
    description:
      "Browse gyms, book fitness classes, discover wellness experiences and find personal trainers across Nairobi.",
    url: "https://activecitypass.com/sessions",
  },
};

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, viewAllHref }: { eyebrow: string; title: string; viewAllHref: string }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-1">{eyebrow}</p>
        <h2 className="text-2xl font-black text-gray-900">{title}</h2>
      </div>
      <Link
        href={viewAllHref}
        className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0 pb-0.5"
      >
        View all →
      </Link>
    </div>
  );
}

// ─── Gym Card ──────────────────────────────────────────────────────────────────

function GymCard({ gym }: { gym: any }) {
  const img = gym.image_url ? gym.image_url.split(",")[0] : null;
  return (
    <Link
      href={`/venues/${gym.slug ?? gym.id}`}
      className="group flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 156 }}>
        {img ? (
          <img
            src={img}
            alt={gym.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
          {gym.type ?? "Gym"}
        </span>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{gym.name}</p>
        {(gym.area || gym.location) && (
          <p className="text-gray-400 text-xs mt-0.5 truncate">📍 {gym.area ?? gym.location}</p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium">Partner venue</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: any }) {
  const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms;
  const price = session.drop_in_price ?? 0;
  const mon = session.date
    ? new Date(session.date).toLocaleDateString("en-KE", { month: "short" })
    : "";
  const day = session.date ? new Date(session.date).getDate() : 0;

  return (
    <Link
      href={`/sessions/${session.slug ?? session.id}`}
      className="group flex-shrink-0 w-44 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 140 }}>
        {session.image_url ? (
          <img
            src={session.image_url}
            alt={session.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gray-800" />
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
            {session.category ?? "Class"}
          </span>
          {day > 0 && (
            <div className="bg-white rounded-xl px-2 py-1 text-center shadow-sm flex-shrink-0">
              <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wide leading-none">{mon}</div>
              <div className="text-sm font-black text-gray-900 leading-tight">{day}</div>
            </div>
          )}
        </div>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{session.name}</p>
        {gym?.name && <p className="text-gray-400 text-xs italic mt-0.5 truncate">{gym.name}</p>}
        {session.time && <p className="text-gray-400 text-xs mt-1 truncate">{session.time.slice(0, 5)}</p>}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">{price > 0 ? `KES ${price.toLocaleString()}` : "Free"}</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Experience Card ───────────────────────────────────────────────────────────

function ExperienceCard({ experience }: { experience: any }) {
  const gym = Array.isArray(experience.gyms) ? experience.gyms[0] : experience.gyms;
  const mon = experience.date
    ? new Date(experience.date).toLocaleDateString("en-KE", { month: "short" })
    : "";
  const day = experience.date ? new Date(experience.date).getDate() : 0;
  const discount = Number(experience.discount_kes) || 0;
  const hasDiscount = discount > 0 && experience.price_kes;
  const finalPrice = Number(experience.price_kes) - discount;

  return (
    <Link
      href={`/experiences/${experience.slug ?? experience.id}`}
      className="group flex-shrink-0 w-44 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 140 }}>
        {experience.image_url ? (
          <img
            src={experience.image_url}
            alt={experience.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-purple-900" />
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
            {experience.category ?? "Wellness"}
          </span>
          {day > 0 && (
            <div className="bg-white rounded-xl px-2 py-1 text-center shadow-sm flex-shrink-0">
              <div className="text-[9px] font-bold text-purple-600 uppercase tracking-wide leading-none">{mon}</div>
              <div className="text-sm font-black text-gray-900 leading-tight">{day}</div>
            </div>
          )}
        </div>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{experience.name}</p>
        {experience.tagline && (
          <p className="text-gray-400 text-xs mt-0.5 italic truncate">{experience.tagline}</p>
        )}
        {gym?.name && <p className="text-gray-400 text-xs mt-0.5 truncate">{gym.name}</p>}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          {hasDiscount ? (
            <p className="text-sm font-bold text-gray-900 flex items-baseline gap-1">
              <span className="text-gray-400 line-through text-[10px] font-medium">
                KES {Number(experience.price_kes).toLocaleString()}
              </span>
              <span>KES {finalPrice.toLocaleString()}</span>
            </p>
          ) : (
            <p className="text-sm font-bold text-gray-900">
              {experience.price_kes ? `KES ${Number(experience.price_kes).toLocaleString()}` : "Free"}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Trainer Card ──────────────────────────────────────────────────────────────

function TrainerCard({ trainer }: { trainer: any }) {
  const displayName = trainer.professional_name ?? trainer.full_name;
  const specs = Array.isArray(trainer.specialisations)
    ? trainer.specialisations.slice(0, 2).join(" · ")
    : "";

  return (
    <Link
      href={`/trainers/${trainer.slug ?? trainer.id}`}
      className="group flex-shrink-0 w-52 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 172 }}>
        {trainer.photo_url ? (
          <img
            src={trainer.photo_url}
            alt={displayName}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
            <span className="text-4xl font-black text-white/30">{displayName?.[0] ?? "?"}</span>
          </div>
        )}
        {trainer.is_certified_verified && (
          <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-white/92 text-blue-600 text-[10px] font-bold">
            ✓ Verified Pro
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{displayName}</p>
        {specs && <p className="text-gray-400 text-xs mt-0.5 truncate">{specs}</p>}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">
            {trainer.min_price ? `from KES ${Number(trainer.min_price).toLocaleString()}` : "Contact for pricing"}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Community Card ────────────────────────────────────────────────────────────

const COMMUNITY_CATEGORY_LABEL: Record<string, string> = {
  running: "Running", walking: "Walking", cycling: "Cycling", strength: "Strength",
  boxing: "Boxing", yoga: "Yoga", pilates: "Pilates", hiking: "Hiking", dance: "Dance",
  outdoor_fitness: "Outdoor Fitness", football: "Football", other: "Other",
};

const COMMUNITY_FALLBACK_IMAGE =
  "https://kdmhmkwzanqnwehcddvr.supabase.co/storage/v1/object/public/fitpass-images/communities/temp/1786512184762-569kw.jpg";

function CommunityCard({ community }: { community: any }) {
  const img = community.cover_url ?? community.logo_url ?? COMMUNITY_FALLBACK_IMAGE;
  return (
    <Link
      href={`/community/${community.slug ?? community.id}`}
      className="group flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 156 }}>
        <img
          src={img}
          alt={community.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
          {COMMUNITY_CATEGORY_LABEL[community.category] ?? community.category}
        </span>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{community.name}</p>
        {community.location && (
          <p className="text-gray-400 text-xs mt-0.5 truncate">📍 {community.location}</p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium">{community.member_count ?? 0} members</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Community Event Card ──────────────────────────────────────────────────────

function CommunityEventCard({ event }: { event: any }) {
  const community = Array.isArray(event.communities) ? event.communities[0] : event.communities;
  const mon = event.date ? new Date(`${event.date}T00:00:00`).toLocaleDateString("en-KE", { month: "short" }) : "";
  const day = event.date ? new Date(`${event.date}T00:00:00`).getDate() : 0;

  return (
    <Link
      href={`/community/${community?.slug ?? community?.id ?? ""}/event/${event.slug ?? event.id}`}
      className="group flex-shrink-0 w-44 rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow block"
    >
      <div className="relative overflow-hidden" style={{ height: 140 }}>
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-emerald-900" />
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
            {event.event_type === "free" ? "Free" : event.event_type === "paid" ? "Paid" : "Event"}
          </span>
          {day > 0 && (
            <div className="bg-white rounded-xl px-2 py-1 text-center shadow-sm flex-shrink-0">
              <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide leading-none">{mon}</div>
              <div className="text-sm font-black text-gray-900 leading-tight">{day}</div>
            </div>
          )}
        </div>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{event.title}</p>
        {community?.name && <p className="text-gray-400 text-xs italic mt-0.5 truncate">{community.name}</p>}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">
            {event.price_kes ? `KES ${Number(event.price_kes).toLocaleString()}` : "Free"}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Discover Page ─────────────────────────────────────────────────────────────

export default async function DiscoverPage() {
  const todayStr = new Date().toISOString().split("T")[0];

  const [gymsRes, sessRes, expRes, ptRes, communitiesRes, communityEventsRes] = await Promise.all([
    supabase
      .from("gyms")
      .select("id, slug, name, location, area, image_url, type")
      .eq("is_active", true)
      .order("name")
      .limit(8),
    supabase
      .from("sessions")
      .select("id, slug, name, date, time, drop_in_price, image_url, spots_left, category, gyms!gym_id(name)")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(8),
    supabase
      .from("experiences")
      .select("id, slug, name, tagline, date, price_kes, discount_kes, spots_left, image_url, category, gyms(name)")
      .eq("is_active", true)
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(8),
    supabase
      .from("personal_trainers")
      .select("id, slug, full_name, professional_name, photo_url, specialisations, is_certified_verified")
      .eq("status", "approved")
      .limit(8),
    supabase
      .from("communities")
      .select("id, slug, name, location, category, logo_url, cover_url, member_count")
      .eq("review_status", "approved")
      .eq("is_active", true)
      .order("member_count", { ascending: false })
      .limit(8),
    supabase
      .from("community_events")
      .select("id, slug, title, date, event_type, price_kes, image_url, communities(id, slug, name)")
      .eq("status", "active")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(8),
  ]);

  // Enrich trainers with min offering price
  const rawTrainers: any[] = ptRes.data ?? [];
  let trainers: any[] = rawTrainers;
  if (rawTrainers.length) {
    const ptIds = rawTrainers.map((t: any) => t.id);
    const { data: pricesData } = await supabase
      .from("pt_offerings")
      .select("pt_id, price_kes")
      .in("pt_id", ptIds)
      .eq("is_active", true)
      .eq("is_draft", false);
    trainers = rawTrainers.map((pt: any) => {
      const prices = (pricesData ?? [])
        .filter((o: any) => o.pt_id === pt.id)
        .map((o: any) => o.price_kes)
        .filter(Boolean) as number[];
      return { ...pt, min_price: prices.length ? Math.min(...prices) : null };
    });
  }

  const scrollRow = "flex gap-4 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:-mx-6 sm:px-6";

  return (
    <div className="bg-white min-h-screen">

      {/* Hero */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
            Discover · Nairobi
          </p>
          <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
            Everything fitness,<br className="hidden sm:block" /> all in one place.
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
            Browse gyms, book classes, discover wellness experiences, and connect with personal
            trainers — all across Nairobi.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-14">

        {/* Gyms and Studios */}
        <section>
          <SectionHeader eyebrow="Partner venues" title="Gyms and Studios" viewAllHref="/venues" />
          <div className={scrollRow}>
            {(gymsRes.data ?? []).map((gym: any) => <GymCard key={gym.id} gym={gym} />)}
            {!gymsRes.data?.length && <p className="text-gray-400 text-sm py-4">No venues found.</p>}
          </div>
        </section>

        {/* Classes and Sessions */}
        <section>
          <SectionHeader eyebrow="Upcoming classes" title="Classes and sessions" viewAllHref="/classes" />
          <div className={scrollRow}>
            {(sessRes.data ?? []).map((s: any) => <SessionCard key={s.id} session={s} />)}
            {!sessRes.data?.length && <p className="text-gray-400 text-sm py-4">No upcoming sessions.</p>}
          </div>
        </section>

        {/* Wellness Experiences */}
        <section>
          <SectionHeader eyebrow="Curated experiences" title="Wellness experiences" viewAllHref="/experiences" />
          <div className={scrollRow}>
            {(expRes.data ?? []).map((e: any) => <ExperienceCard key={e.id} experience={e} />)}
            {!expRes.data?.length && <p className="text-gray-400 text-sm py-4">No upcoming experiences.</p>}
          </div>
        </section>

        {/* Trainers, Coaches and Nutritionists */}
        <section>
          <SectionHeader
            eyebrow="Personal training"
            title="Trainers, coaches and nutritionists"
            viewAllHref="/trainers"
          />
          <div className={scrollRow}>
            {trainers.map((t: any) => <TrainerCard key={t.id} trainer={t} />)}
            {!trainers.length && <p className="text-gray-400 text-sm py-4">No trainers found.</p>}
          </div>
        </section>

        {/* Communities and Clubs */}
        <section>
          <SectionHeader eyebrow="Find your people" title="Communities and clubs" viewAllHref="/community" />
          <div className={scrollRow}>
            {(communitiesRes.data ?? []).map((c: any) => <CommunityCard key={c.id} community={c} />)}
            {!communitiesRes.data?.length && <p className="text-gray-400 text-sm py-4">No communities found.</p>}
          </div>
        </section>

        {/* Community Events */}
        <section>
          <SectionHeader eyebrow="Show up" title="Community events" viewAllHref="/community" />
          <div className={scrollRow}>
            {(communityEventsRes.data ?? []).map((e: any) => <CommunityEventCard key={e.id} event={e} />)}
            {!communityEventsRes.data?.length && <p className="text-gray-400 text-sm py-4">No upcoming community events.</p>}
          </div>
        </section>

      </div>
    </div>
  );
}
