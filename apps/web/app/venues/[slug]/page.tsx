import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import GymGallery from "@/app/components/GymGallery";
import Link from "next/link";
import VenueSessionsFilter from "./VenueSessionsFilter";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ slug: string }>;
};

async function fetchGym(slug: string) {
  if (UUID_RE.test(slug)) {
    const { data } = await supabase.from("gyms").select("*").eq("id", slug).single();
    return data;
  }
  const { data } = await supabase.from("gyms").select("*").eq("slug", slug).single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<import("next").Metadata> {
  const { slug } = await params;
  const gym = await fetchGym(slug);

  if (!gym) return { title: "Venue" };

  const title = gym.name;
  const description =
    gym.description ??
    `Book sessions at ${gym.name} in ${gym.area ?? "Nairobi"} with Lana.`;
  const canonicalSlug = gym.slug ?? gym.id;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Lana`,
      description,
      url: `https://activecitypass.com/venues/${canonicalSlug}`,
      ...(gym.image_url
        ? { images: [{ url: gym.image_url, width: 1200, height: 630, alt: title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(gym.image_url ? { images: [gym.image_url] } : {}),
    },
  };
}

export default async function GymDetailPage({ params }: Props) {
  const { slug } = await params;
  const gym = await fetchGym(slug);

  if (!gym) notFound();

  const todayStr = new Date().toISOString().split("T")[0];
  const windowEndStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  })();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, slug, name, category, date, time, duration_minutes, instructor, spots_left, max_capacity, image_url, drop_in_price")
    .eq("gym_id", gym.id)
    .gte("date", todayStr)
    .lte("date", windowEndStr)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  const { data: programmes } = await supabase
    .from("gym_programmes")
    .select("id, slug, title, description, category, programme_weeks, programme_price_kes, image_url")
    .eq("gym_id", gym.id)
    .eq("is_active", true)
    .eq("is_draft", false)
    .order("created_at", { ascending: false });

  const { data: rawExperiences } = await supabase
    .from("experiences")
    .select("id, slug, name, tagline, category, date, start_time, end_time, price_kes, discount_kes, spots_left, max_capacity, image_url")
    .eq("gym_id", gym.id)
    .eq("is_active", true)
    .gte("date", todayStr)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  // Experiences have no linking column between recurring occurrences — grouped
  // client-side the same way the main /experiences listing and the partner
  // dashboard's "edit series" already do, by name + start_time + category, so
  // a recurring series shows one card here instead of one per date.
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const experienceGroups = new Map<string, typeof rawExperiences>();
  for (const e of rawExperiences ?? []) {
    const key = `${e.name}||${e.start_time}||${e.category ?? ""}`;
    if (!experienceGroups.has(key)) experienceGroups.set(key, []);
    experienceGroups.get(key)!.push(e);
  }
  const experiences = [...experienceGroups.values()].map((occurrences) => {
    const sorted = [...occurrences!].sort((a, b) => a.date.localeCompare(b.date));
    const rep = sorted[0];
    const days = new Set(sorted.map((o) => new Date(o.date + "T00:00:00").getDay()));
    const weekdayLabel = sorted.length > 1 && days.size === 1 ? WEEKDAYS[[...days][0]] : null;
    return { ...rep, occurrenceCount: sorted.length, weekdayLabel };
  });

  return (
    <div className="w-full px-6 py-12 max-w-7xl mx-auto">
      <Link href="/venues" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        Back to all venues
      </Link>

      <div className="flex gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-semibold mb-1">{gym.name}</h1>
          <p className="text-sm text-gray-500 mb-0.5 capitalize">{gym.type}, {gym.location}{gym.area ? `, ${gym.area}` : ""}</p>
          <p className="text-sm text-gray-500 mb-4"></p>

          <GymGallery
            name={gym.name}
            images={[gym.image_url].filter(Boolean)}
          />

          {sessions && sessions.length > 0 ? (
            <VenueSessionsFilter sessions={sessions} />
          ) : (
            <p className="mt-6 text-gray-500 text-sm">No classes available at this venue yet.</p>
          )}

          {programmes && programmes.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Programmes</h2>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {programmes.map((p) => (
                  <Link
                    key={p.id}
                    href={`/gym-programmes/${p.slug ?? p.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                        {p.programme_weeks}-Week Programme
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                      {p.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price</p>
                      <p className="text-sm font-bold text-gray-900">KES {Number(p.programme_price_kes).toLocaleString()}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {experiences.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Experiences</h2>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {experiences.map((e) => {
                  const discount = Number(e.discount_kes) || 0;
                  const hasDiscount = discount > 0;
                  const finalPrice = Number(e.price_kes) - discount;
                  const soldOut = e.spots_left <= 0;
                  const dateLabel = e.weekdayLabel
                    ? `Every ${e.weekdayLabel}`
                    : new Date(e.date + "T00:00:00").toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
                  return (
                    <Link
                      key={e.id}
                      href={`/experiences/${e.slug ?? e.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      {e.image_url && (
                        <img
                          src={e.image_url}
                          alt={e.name}
                          className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                          {e.category || "Experience"}{e.occurrenceCount > 1 ? ` · ${e.occurrenceCount} dates` : ""}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{e.name}</p>
                        {e.tagline && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{e.tagline}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {dateLabel}{e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price</p>
                        <p className="text-sm font-bold text-gray-900">
                          {soldOut ? (
                            "Sold out"
                          ) : hasDiscount ? (
                            <>
                              <span className="text-gray-400 line-through text-xs font-medium mr-1.5">KES {Number(e.price_kes).toLocaleString()}</span>
                              KES {finalPrice.toLocaleString()}
                            </>
                          ) : (
                            `KES ${Number(e.price_kes).toLocaleString()}`
                          )}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {(gym.phone || gym.email || gym.address) && (
            <div className="mt-8 pt-6 border-t border-gray-100 space-y-2 text-sm text-gray-600">
              {gym.phone && <p>📞 {gym.phone}</p>}
              {gym.email && <p>✉️ {gym.email}</p>}
              {gym.address && <p>📍 {gym.address}</p>}
            </div>
          )}
        </div>

        {/* ── Right: venue info ── */}
        <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
          <div className="sticky top-[86px]">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
              <div>
                <p className="font-semibold text-gray-900">{gym.name}</p>
                <p className="text-gray-500 capitalize mt-0.5">{gym.type}</p>
              </div>

              {gym.description && (
                <p className="text-gray-500 leading-relaxed text-xs border-t border-gray-100 pt-3">
                  {gym.description}
                </p>
              )}

              {(gym.address || gym.location || gym.phone || gym.email) && (
                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  {(gym.address || gym.location) && (
                    <p className="text-gray-500 flex gap-1.5">
                      <span>📍</span>
                      <span>{gym.address ?? gym.location}{gym.area ? `, ${gym.area}` : ""}</span>
                    </p>
                  )}
                  {gym.phone && (
                    <p className="text-gray-500 flex gap-1.5">
                      <span>📞</span>
                      <span>{gym.phone}</span>
                    </p>
                  )}
                  {gym.email && (
                    <a href={`mailto:${gym.email}`} className="text-blue-600 hover:underline flex gap-1.5">
                      <span>✉️</span>
                      <span>{gym.email}</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
