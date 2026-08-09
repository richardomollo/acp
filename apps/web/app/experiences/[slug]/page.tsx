import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import ExperienceShareBar from "./ExperienceShareBar";
import BookButton from "../../components/BookButton";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ slug: string }> };

async function fetchExperience(slug: string) {
  const col = UUID_RE.test(slug) ? "id" : "slug";
  const { data } = await supabase
    .from("experiences")
    .select("*, gyms(name, area, contact_phone, contact_email, image_url), personal_trainers!pt_id(id, slug, full_name, professional_name, photo_url)")
    .eq(col, slug)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const exp = await fetchExperience(slug);

  if (!exp) return { title: "Experience" };

  const gym = Array.isArray(exp.gyms) ? exp.gyms[0] : exp.gyms as any;
  const title = `${exp.name}${gym?.name ? ` · ${gym.name}` : ""}`;
  const description = exp.tagline ??
    `Join us for ${exp.name} on ${new Date(exp.date).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}. From KES ${Number(exp.price_kes).toLocaleString()}.`;
  const canonicalSlug = exp.slug ?? slug;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Active CityPass`,
      description,
      url: `https://activecitypass.com/experiences/${canonicalSlug}`,
      ...(exp.image_url ? { images: [{ url: exp.image_url, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(exp.image_url ? { images: [exp.image_url] } : {}),
    },
  };
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;

  const exp = await fetchExperience(slug);
  if (!exp) return notFound();

  const gym = Array.isArray(exp.gyms) ? exp.gyms[0] : exp.gyms as any;
  const pt = Array.isArray(exp.personal_trainers) ? exp.personal_trainers[0] : exp.personal_trainers as any;
  const isSoldOut = exp.spots_left <= 0;
  const discountKes = Number(exp.discount_kes) || 0;
  const hasDiscount = discountKes > 0;
  const finalPrice = Number(exp.price_kes) - discountKes;

  const expStartMs = new Date(`${exp.date}T${exp.start_time.slice(0, 5)}:00+03:00`).getTime();
  const cutoffHours: number = exp.cancellation_cutoff_hours ?? 24;
  const isNonRefundable = cutoffHours === 0;
  const cancelDeadlineMs = expStartMs - cutoffHours * 60 * 60 * 1000;
  const hoursUntil = (expStartMs - Date.now()) / (1000 * 60 * 60);
  const cancelDeadlineLabel = new Date(cancelDeadlineMs).toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short",
  }) + " at " + new Date(cancelDeadlineMs).toLocaleTimeString("en-KE", {
    hour: "2-digit", minute: "2-digit",
  });
  const hasDeposit = exp.deposit_pct != null && exp.deposit_pct > 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <Link href="/experiences" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to Experiences
      </Link>

      <div className="flex gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">

          {/* Hero */}
          {exp.image_url ? (
            <img
              src={exp.image_url}
              alt={exp.name}
              className="w-full aspect-[16/7] object-cover rounded-2xl mb-6"
            />
          ) : (
            <div className="w-full aspect-[16/7] rounded-2xl mb-6 bg-gradient-to-br from-[#050040] to-indigo-500 flex items-center justify-center">
              <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
          )}

          {/* Category + title */}
          {exp.category && (
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wide mb-1">{exp.category}</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{exp.name}</h1>
          {exp.tagline && (
            <p className="text-lg text-gray-400 italic mb-6">"{exp.tagline}"</p>
          )}

          {/* Key details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Date</p>
              <p className="text-sm font-semibold text-gray-900">{fmtDate(exp.date)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Time</p>
              <p className="text-sm font-semibold text-gray-900">
                {fmtTime(exp.start_time)}{exp.end_time ? ` – ${fmtTime(exp.end_time)}` : ""}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Price</p>
              {hasDiscount ? (
                <p className="text-sm font-bold text-gray-900 flex items-baseline gap-1.5">
                  <span className="text-gray-400 line-through text-xs font-medium">
                    KES {Number(exp.price_kes).toLocaleString()}
                  </span>
                  <span>KES {finalPrice.toLocaleString()}</span>
                </p>
              ) : (
                <p className="text-sm font-bold text-gray-900">KES {Number(exp.price_kes).toLocaleString()}</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Spots</p>
              <p className={`text-sm font-semibold ${isSoldOut ? "text-red-500" : exp.spots_left <= 5 ? "text-amber-500" : "text-green-600"}`}>
                {isSoldOut ? "Sold out" : `${exp.spots_left} of ${exp.max_capacity}`}
              </p>
            </div>
          </div>

          {/* Logistics */}
          {(exp.meeting_point || exp.transport_info) && (
            <div className="bg-indigo-50 rounded-2xl p-5 mb-8 space-y-3">
              {exp.meeting_point && (
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Meeting Point</p>
                    <p className="text-sm text-gray-700 mt-0.5">{exp.meeting_point}</p>
                  </div>
                </div>
              )}
              {exp.transport_info && (
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Transport</p>
                    <p className="text-sm text-gray-700 mt-0.5">{exp.transport_info}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {exp.description && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">About this experience</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{exp.description}</p>
            </div>
          )}

          {/* What's Included */}
          {exp.includes?.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">What&apos;s included</h2>
              <ul className="space-y-2">
                {exp.includes.map((inc: string, i: number) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {inc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Itinerary */}
          {exp.itinerary?.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule</h2>
              <div className="relative pl-6 space-y-0">
                {(exp.itinerary as { time: string; activity: string; detail: string }[]).map((row, i) => (
                  <div key={i} className="relative pb-6 last:pb-0">
                    {/* Vertical line */}
                    {i < exp.itinerary.length - 1 && (
                      <span className="absolute left-[-17px] top-5 bottom-0 w-px bg-gray-200" />
                    )}
                    {/* Dot */}
                    <span className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-[#050040]" />
                    <p className="text-xs font-bold text-[#050040] uppercase tracking-wide">{row.time}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{row.activity}</p>
                    {row.detail && <p className="text-xs text-gray-500 mt-0.5">{row.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ExperienceShareBar
            experienceId={exp.slug ?? exp.id}
            name={exp.name}
            venueName={gym?.name ?? ""}
            date={exp.date}
            time={exp.start_time ?? ""}
          />

          {/* Mobile CTA */}
          <div className="md:hidden mt-6 space-y-3">
            {isSoldOut ? (
              <button disabled className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">
                Sold Out
              </button>
            ) : (
              <BookButton
                type="experience"
                itemId={exp.id}
                price={Number(exp.price_kes)}
                label={hasDeposit ? "Book & Pay Deposit" : "Book Now"}
                className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
              />
            )}
            <div className={`flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-xs ${
              isNonRefundable ? "bg-red-50 text-red-700" :
              hoursUntil > cutoffHours ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {isNonRefundable
                ? "Non-refundable"
                : hoursUntil > cutoffHours
                  ? `Free cancellation until ${cancelDeadlineLabel}`
                  : `Cancellation not available within ${cutoffHours} hours`}
            </div>
          </div>
        </div>

        {/* ── Right: sticky sidebar ── */}
        <div className="hidden md:block w-80 flex-shrink-0">
          <div className="sticky top-[86px] space-y-4">

            {/* Booking card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-400">Price per person</p>
                  {hasDiscount && (
                    <span className="inline-block mb-0.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold">
                      Save KES {discountKes.toLocaleString()}
                    </span>
                  )}
                  {hasDiscount ? (
                    <p className="text-2xl font-bold text-gray-900 flex items-baseline gap-2">
                      <span className="text-gray-400 line-through text-sm font-medium">
                        KES {Number(exp.price_kes).toLocaleString()}
                      </span>
                      <span>KES {finalPrice.toLocaleString()}</span>
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-900">KES {Number(exp.price_kes).toLocaleString()}</p>
                  )}
                </div>
                <p className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
                  isSoldOut ? "bg-red-50 text-red-500" :
                  exp.spots_left <= 5 ? "bg-amber-50 text-amber-600" :
                  "bg-green-50 text-green-600"
                }`}>
                  {isSoldOut ? "Sold out" : `${exp.spots_left} spot${exp.spots_left !== 1 ? "s" : ""} left`}
                </p>
              </div>

              <div className="space-y-2 text-xs text-gray-500 mb-5">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {fmtDate(exp.date)}
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {fmtTime(exp.start_time)}{exp.end_time ? ` – ${fmtTime(exp.end_time)}` : ""}
                </div>
                {exp.meeting_point && (
                  <div className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {exp.meeting_point}
                  </div>
                )}
              </div>

              {isSoldOut ? (
                <button disabled className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-200 text-gray-500 cursor-not-allowed">
                  Sold Out
                </button>
              ) : (
                <BookButton
                  type="experience"
                  itemId={exp.id}
                  price={Number(exp.price_kes)}
                  label={hasDeposit ? "Book & Pay Deposit" : "Book Now"}
                  className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
                />
              )}

              <div className={`flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl text-xs ${
                isNonRefundable ? "bg-red-50 text-red-700" :
                hoursUntil > cutoffHours ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}>
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {isNonRefundable
                  ? "Non-refundable"
                  : hoursUntil > cutoffHours
                    ? `Free cancellation until ${cancelDeadlineLabel}`
                    : `Cancellation not available within ${cutoffHours} hours`}
              </div>
            </div>

            {/* Hosted by */}
            {(gym || pt) && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Hosted by</p>
                {pt ? (
                  <>
                    <div className="flex items-center gap-3">
                      {pt.photo_url ? (
                        <img src={pt.photo_url} alt={pt.professional_name ?? pt.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                          {(pt.professional_name ?? pt.full_name)?.[0] ?? "?"}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{pt.professional_name ?? pt.full_name}</p>
                        <p className="text-xs text-gray-400">Personal Trainer</p>
                      </div>
                    </div>
                    <a
                      href={`/trainers/${pt.slug ?? pt.id}`}
                      className="text-xs text-[#050040] hover:underline block"
                    >
                      View trainer profile →
                    </a>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                    {gym.area && <p className="text-xs text-gray-400">{gym.area}</p>}
                    {gym.contact_email && (
                      <a href={`mailto:${gym.contact_email}`} className="text-xs text-[#050040] hover:underline block">
                        {gym.contact_email}
                      </a>
                    )}
                    {gym.contact_phone && (
                      <a href={`tel:${gym.contact_phone}`} className="text-xs text-[#050040] hover:underline block">
                        {gym.contact_phone}
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
