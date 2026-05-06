"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import Link from "next/link";


const VenuesMap = dynamic(() => import("./VenuesMap"), { ssr: false });

type Gym = {
  id: string;
  name: string;
  area: string;
  location: string;
  type: string;
  description: string;
  image_url: string | null;
  rating: number;
};

export default function VenuesClient({ gyms }: { gyms: Gym[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [areaFilter, setAreaFilter] = useState("All");

  const types = useMemo(() => ["All", ...new Set(gyms.map((g) => g.type).filter(Boolean))], [gyms]);
  const areas = useMemo(() => ["All", ...new Set(gyms.map((g) => g.area).filter(Boolean))], [gyms]);

  const filtered = useMemo(() => gyms.filter((g) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q) || g.location?.toLowerCase().includes(q);
    const matchesType = typeFilter === "All" || g.type === typeFilter;
    const matchesArea = areaFilter === "All" || g.area === areaFilter;
    return matchesSearch && matchesType && matchesArea;
  }), [gyms, search, typeFilter, areaFilter]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 70px)" }}>
      {/* Mobile view toggle */}
      <div className="flex sm:hidden border-b border-gray-200 bg-white z-10">
        <button
          onClick={() => setMobileView("list")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mobileView === "list"
              ? "border-b-2 border-black text-black"
              : "text-gray-500"
          }`}
        >
          List
        </button>
        <button
          onClick={() => setMobileView("map")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mobileView === "map"
              ? "border-b-2 border-black text-black"
              : "text-gray-500"
          }`}
        >
          Map
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* List panel */}
        <div
          className={`${
            mobileView === "map" ? "hidden" : "flex"
          } sm:flex flex-col w-full sm:w-[45%] lg:w-[40%] overflow-y-auto border-r border-gray-100`}
        >
          <div className="px-6 md:px-16 lg:px-24 xl:px-32 py-5 border-b border-gray-100">
            {/* Sessions / Venues toggle */}
            <div className="inline-flex bg-gray-100 rounded-full p-1 mb-4">
              <Link href="/sessions" className="px-4 py-1.5 text-sm font-medium rounded-full text-gray-500 hover:text-gray-700 transition-colors">
                Classes
              </Link>
              <span className="px-4 py-1.5 text-sm font-medium rounded-full bg-white text-gray-900 shadow-sm">
                Venues
              </span>
            </div>

            {/* Search + filters */}
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Search venues..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              >
                {types.map((t) => <option key={t} value={t}>{t === "All" ? "All Types" : t}</option>)}
              </select>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              >
                {areas.map((a) => <option key={a} value={a}>{a === "All" ? "All Areas" : a}</option>)}
              </select>
            </div>

            <p className="text-xs text-gray-400 mt-2">{filtered.length} venue{filtered.length !== 1 ? "s" : ""}</p>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((gym) => (
              <div
                key={gym.id}
                onClick={() => setActiveId(gym.id === activeId ? null : gym.id)}
                className={`flex gap-4 px-6 md:px-16 lg:px-24 xl:px-32 py-4 cursor-pointer transition-colors hover:bg-gray-50 ${
                  activeId === gym.id ? "bg-blue-50 hover:bg-blue-50" : ""
                }`}
              >
                {/* Thumbnail */}
                {gym.image_url ? (
                  <img
                    src={gym.image_url}
                    alt={gym.name}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5" />
                    </svg>
                  </div>
                )}

                {/* Info */}
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-0.5">{gym.type}</p>
                  <Link
                    href={`/venues/${gym.id}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    className="text-sm font-semibold hover:underline truncate"
                  >
                    {gym.name}
                  </Link>
                  <p className="text-xs text-gray-500 mb-1">{gym.location}, {gym.area}</p>
                  {gym.rating > 0 && (
                    <p className="text-xs text-gray-500 mb-1">
                      <span className="text-yellow-400">★</span> {gym.rating}
                    </p>
                  )}
                  {gym.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                      {gym.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map panel — always mounted on desktop, conditionally on mobile */}
        <div className="hidden sm:flex flex-1">
          <VenuesMap gyms={filtered} activeId={activeId} onSelect={setActiveId} />
        </div>
        {mobileView === "map" && (
          <div className="flex sm:hidden flex-1">
            <VenuesMap gyms={filtered} activeId={activeId} onSelect={setActiveId} />
          </div>
        )}
      </div>
    </div>
  );
}
