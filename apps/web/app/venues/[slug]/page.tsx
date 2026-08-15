import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import GymGallery from "@/app/components/GymGallery";
import Link from "next/link";
import VenueSessionsFilter from "./VenueSessionsFilter";
import VenueDetailMapWrapper from "./VenueDetailMapWrapper";

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
    `Book sessions at ${gym.name} in ${gym.area ?? "Nairobi"} with Active CityPass.`;
  const canonicalSlug = gym.slug ?? gym.id;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Active CityPass`,
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
    .select("id, slug, title, category, programme_weeks, programme_price_kes, image_url")
    .eq("gym_id", gym.id)
    .eq("is_active", true)
    .eq("is_draft", false)
    .order("created_at", { ascending: false });

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {programmes.map((p) => (
                  <Link
                    key={p.id}
                    href={`/gym-programmes/${p.slug ?? p.id}`}
                    className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
                  >
                    <div className="relative overflow-hidden" style={{ height: 140 }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-blue-600" />
                      )}
                      <span className="absolute top-2.5 left-2.5 inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
                        {p.programme_weeks}-Week Programme
                      </span>
                    </div>
                    <div className="p-3.5">
                      <p className="font-black text-gray-900 text-base truncate">{p.title}</p>
                      <p className="text-sm font-bold text-gray-900 mt-1.5">KES {Number(p.programme_price_kes).toLocaleString()}</p>
                    </div>
                  </Link>
                ))}
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

        {/* ── Right: sticky map ── */}
        <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
          <div className="sticky top-[86px]">
            <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: 280 }}>
              <VenueDetailMapWrapper
                id={gym.id}
                name={gym.name}
                area={gym.area ?? gym.location ?? ""}
                location={gym.location ?? ""}
                lat={gym.lat}
                lng={gym.lng}
              />
            </div>
            <div className="mt-3 bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
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
