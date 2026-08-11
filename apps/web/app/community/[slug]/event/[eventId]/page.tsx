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

type Props = { params: Promise<{ slug: string; eventId: string }> };

async function fetchEvent(eventId: string) {
  const { data } = await supabase
    .from("community_events")
    .select("*, communities(id, slug, name, logo_url)")
    .eq("id", eventId)
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
      title: `${title} | Active CityPass`,
      description,
      url: `https://activecitypass.com/community/${community?.slug ?? community?.id}/event/${eventId}`,
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

  const { count: goingCount } = await supabase
    .from("community_event_attendees")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "going");

  const isFull = event.capacity != null && (goingCount ?? 0) >= event.capacity;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <Link href={`/community/${community?.slug ?? community?.id}`} className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to {community?.name ?? "Community"}
      </Link>

      <div className="flex gap-10 items-start">
        <div className="flex-1 min-w-0">
          {event.image_url ? (
            <img src={event.image_url} alt={event.title} className="w-full aspect-[16/7] object-cover rounded-2xl mb-6" />
          ) : (
            <div className="w-full aspect-[16/7] rounded-2xl mb-6 bg-gradient-to-br from-emerald-800 to-emerald-500 flex items-center justify-center">
              <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {event.activity_type && (
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1 capitalize">{event.activity_type.replace("_", " ")}</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{event.title}</h1>
          {community?.name && <p className="text-sm text-gray-400 mb-6">Organised by {community.name}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Date</p>
              <p className="text-sm font-semibold text-gray-900">{fmtDate(event.date)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Time</p>
              <p className="text-sm font-semibold text-gray-900">
                {fmtTime(event.start_time)}{event.end_time ? ` – ${fmtTime(event.end_time)}` : ""}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Location</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{event.location}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Going</p>
              <p className="text-sm font-semibold text-gray-900">
                {goingCount ?? 0}{event.capacity ? ` / ${event.capacity}` : ""}
              </p>
            </div>
          </div>

          {event.difficulty && (
            <p className="text-sm text-gray-500 mb-6">Difficulty: <span className="font-semibold text-gray-900">{DIFFICULTY_LABEL[event.difficulty] ?? event.difficulty}</span></p>
          )}

          {event.description && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">About this event</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
            </div>
          )}

          <CommunityEventShareBar
            communitySlug={community?.slug ?? community?.id ?? ""}
            eventId={event.id}
            title={event.title}
            communityName={community?.name ?? ""}
            date={event.date}
          />

          <div className="md:hidden mt-6">
            {event.status !== "active" ? (
              <p className="text-sm text-red-600 font-semibold">This event has been cancelled.</p>
            ) : event.event_type === "free" ? (
              <RsvpEventButton eventId={event.id} isFull={isFull} className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60" />
            ) : event.event_type === "paid" ? (
              isFull ? (
                <button disabled className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">Event Full</button>
              ) : (
                <Link href={`/checkout?type=community_event&id=${event.id}`} className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                  Book — KES {Number(event.price_kes).toLocaleString()}
                </Link>
              )
            ) : event.event_type === "external" ? (
              <a href={event.external_url} target="_blank" rel="noopener noreferrer" className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                Register externally
              </a>
            ) : (
              <Link href="/classes" className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                Book via Classes
              </Link>
            )}
          </div>
        </div>

        <div className="hidden md:block w-80 flex-shrink-0">
          <div className="sticky top-[86px] space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              {event.event_type === "paid" && (
                <p className="text-2xl font-bold text-gray-900 mb-4">KES {Number(event.price_kes).toLocaleString()}</p>
              )}
              {event.status !== "active" ? (
                <p className="text-sm text-red-600 font-semibold">This event has been cancelled.</p>
              ) : event.event_type === "free" ? (
                <RsvpEventButton eventId={event.id} isFull={isFull} className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60" />
              ) : event.event_type === "paid" ? (
                isFull ? (
                  <button disabled className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">Event Full</button>
                ) : (
                  <Link href={`/checkout?type=community_event&id=${event.id}`} className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                    Book & Pay
                  </Link>
                )
              ) : event.event_type === "external" ? (
                <a href={event.external_url} target="_blank" rel="noopener noreferrer" className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                  Register externally
                </a>
              ) : (
                <Link href="/classes" className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center">
                  Book via Classes
                </Link>
              )}
            </div>

            {community && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Hosted by</p>
                <div className="flex items-center gap-3">
                  {community.logo_url ? (
                    <img src={community.logo_url} alt={community.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                      {community.name?.[0] ?? "?"}
                    </div>
                  )}
                  <p className="font-semibold text-gray-900">{community.name}</p>
                </div>
                <Link href={`/community/${community.slug ?? community.id}`} className="text-xs text-[#050040] hover:underline block">
                  View community →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
