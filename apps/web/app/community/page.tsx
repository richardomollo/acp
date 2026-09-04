import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community & Clubs | Lana Health",
  description: "Find your people. Join running clubs, cycling crews, yoga circles and more across Nairobi.",
  openGraph: {
    title: "Community & Clubs | Lana Health",
    description: "Find your people. Join running clubs, cycling crews, yoga circles and more across Nairobi.",
    url: "https://activecitypass.com/community",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  running: "Running", walking: "Walking", cycling: "Cycling", strength: "Strength",
  boxing: "Boxing", yoga: "Yoga", pilates: "Pilates", hiking: "Hiking", dance: "Dance",
  outdoor_fitness: "Outdoor Fitness", football: "Football", other: "Other",
};

function CommunityGridCard({ community }: { community: any }) {
  const img = community.cover_url ?? community.logo_url;
  return (
    <Link
      href={`/community/${community.slug ?? community.id}`}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: 160 }}>
        {img ? (
          <img src={img} alt={community.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-800 to-emerald-500 flex items-center justify-center">
            <span className="text-4xl font-black text-white/30">{community.name?.[0] ?? "?"}</span>
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-bold capitalize">
          {CATEGORY_LABEL[community.category] ?? community.category}
        </span>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate">{community.name}</p>
        {community.location && <p className="text-gray-400 text-xs mt-0.5 truncate">📍 {community.location}</p>}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium">{community.member_count ?? 0} members</p>
        </div>
      </div>
    </Link>
  );
}

export default async function CommunityListPage() {
  const { data: communities } = await supabase
    .from("communities")
    .select("id, slug, name, location, category, logo_url, cover_url, member_count")
    .eq("review_status", "approved")
    .eq("is_active", true)
    .order("member_count", { ascending: false });

  return (
    <div>
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
            Find your people · Nairobi
          </p>
          <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
            Communities and clubs.
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
            Join a running crew, a cycling club, a yoga circle — find your activity and your people.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {(communities ?? []).map((c: any) => <CommunityGridCard key={c.id} community={c} />)}
        </div>
        {!communities?.length && <p className="text-gray-400 text-sm py-10 text-center">No communities found yet.</p>}
      </div>
    </div>
  );
}
