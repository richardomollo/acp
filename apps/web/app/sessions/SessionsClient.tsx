"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "../lib/supabase";
import type { MapGym } from "./SessionsMap";

const SessionsMap = dynamic(() => import("./SessionsMap"), { ssr: false });

type Session = {
  id: string;
  name: string;
  description?: string;
  time: string;
  date?: string;
  category: string;
  image_url?: string;
  instructor?: string;
  duration_minutes?: number;
  credits_required?: number;
  spots_left?: number;
  gym_id?: string;
  gyms?: {
    id: string;
    name: string;
    location: string;
    area: string;
    type: string;
    image_url?: string | null;
  } | null;
};

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SessionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const qParam = searchParams.get("q") ?? "";
  const catParam = searchParams.get("cat") ?? "All";
  const locParam = searchParams.get("loc") ?? "All";

  const [search, setSearch] = useState(qParam);
  const debouncedSearch = useDebounce(search);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [activeGymId, setActiveGymId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = useMemo(() => toDateStr(today), [today]);
  const windowEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 14);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [today]);
  const days = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    }), [today]);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from("sessions")
          .select(`*, gyms!gym_id (id, name, location, area, type, image_url)`)
          .gte("date", todayStr)
          .lte("date", toDateStr(windowEnd))
          .order("date", { ascending: true })
          .order("time", { ascending: true });

        if (fetchError) { setError("Failed to load sessions"); setSessions([]); }
        else setSessions(data ?? []);
      } catch {
        setError("An unexpected error occurred");
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [todayStr, windowEnd]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (catParam !== "All") params.set("cat", catParam);
    if (locParam !== "All") params.set("loc", locParam);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/sessions", { scroll: false });
  }, [debouncedSearch, catParam, locParam, router]);

  const categories = useMemo(() => {
    const cats = sessions.map((s) => s.category).filter(Boolean);
    return ["All", ...new Set(cats)];
  }, [sessions]);

  const locations = useMemo(() => {
    const locs = sessions.map((s) => s.gyms?.location).filter(Boolean) as string[];
    return ["All", ...new Set(locs)];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if ((s.date ?? todayStr) !== selectedDay) return false;
      const matchesSearch = !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory = catParam === "All" || s.category === catParam;
      const matchesLocation = locParam === "All" || s.gyms?.location === locParam;
      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [sessions, debouncedSearch, catParam, locParam, selectedDay, todayStr]);

  // All unique gyms from every fetched session — map always shows all venues
  const mapGyms = useMemo<MapGym[]>(() => {
    const seen = new Map<string, MapGym>();
    for (const s of sessions) {
      if (!s.gyms?.id) continue;
      if (seen.has(s.gyms.id)) {
        seen.get(s.gyms.id)!.sessionCount! += 1;
      } else {
        seen.set(s.gyms.id, {
          id: s.gyms.id,
          name: s.gyms.name,
          area: s.gyms.area ?? "",
          location: s.gyms.location,
          type: s.gyms.type,
          image_url: s.gyms.image_url,
          sessionCount: 1,
        });
      }
    }
    return Array.from(seen.values());
  }, [sessions]);

  const clearFilters = () => { setSearch(""); router.replace("/sessions"); };

  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("cat", value);
    if (locParam !== "All") params.set("loc", locParam);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleLocationChange = (value: string) => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (catParam !== "All") params.set("cat", catParam);
    params.set("loc", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-gray-500">Loading classes…</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-red-500">{error}</p>
    </div>
  );

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 70px)" }}>

      {/* ── Top: full-width header ── */}
      <div className="flex-shrink-0 px-6 md:px-16 lg:px-24 xl:px-32 pt-8 pb-4 bg-white border-b border-gray-100">
        {/* Sessions / Venues toggle */}
        <div className="inline-flex bg-gray-100 rounded-full p-1 mb-5">
          <span className="px-4 py-1.5 text-sm font-medium rounded-full bg-white text-gray-900 shadow-sm">
            Classes
          </span>
          <Link href="/venues" className="px-4 py-1.5 text-sm font-medium rounded-full text-gray-500 hover:text-gray-700 transition-colors">
            Venues
          </Link>
        </div>

        {/* Day strip */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {days.map((d) => {
            const ds = toDateStr(d);
            const isSelected = ds === selectedDay;
            const isToday = ds === todayStr;
            return (
              <button
                key={ds}
                onClick={() => setSelectedDay(ds)}
                className={`flex flex-col items-center px-4 py-2 rounded-xl border text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  isSelected
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className={`text-xs ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                  {isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="font-semibold">
                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile: search + filter toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          <input
            type="text"
            placeholder="Search classes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M7 8h10M11 12h4" />
            </svg>
            Filters
          </button>
        </div>

        {/* Filters */}
        <div className={`grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-4 ${showFilters ? "grid" : "hidden sm:grid"}`}>
          <input
            type="text"
            placeholder="Search classes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hidden sm:block rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          />
          <select
            value={catParam}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          >
            {categories.map((c) => <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>)}
          </select>
          <select
            value={locParam}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          >
            {locations.map((l) => <option key={l} value={l}>{l === "All" ? "All Locations" : l}</option>)}
          </select>
          <button
            onClick={clearFilters}
            className="rounded-md border border-gray-200 text-sm font-medium py-2 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>

      </div>

      {/* ── Bottom: list + map split (aligned with header) ── */}
      <div className="flex flex-1 overflow-hidden px-6 md:px-16 lg:px-24 xl:px-32 py-5 gap-6">

        {/* List panel */}
        <div className={`flex-1 min-w-0 overflow-y-auto ${mobileView === "map" ? "hidden md:block" : "block"}`}>
          <p className="text-xs text-gray-400 mb-3">
            {filteredSessions.length} class{filteredSessions.length !== 1 ? "es" : ""} · {mapGyms.length} venue{mapGyms.length !== 1 ? "s" : ""}
          </p>

          {filteredSessions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 mb-3">No classes match your filters.</p>
              <button onClick={clearFilters} className="text-blue-600 font-medium text-sm hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {filteredSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    className={`flex gap-3 py-3.5 rounded-lg hover:bg-gray-50 transition-colors duration-150 ${
                      s.gym_id && activeGymId === s.gym_id ? "bg-gray-50" : ""
                    }`}
                    onMouseEnter={() => s.gym_id && setActiveGymId(s.gym_id)}
                    onMouseLeave={() => setActiveGymId(null)}
                  >
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex flex-col flex-1 min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-0.5">
                        {s.category}{s.instructor ? ` · ${s.instructor}` : ""}
                      </p>
                      <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{s.name}</p>
                      {s.gyms && (
                        <p className="text-xs text-gray-500 mb-0.5 truncate">{s.gyms.name} · {s.gyms.location}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {s.time?.slice(0, 5)} · {s.duration_minutes} min
                        {s.spots_left != null && (
                          <span className={`ml-1 ${s.spots_left > 0 ? "text-green-600" : "text-red-500"}`}>
                            · {s.spots_left > 0 ? `${s.spots_left} spots` : "Full"}
                          </span>
                        )}
                      </p>
                    </div>
                    {s.credits_required != null && (
                      <div className="flex-shrink-0 self-center">
                        <span className="text-xs text-gray-400">{s.credits_required} cr</span>
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map panel — desktop always mounted, mobile conditional */}
        <div className="hidden md:block w-[576px] lg:w-[640px] xl:w-[768px] flex-shrink-0 rounded-2xl overflow-hidden border border-gray-200">
          <SessionsMap gyms={mapGyms} activeId={activeGymId} onSelect={setActiveGymId} />
        </div>
        {mobileView === "map" && (
          <div className="flex md:hidden flex-1 -mx-6 -my-5 rounded-none overflow-hidden">
            <SessionsMap gyms={mapGyms} activeId={activeGymId} onSelect={setActiveGymId} />
          </div>
        )}

      </div>

      {/* Mobile List/Map toggle */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex sm:hidden bg-white border border-gray-200 rounded-full shadow-md overflow-hidden">
        {(["list", "map"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
              mobileView === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {v === "list" ? `List (${filteredSessions.length})` : "Map"}
          </button>
        ))}
      </div>
    </div>
  );
}
