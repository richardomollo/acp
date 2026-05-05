"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

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
    name: string;
    location: string;
    type: string;
  } | null;
};

/* ---------------- Utilities ---------------- */

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

/* ---------------- Page ---------------- */

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

  // Today at midnight — stable reference
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => toDateStr(today), [today]);


  // 7-day window end
  const windowEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 14);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [today]);

  // Day strip: today + next 6 days
  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [today]);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  /* ---------------- Fetch ---------------- */

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("sessions")
          .select(`
            *,
            gyms!gym_id (
              name,
              location,
              type
            )
          `)
          .gte("date", todayStr)
          .lte("date", toDateStr(windowEnd))
          .order("date", { ascending: true })
          .order("time", { ascending: true });

        if (fetchError) {
          console.error("Supabase error:", fetchError);
          setError("Failed to load sessions");
          setSessions([]);
        } else {
          setSessions(data ?? []);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError("An unexpected error occurred");
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [todayStr, windowEnd]);

  /* ---------------- URL Sync ---------------- */

  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearch) params.set("q", debouncedSearch);
    if (catParam !== "All") params.set("cat", catParam);
    if (locParam !== "All") params.set("loc", locParam);

    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : "/sessions", {
      scroll: false,
    });
  }, [debouncedSearch, catParam, locParam, router]);

  /* ---------------- Filters ---------------- */

  const categories = useMemo(() => {
    const cats = sessions.map((s) => s.category).filter(Boolean);
    return ["All", ...new Set(cats)];
  }, [sessions]);

  const locations = useMemo(() => {
    const locs = sessions.map((s) => s.gyms?.location).filter(Boolean);
    return ["All", ...new Set(locs)];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const sessionDate = s.date ?? todayStr;

      // Day strip filter
      if (sessionDate !== selectedDay) return false;

      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesCategory = catParam === "All" || s.category === catParam;
      const matchesLocation = locParam === "All" || s.gyms?.location === locParam;

      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [sessions, debouncedSearch, catParam, locParam, selectedDay, todayStr]);

  /* ---------------- Helpers ---------------- */

  const clearFilters = () => {
    setSearch("");
    router.replace("/sessions");
  };

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

  /* ---------------- UI ---------------- */

  if (loading) {
    return (
      <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 mx-auto py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-gray-500">Loading classes…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 mx-auto py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 mx-auto py-12">

      <h1 className="text-md font-bold mb-6">
        All Activities, Classes and Wellness Sessions
      </h1>

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
        {days.map((d) => {
          const ds = toDateStr(d);
          const isSelected = ds === selectedDay;
          const isToday = ds === todayStr;
          const dayLabel = isToday
            ? "Today"
            : d.toLocaleDateString("en-US", { weekday: "short" });
          const dateLabel = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          return (
            <button
              key={ds}
              onClick={() => setSelectedDay(ds)}
              className={`flex flex-col items-center px-5 py-2.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                isSelected
                  ? "bg-[#000] text-white border-[#050040]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className={`text-xs ${isSelected ? "text-blue-200" : "text-gray-400"}`}>
                {dayLabel}
              </span>
              <span className="font-semibold">{dateLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile: search + filter toggle row */}
      <div className="flex items-center gap-2 mb-4 sm:hidden">
        <input
          type="text"
          placeholder="Search classes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 4h18M7 8h10M11 12h4" />
          </svg>
          Filters
        </button>
      </div>

      {/* Filters */}
      <div className={`grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-6 ${showFilters ? "grid" : "hidden sm:grid"}`}>
        {/* Search — desktop only */}
        <input
          type="text"
          placeholder="Search classes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="hidden sm:block rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Category */}
        <select
          value={catParam}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All Categories" : c}
            </option>
          ))}
        </select>

        {/* Location */}
        <select
          value={locParam}
          onChange={(e) => handleLocationChange(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {locations.map((l) => (
            <option key={l} value={l}>
              {l === "All" ? "All Locations" : l}
            </option>
          ))}
        </select>

        {/* Clear */}
        <button
          onClick={clearFilters}
          className="rounded-md border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Clear Filters
        </button>
      </div>

      {/* Results Count */}
      <p className="text-sm text-gray-600 mb-4">
        Showing {filteredSessions.length} of {sessions.length} classes
      </p>

      {/* Results */}
      {filteredSessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">
            No classes match your filters.
          </p>
          <button
            onClick={clearFilters}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 max-w-3xl">
          {filteredSessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="flex gap-4 py-4 hover:bg-gray-50 transition-colors duration-150"
              >
                {/* Thumbnail */}
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}

                {/* Info */}
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-0.5">
                    {s.category}{s.instructor ? ` · ${s.instructor}` : ""}
                  </p>
                  <h2 className="text-sm font-bold text-gray-900 mb-0.5">{s.name}</h2>
                  {s.gyms && (
                    <p className="text-sm text-gray-500 mb-1">{s.gyms.location}, {s.gyms.name}</p>
                  )}
                  <p className="text-sm text-gray-400">
                    {s.time} · {s.duration_minutes} min
                    {s.spots_left != null && (
                      <span className={`ml-2 ${s.spots_left > 0 ? "text-green-600" : "text-red-500"}`}>
                        · {s.spots_left > 0 ? `${s.spots_left} spots left` : "Fully booked"}
                      </span>
                    )}
                  </p>
                </div>

                {/* Credits */}
                {s.credits_required != null && (
                  <div className="flex-shrink-0 text-right">
                    <span className="text-xs text-gray-400">{s.credits_required} credits </span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
