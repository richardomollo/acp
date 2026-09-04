import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import RsvpEventButton from "./RsvpEventButton";
import CommunityEventShareBar from "./CommunityEventShareBar";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DIFFICULTY_LABEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ slug: string; eventId: string }> };

async function fetchEvent(eventId: string) {
  const col = UUID_RE.test(eventId) ? "id" : "slug";
  const { data } = await supabase
    .from("community_events")
    .select("*, communities(id, slug, name, logo_url, category, description)")
    .eq(col, eventId)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventId } = await params;
  const event = await fetchEvent(eventId);
  if (!event) return { title: "Community Event" };

  const community = Array.isArray(event.communities) ? event.communities[0] : event.communities;
  const title = `${event.title}${community?.name ? ` · ${community.name}` : ""}`;
  const description = event.description ??
    `Join "${event.title}" on ${new Date(`${event.date}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Lana Health`,
      description,
      url: `https://activecitypass.com/community/${community?.slug ?? community?.id}/event/${event.slug ?? event.id}`,
      ...(event.image_url ? { images: [{ url: event.image_url, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(event.image_url ? { images: [event.image_url] } : {}),
    },
  };
}

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (t: string) => t.slice(0, 5);

export default async function CommunityEventDetailPage({ params }: Props) {
  const { eventId } = await params;
  const event = await fetchEvent(eventId);
  if (!event) return notFound();

  const community = Array.isArray(event.communities) ? event.communities[0] : event.communities;

  // community_event_attendees has no public-read RLS policy (only own row /
  // organiser), so a direct count() query gets silently filtered to what the
  // viewer themselves can see — get_event_attendees() is a SECURITY DEFINER
  // RPC that correctly returns the full public list regardless of viewer.
  const { data: attendees } = await supabase.rpc("get_event_attendees", { p_event_id: event.id });
  const goingCount = attendees?.length ?? 0;

  const isFull = event.capacity != null && goingCount >= event.capacity;

  const cta = (
    event.status !== "active" ? (
      <p className="text-sm text-red-600 font-semibold">This event has been cancelled.</p>
    ) : event.event_type === "free" ? (
      <RsvpEventButton eventId={event.id} isFull={isFull} className="block sm:inline-block text-center px-5 py-3.5 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60 w-full sm:w-auto" />
    ) : event.event_type === "paid" ? (
      isFull ? (
        <button disabled className="w-full sm:w-auto px-4 py-3 text-sm rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">Event Full</button>
      ) : (
        <Link href={`/checkout?type=community_event&id=${event.id}`} className="block sm:inline-block text-center px-5 py-3.5 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition w-full sm:w-auto">
          Book — KES {Number(event.price_kes).toLocaleString()}
        </Link>
      )
    ) : event.event_type === "external" ? (
      <a href={event.external_url} target="_blank" rel="noopener noreferrer" className="block sm:inline-block text-center px-5 py-3.5 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition w-full sm:w-auto">
        Register externally
      </a>
    ) : (
      <Link href="/classes" className="block sm:inline-block text-center px-5 py-3.5 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition w-full sm:w-auto">
        Book via Classes
      </Link>
    )
  );

  return (
    <div className="w-full px-4 sm:px-6 py-6 sm:py-10 max-w-7xl mx-auto">
      <Link href={`/community/${community?.slug ?? community?.id}`} className="text-sm text-gray-500 hover:underline mb-5 inline-block">
        ← Back to {community?.name ?? "Community"}
      </Link>

      <div className="flex flex-col md:flex-row gap-6 md:gap-10 md:items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">
          {event.image_url ? (
            <img src={event.image_url} alt={event.title} className="w-full h-48 sm:h-64 object-cover rounded-2xl mb-5" />
          ) : (
            <div className="w-full h-48 sm:h-64 rounded-2xl mb-5 bg-gradient-to-br from-emerald-800 to-emerald-500 flex items-center justify-center">
              <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-1">
            {(event.activity_type ?? "").replace("_", " ")}{community?.name ? ` · ${community.name}` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{event.title}</h1>

          {/* Detail pills */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Date</p>
              <p className="font-medium text-gray-900">{fmtDate(event.date)}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Time</p>
              <p className="font-medium text-gray-900">
                {fmtTime(event.start_time)}{event.end_time ? ` – ${fmtTime(event.end_time)}` : ""}
              </p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Location</p>
              <p className="font-medium text-gray-900">{event.location}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Going</p>
              <p className={`font-medium ${isFull ? "text-red-500" : "text-green-600"}`}>
                {goingCount}{event.capacity ? ` / ${event.capacity}` : ""}
              </p>
            </div>
            {event.event_type === "paid" && (
              <div className="text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Price</p>
                <p className="font-bold text-gray-900 text-base">KES {Number(event.price_kes).toLocaleString()}</p>
              </div>
            )}
          </div>

          {event.difficulty && (
            <p className="text-sm text-gray-500 mb-6">Difficulty: <span className="font-semibold text-gray-900">{DIFFICULTY_LABEL[event.difficulty] ?? event.difficulty}</span></p>
          )}

          {/* Description */}
          {event.description && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-2">About this event</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
            </div>
          )}

          {/* Who's going */}
          {(attendees ?? []).length > 0 && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Who&apos;s going</h2>
              <div className="flex flex-wrap gap-4">
                {(attendees ?? []).slice(0, 24).map((a: any) => (
                  <div key={a.user_id} className="flex flex-col items-center w-16">
                    {a.avatar_url ? (
                      <img src={a.avatar_url} alt={a.name ?? "Attendee"} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
                        {(a.name ?? "M")[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-1 text-center truncate w-full">{a.name ?? "Member"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-4">{cta}</div>

          <CommunityEventShareBar
            communitySlug={community?.slug ?? community?.id ?? ""}
            eventId={event.slug ?? event.id}
            title={event.title}
            communityName={community?.name ?? ""}
            date={event.date}
          />
        </div>

        {/* ── Right: sticky sidebar ── */}
        {community && (
          <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
            <div className="sticky top-[86px] space-y-3">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
                <div className="flex items-center gap-3">
                  {community.logo_url ? (
                    <img src={community.logo_url} alt={community.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                      {community.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900">{community.name}</p>
                    {community.category && <p className="text-gray-500 capitalize mt-0.5 text-xs">{community.category}</p>}
                  </div>
                </div>

                {community.description && (
                  <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                    {community.description}
                  </p>
                )}

                <Link
                  href={`/community/${community.slug ?? community.id}`}
                  className="block text-sm text-blue-600 hover:underline font-medium pt-1 border-t border-gray-100"
                >
                  View community
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
