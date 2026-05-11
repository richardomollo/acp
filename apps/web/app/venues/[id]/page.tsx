import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import GymGallery from "@/app/components/GymGallery";
import Link from "next/link";
import VenueSessionsFilter from "./VenueSessionsFilter";
import VenueDetailMapWrapper from "./VenueDetailMapWrapper";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { data: gym } = await supabase
    .from("gyms")
    .select("name, description")
    .eq("id", id)
    .single();
  return {
    title: gym?.name ?? "Venue",
    description: gym?.description,
  };
}

export default async function GymDetailPage({ params }: Props) {
  const { id } = await params;

  const { data: gym, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !gym) notFound();

  const todayStr = new Date().toISOString().split("T")[0];
  const windowEndStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  })();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, category, date, time, duration_minutes, instructor, spots_left, max_capacity, image_url, credits_required")
    .eq("gym_id", id)
    .gte("date", todayStr)
    .lte("date", windowEndStr)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  return (
    <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 py-12">
      <Link href="/venues" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to all venues
      </Link>

      <div className="flex gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-semibold mb-1">{gym.name}</h1>
          <p className="text-sm text-gray-500 mb-0.5 capitalize">{gym.type}</p>
          <p className="text-sm text-gray-500 mb-4">📍 {gym.location}{gym.area ? `, ${gym.area}` : ""}</p>

          <GymGallery
            name={gym.name}
            images={[gym.image_url].filter(Boolean)}
          />

          {/* <p className="mt-6 text-sm text-gray-600 leading-relaxed">{gym.description}</p> */}

          {/* Sessions */}
          {sessions && sessions.length > 0 ? (
            <VenueSessionsFilter sessions={sessions} />
          ) : (
            <p className="mt-6 text-gray-500 text-sm">No classes available at this venue yet.</p>
          )}

          {/* Contact */}
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
                name={gym.name}
                area={gym.area ?? gym.location ?? ""}
                location={gym.location ?? ""}
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
                    <a
                      href={`mailto:${gym.email}`}
                      className="text-blue-600 hover:underline flex gap-1.5"
                    >
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
