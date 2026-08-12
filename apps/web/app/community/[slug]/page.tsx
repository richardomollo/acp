import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import JoinCommunityButton from "./JoinCommunityButton";
import CommunityShareBar from "./CommunityShareBar";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_LABEL: Record<string, string> = {
  running: "Running", walking: "Walking", cycling: "Cycling", strength: "Strength",
  boxing: "Boxing", yoga: "Yoga", pilates: "Pilates", hiking: "Hiking", dance: "Dance",
  outdoor_fitness: "Outdoor Fitness", football: "Football", other: "Other",
};

type Props = { params: Promise<{ slug: string }> };

async function fetchCommunity(slug: string) {
  const col = UUID_RE.test(slug) ? "id" : "slug";
  const { data } = await supabase
    .from("communities")
    .select("id, slug, name, description, category, location, logo_url, cover_url, community_type, member_count, review_status, is_active")
    .eq(col, slug)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const community = await fetchCommunity(slug);
  if (!community) return { title: "Community" };

  const title = community.name;
  const description = community.description ?? `Join ${community.name}, a ${CATEGORY_LABEL[community.category] ?? community.category} community on Active CityPass.`;
  const canonicalSlug = community.slug ?? slug;
  const img = community.cover_url ?? community.logo_url;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Active CityPass`,
      description,
      url: `https://activecitypass.com/community/${canonicalSlug}`,
      ...(img ? { images: [{ url: img, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(img ? { images: [img] } : {}),
    },
  };
}

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (t: string) => t.slice(0, 5);

export default async function CommunityDetailPage({ params }: Props) {
  const { slug } = await params;
  const community = await fetchCommunity(slug);
  if (!community || community.review_status !== "approved" || !community.is_active) return notFound();

  const todayStr = new Date().toISOString().split("T")[0];
  const { data: events } = await supabase
    .from("community_events")
    .select("id, slug, title, date, start_time, location, event_type, price_kes, image_url")
    .eq("community_id", community.id)
    .eq("status", "active")
    .gte("date", todayStr)
    .order("date", { ascending: true })
    .limit(20);

  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title, metric, target_value, period_start, period_end")
    .eq("community_id", community.id)
    .eq("is_active", true)
    .order("period_start", { ascending: false });

  const METRIC_UNIT: Record<string, string> = { distance_km: "km", activity_count: "activities", days_active: "days" };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <Link href="/community" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to Communities
      </Link>

      <div className="flex gap-10 items-start">
        <div className="flex-1 min-w-0">
          {community.cover_url ? (
            <img src={community.cover_url} alt={community.name} className="w-full aspect-[16/7] object-cover rounded-2xl mb-6" />
          ) : (
            <div className="w-full aspect-[16/7] rounded-2xl mb-6 bg-gradient-to-br from-emerald-800 to-emerald-500 flex items-center justify-center">
              <span className="text-6xl font-black text-white/25">{community.name[0]}</span>
            </div>
          )}

          <div className="flex items-center gap-4 mb-2">
            {community.logo_url && (
              <img src={community.logo_url} alt={community.name} className="w-14 h-14 rounded-full object-cover border border-gray-100 flex-shrink-0" />
            )}
            <div>
              <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">
                {CATEGORY_LABEL[community.category] ?? community.category}
              </p>
              <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {community.location ? `${community.location} · ` : ""}{community.member_count ?? 0} members
              </p>
            </div>
          </div>

          {community.description && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mt-6 mb-2">{community.description}</p>
          )}

          <div className="md:hidden mt-6">
            <JoinCommunityButton
              communityId={community.id}
              communityType={community.community_type}
              className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
            />
          </div>

          <div className="mt-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming events</h2>
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming events yet.</p>
            ) : (
              <div className="space-y-3">
                {(events ?? []).map((e: any) => (
                  <Link
                    key={e.id}
                    href={`/community/${community.slug ?? community.id}/event/${e.slug ?? e.id}`}
                    className="flex items-center gap-4 p-3.5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    {e.image_url ? (
                      <img src={e.image_url} alt={e.title} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-emerald-900 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{e.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {e.price_kes ? `KES ${Number(e.price_kes).toLocaleString()}` : "Free"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {(challenges ?? []).length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Challenges</h2>
              <div className="space-y-3">
                {(challenges ?? []).map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/community/${community.slug ?? community.id}/challenge/${c.id}`}
                    className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Target {c.target_value} {METRIC_UNIT[c.metric] ?? c.metric} · ends {new Date(`${c.period_end}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <CommunityShareBar communityId={community.slug ?? community.id} name={community.name} category={CATEGORY_LABEL[community.category] ?? community.category} />
        </div>

        <div className="hidden md:block w-80 flex-shrink-0">
          <div className="sticky top-[86px] space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs text-gray-400 mb-3">{community.member_count ?? 0} members</p>
              <JoinCommunityButton
                communityId={community.id}
                communityType={community.community_type}
                className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
