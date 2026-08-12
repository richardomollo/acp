import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import JoinCommunityButton from "./JoinCommunityButton";
import CommunityShareBar from "./CommunityShareBar";
import CommunityDescription from "./CommunityDescription";

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
const METRIC_UNIT: Record<string, string> = { distance_km: "km", activity_count: "activities", days_active: "days" };

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
  const [{ data: events }, { data: challenges }, { data: members }] = await Promise.all([
    supabase
      .from("community_events")
      .select("id, slug, title, date, start_time, location, event_type, price_kes, image_url, activity_type")
      .eq("community_id", community.id)
      .eq("status", "active")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(20),
    supabase
      .from("challenges")
      .select("id, title, metric, target_value, period_start, period_end")
      .eq("community_id", community.id)
      .eq("is_active", true)
      .order("period_start", { ascending: false }),
    supabase.rpc("get_community_members", { p_community_id: community.id }),
  ]);

  const categoryLabel = CATEGORY_LABEL[community.category] ?? community.category;

  return (
    <div className="w-full px-6 py-12 max-w-7xl mx-auto">
      <Link href="/community" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        Back to all communities
      </Link>

      <div className="flex flex-col md:flex-row gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-1">
            {community.logo_url && (
              <img src={community.logo_url} alt={community.name} className="w-14 h-14 rounded-full object-cover border border-gray-100 flex-shrink-0" />
            )}
            <div>
              <h1 className="text-3xl font-semibold">{community.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5 capitalize">
                {categoryLabel}{community.location ? `, ${community.location}` : ""} · {community.member_count ?? 0} members
              </p>
            </div>
          </div>

          {/* Cover image */}
          <div className="w-full mt-4 mb-4 max-h-[420px] overflow-hidden rounded-lg">
            {community.cover_url ? (
              <img src={community.cover_url} alt={community.name} className="w-full h-full object-contain object-center" />
            ) : (
              <div className="h-48 bg-gradient-to-br from-emerald-800 to-emerald-500 rounded-lg flex items-center justify-center">
                <span className="text-5xl font-black text-white/25">{community.name[0]}</span>
              </div>
            )}
          </div>

          {community.description && <CommunityDescription text={community.description} />}

          <div className="md:hidden mt-6">
            <JoinCommunityButton
              communityId={community.id}
              communityType={community.community_type}
              className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
            />
          </div>

          {/* Events list */}
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Upcoming events</h2>
            {(events ?? []).length === 0 ? (
              <p className="text-gray-500 py-8 text-center text-sm">No events scheduled yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {(events ?? []).map((e: any) => (
                  <Link
                    key={e.id}
                    href={`/community/${community.slug ?? community.id}/event/${e.slug ?? e.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    {e.image_url ? (
                      <img src={e.image_url} alt={e.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-emerald-900 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 capitalize">
                        {(e.activity_type ?? categoryLabel).toString().replace("_", " ")}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price</p>
                      <p className="text-sm font-bold text-gray-900">{e.price_kes ? `KES ${Number(e.price_kes).toLocaleString()}` : "Free"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Challenges list */}
          {(challenges ?? []).length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold mb-4">Challenges</h2>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {(challenges ?? []).map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/community/${community.slug ?? community.id}/challenge/${c.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
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

          {/* Members */}
          {(members ?? []).length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold mb-4">Members</h2>
              <div className="flex flex-wrap gap-4">
                {(members ?? []).slice(0, 24).map((m: any) => (
                  <div key={m.user_id} className="flex flex-col items-center w-16">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name ?? "Member"} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
                        {(m.name ?? "M")[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-1 text-center truncate w-full">{m.name ?? "Member"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {community.location && (
            <div className="mt-8 pt-6 border-t border-gray-100 space-y-2 text-sm text-gray-600">
              <p>📍 {community.location}</p>
            </div>
          )}

          <CommunityShareBar communityId={community.slug ?? community.id} name={community.name} category={categoryLabel} />
        </div>

        {/* ── Right: sticky sidebar ── */}
        <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
          <div className="sticky top-[86px] bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
            <div>
              <p className="font-semibold text-gray-900">{community.name}</p>
              <p className="text-gray-500 capitalize mt-0.5">{categoryLabel}</p>
            </div>

            {community.description && (
              <p className="text-gray-500 leading-relaxed text-xs border-t border-gray-100 pt-3">
                {community.description}
              </p>
            )}

            {community.location && (
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <p className="text-gray-500 flex gap-1.5">
                  <span>📍</span>
                  <span>{community.location}</span>
                </p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3">
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
