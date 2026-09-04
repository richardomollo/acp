import type { Metadata } from "next";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import VenueDetailMapWrapper from "../../venues/[slug]/VenueDetailMapWrapper";
import SessionShareBar from "./SessionShareBar";
import BookButton from "../../components/BookButton";

const anonSupabase = createAnonClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ slug: string }> };

async function fetchSessionMeta(slug: string) {
  const col = UUID_RE.test(slug) ? "id" : "slug";
  const { data } = await anonSupabase
    .from("sessions")
    .select("slug, name, date, start_time, drop_in_price, gyms!gym_id(name, area, image_url)")
    .eq(col, slug)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const session = await fetchSessionMeta(slug);

  if (!session) return { title: "Session" };

  const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms as any;
  const title = `${session.name} at ${gym?.name ?? ""}`;
  const description = `Book ${session.name} at ${gym?.name ?? "venue"} in ${gym?.area ?? "Nairobi"} — KES ${Number(session.drop_in_price ?? 0).toLocaleString()}.`;
  const image = gym?.image_url;
  const canonicalSlug = session.slug ?? slug;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Lana Health`,
      description,
      url: `https://activecitypass.com/sessions/${canonicalSlug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function SessionDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!slug) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const col = UUID_RE.test(slug) ? "id" : "slug";
  const { data: session, error } = await supabase
    .from("sessions")
    .select(`*, gyms!gym_id (*, cancellation_cutoff_hours, deposit_pct, no_show_grace_mins)`)
    .eq(col, slug)
    .single();

  if (error || !session) return notFound();

  let isBooked = false;
  if (user) {
    const sessionDate = session.date || new Date(session.start_time).toISOString().split("T")[0];
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(" ")[0];
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("user_id", user.id)
      .eq("gym_id", session.gym_id)
      .eq("booking_date", sessionDate)
      .eq("booking_time", sessionTime)
      .in("status", ["deposit_paid", "confirmed", "checked_in", "completed"])
      .maybeSingle();
    isBooked = !!existing;
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const sessionStartMs = new Date(`${session.date}T${(session.time ?? "00:00").slice(0, 5)}:00+03:00`).getTime();
  const hoursUntil = (sessionStartMs - Date.now()) / (1000 * 60 * 60);

  // Resolve effective policy: session override → venue default → hardcoded fallback
  const effectiveCutoff  = session.cancellation_cutoff_hours  ?? session.gyms?.cancellation_cutoff_hours  ?? 24;
  const effectiveDeposit = session.deposit_pct                ?? session.gyms?.deposit_pct                ?? 30;
  const effectiveGrace   = session.no_show_grace_mins         ?? session.gyms?.no_show_grace_mins         ?? 15;

  const sessionPrice = session.drop_in_price ?? 0;
  const depositAmount = Math.round(sessionPrice * effectiveDeposit / 100);
  const remainderAmount = sessionPrice - depositAmount;

  const cancelDeadlineMs = sessionStartMs - effectiveCutoff * 60 * 60 * 1000;
  const isRefundable = effectiveCutoff > 0 && hoursUntil > effectiveCutoff;
  const cancelDeadlineLabel = new Date(cancelDeadlineMs).toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short",
  }) + " at " + new Date(cancelDeadlineMs).toLocaleTimeString("en-KE", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="w-full px-4 sm:px-6 py-6 sm:py-10 max-w-7xl mx-auto">
      <Link href={`/venues/${(session.gyms as any)?.slug ?? session.gym_id}`} className="text-sm text-gray-500 hover:underline mb-5 inline-block">
        Back to venue
      </Link>

      <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">

          {/* Hero image */}
          {session.image_url && (
            <img
              src={session.image_url}
              alt={session.name}
              className="w-full h-48 sm:h-64 object-cover rounded-2xl mb-5"
            />
          )}

          {/* Title + meta */}
          <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-1">
            {session.category}{session.instructor ? ` · ${session.instructor}` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{session.name}</h1>

          {/* Detail pills */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className=" text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Date</p>
              <p className="font-medium text-gray-900">{fmtDate(session.date)}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Time</p>
              <p className="font-medium text-gray-900">{session.time?.slice(0, 5)}</p>
            </div>
            {session.duration_minutes && (
              <div className=" text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                <p className="font-medium text-gray-900">{session.duration_minutes} min</p>
              </div>
            )}
            {session.spots_left != null && (
              <div className=" text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Spots left</p>
                <p className={`font-medium ${session.spots_left > 0 ? "text-green-600" : "text-red-500"}`}>
                  {session.spots_left > 0 ? session.spots_left : "Full"}
                </p>
              </div>
            )}
            {session.drop_in_price != null && (
              <div className="text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Price</p>
                <p className="font-bold text-gray-900 text-base">KES {Number(session.drop_in_price).toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {session.description && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-2">About this class</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{session.description}</p>
            </div>
          )}

          {/* Book button */}
          <div className="mt-4">
            {isBooked ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-medium w-full sm:w-fit">
                <span>✓</span> Already Booked
              </div>
            ) : (session.spots_left ?? 0) <= 0 ? (
              <button disabled className="w-full sm:w-auto px-4 py-3 text-sm rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">
                Full
              </button>
            ) : (
              <BookButton
                type="session"
                itemId={session.id}
                price={sessionPrice}
                label="Book & Pay Deposit"
                className="block sm:inline-block text-center px-5 py-3.5 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60 w-full sm:w-auto"
              />
            )}
          </div>

          {/* Booking policy */}
          {hoursUntil > 0 && (
            <div className="mt-5 rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Booking Policy</p>
              </div>
              {/* Cancellation window */}
              <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isRefundable ? "bg-green-50" : "bg-amber-50"}`}>
                  <svg className={`w-3.5 h-3.5 ${isRefundable ? "text-green-600" : "text-amber-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Cancellation</p>
                  <p className={`text-sm font-medium ${isRefundable ? "text-green-700" : "text-amber-700"}`}>
                    {effectiveCutoff === 0
                      ? "No free cancellation on this session"
                      : isRefundable
                        ? `Free until ${cancelDeadlineLabel}`
                        : `Window closed — cancellation window was ${effectiveCutoff}h before session`}
                  </p>
                </div>
              </div>
              {/* Deposit */}
              <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Deposit</p>
                  <p className="text-sm font-medium text-gray-800">
                    {effectiveDeposit}% required now
                    {sessionPrice > 0 && ` — KES ${depositAmount.toLocaleString()} today, KES ${remainderAmount.toLocaleString()} at venue`}
                  </p>
                </div>
              </div>
              {/* No-show grace */}
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">No-show grace</p>
                  <p className="text-sm font-medium text-gray-800">
                    {effectiveGrace === 0 ? "No grace period — marked immediately" : `${effectiveGrace} min after session starts`}
                  </p>
                </div>
              </div>
            </div>
          )}

          <SessionShareBar
            sessionId={session.slug ?? session.id}
            name={session.name}
            gymName={session.gyms?.name ?? ""}
            date={session.date}
            time={session.time ?? ""}
          />
        </div>

        {/* ── Right: sticky sidebar ── */}
        {session.gyms && (
          <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
            <div className="sticky top-[86px] space-y-3">
              {/* Map */}
              <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: 240 }}>
                <VenueDetailMapWrapper
                  id={session.gyms.id}
                  name={session.gyms.name}
                  area={session.gyms.area ?? session.gyms.location ?? ""}
                  location={session.gyms.location ?? ""}
                  lat={session.gyms.lat}
                  lng={session.gyms.lng}
                />
              </div>

              {/* Venue info card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
                <div>
                  <p className="font-semibold text-gray-900">{session.gyms.name}</p>
                  <p className="text-gray-500 capitalize mt-0.5">{session.gyms.type}</p>
                </div>

                {session.gyms.description && (
                  <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                    {session.gyms.description}
                  </p>
                )}

                {(session.gyms.location || session.gyms.contact_phone || session.gyms.contact_email) && (
                  <div className="border-t border-gray-100 pt-3 space-y-1.5">
                    {session.gyms.location && (
                      <p className="text-gray-500 flex gap-1.5">
                        <span>📍</span>
                        <span>{session.gyms.location}{session.gyms.area ? `, ${session.gyms.area}` : ""}</span>
                      </p>
                    )}
                    {session.gyms.contact_phone && (
                      <p className="text-gray-500 flex gap-1.5">
                        <span>📞</span>
                        <span>{session.gyms.contact_phone}</span>
                      </p>
                    )}
                    {session.gyms.contact_email && (
                      <a href={`mailto:${session.gyms.contact_email}`} className="text-blue-600 hover:underline flex gap-1.5">
                        <span>✉️</span>
                        <span>{session.gyms.contact_email}</span>
                      </a>
                    )}
                  </div>
                )}

                <Link
                  href={`/venues/${(session.gyms as any)?.slug ?? session.gym_id}`}
                  className="block text-sm text-blue-600 hover:underline font-medium pt-1 border-t border-gray-100"
                >
                  View venue
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
