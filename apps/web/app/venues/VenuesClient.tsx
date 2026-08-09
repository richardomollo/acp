"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { NEIGHBOURHOODS } from "../lib/neighbourhoods";

type Gym = {
  id: string;
  slug?: string | null;
  name: string;
  area: string;
  location: string;
  type: string;
  description: string;
  image_url: string | null;
  rating: number;
};

function VenueCard({ gym }: { gym: Gym }) {
  return (
    <Link
      href={`/venues/${gym.slug ?? gym.id}`}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: "180px" }}>
        {gym.image_url ? (
          <img
            src={gym.image_url.split(",")[0]}
            alt={gym.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m5-4h4M9 7h1m4 0h1M9 11h1m4 0h1" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold capitalize">
            {gym.type || "Venue"}
          </span>
          {gym.rating > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white shadow-sm text-xs font-bold text-gray-900">
              ★ {gym.rating}
            </span>
          )}
        </div>
      </div>
      <div className="p-3.5">
        <p className="font-black text-gray-900 text-base truncate">{gym.name}</p>
        <p className="text-gray-400 text-xs mt-0.5 truncate">📍 {gym.location}{gym.area ? `, ${gym.area}` : ""}</p>
        {gym.description && (
          <p className="text-gray-500 text-xs mt-2 line-clamp-2 leading-relaxed">{gym.description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">Explore →</p>
        </div>
      </div>
    </Link>
  );
}

export default function VenuesClient({ gyms }: { gyms: Gym[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");

  const types = useMemo(
    () => ["All", ...new Set(gyms.map((g) => g.type).filter(Boolean))],
    [gyms],
  );

  const filtered = useMemo(
    () =>
      gyms.filter((g) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          g.name.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q) ||
          g.location?.toLowerCase().includes(q);
        const matchesType = typeFilter === "All" || g.type === typeFilter;
        const nb = NEIGHBOURHOODS.find((n) => n.label === areaFilter);
        const gymLoc = (g.location ?? "").toLowerCase();
        const matchesArea =
          areaFilter === "All" ||
          (nb
            ? nb.keywords.some((k) => gymLoc.includes(k))
            : gymLoc.includes(areaFilter.toLowerCase()));
        return matchesSearch && matchesType && matchesArea;
      }),
    [gyms, search, typeFilter, areaFilter],
  );

  const clearFilters = () => { setSearch(""); setTypeFilter("All"); setAreaFilter("All"); };
  const hasFilters = search || typeFilter !== "All" || areaFilter !== "All";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-6">
        <input
          type="text"
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm focus:outline-none focus:border-gray-400"
          style={{ minWidth: "140px" }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none bg-white"
        >
          {types.map((t) => (
            <option key={t} value={t}>{t === "All" ? "All types" : t}</option>
          ))}
        </select>
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none bg-white"
        >
          <option value="All">All locations</option>
          {NEIGHBOURHOODS.map((nb) => (
            <option key={nb.label} value={nb.label}>{nb.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} venue{filtered.length !== 1 ? "s" : ""}
        </span>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-3">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5" />
          </svg>
          <p className="text-gray-400 text-sm">No venues match your filters.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-blue-600 font-semibold text-sm hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((gym) => (
            <VenueCard key={gym.id} gym={gym} />
          ))}
        </div>
      )}
    </div>
  );
}
