import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import JoinCommunityButton from "./JoinCommunityButton";
import CommunityShareBar from "./CommunityShareBar";
import CommunityTabs from "./CommunityTabs";

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
  const description = community.description ?? `Join ${community.name}, a ${CATEGORY_LABEL[community.category] ?? community.category} community on Lana.`;
  const canonicalSlug = community.slug ?? slug;
  const img = community.cover_url ?? community.logo_url;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Lana`,
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

      <div className="flex flex-col md:flex-row gap-10 md:items-start">
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

          <div className="md:hidden mt-4">
            <JoinCommunityButton
              communityId={community.id}
              communityType={community.community_type}
              className="block w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition text-center disabled:opacity-60"
            />
          </div>

          <CommunityTabs
            communitySlugOrId={community.slug ?? community.id}
            categoryLabel={categoryLabel}
            events={(events ?? []) as any}
            challenges={(challenges ?? []) as any}
            members={(members ?? []) as any}
            description={community.description}
            location={community.location}
          />

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
