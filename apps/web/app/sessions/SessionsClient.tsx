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

function parseSessionDateTime(session: Session): Date | null {
  const dateStr = session.date ?? new Date().toISOString().split("T")[0];
  const timeStr = session.time?.includes(":") ? session.time : `${session.time}:00`;
  const dt = new Date(`${dateStr}T${timeStr}`);
  return isNaN(dt.getTime()) ? null : dt;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
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

  // Today at midnight — stable reference
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => toDateStr(today), [today]);

  // Next-hour boundary — used to hide sessions that have already passed today
  const windowStart = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  }, []);

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

      // For today: hide sessions that have already passed (before next full hour)
      if (selectedDay === todayStr) {
        const dt = parseSessionDateTime(s);
        if (dt && dt < windowStart) return false;
      }

      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesCategory = catParam === "All" || s.category === catParam;
      const matchesLocation = locParam === "All" || s.gyms?.location === locParam;

      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [sessions, debouncedSearch, catParam, locParam, selectedDay, todayStr, windowStart]);

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
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-gray-500">Loading classes…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12 ">

      <h1 className="text-xl font-bold mb-6">
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
                  ? "bg-[#050040] text-white border-[#050040]"
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

      {/* Filters */}
      <div className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-6">
        {/* Search */}
        <input
          type="text"
          placeholder="Search classes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {filteredSessions.map((s) => (
            <li
              key={s.id}
              className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:-translate-y-1 transition duration-300"
            >
              <Link href={`/sessions/${s.id}`}>
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="h-48 w-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = "none";
                      el.nextElementSibling?.removeAttribute("style");
                    }}
                  />
                ) : null}
                <div
                  className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400"
                  style={s.image_url ? { display: "none" } : undefined}
                >
                  <svg
                    className="w-16 h-16"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </Link>

              <div className="p-4 space-y-1">
                <Link href={`/sessions/${s.id}`}>
                  <h2 className="font-semibold text-lg hover:text-blue-600 transition-colors">
                    {s.name}
                  </h2>
                </Link>

                <p className="text-sm text-gray">{s.category}, Instructor: {s.instructor}</p>

                <div className="flex items-center text-sm text-gray-500">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {s.time} for {s.duration_minutes} minutes
                </div>

                {s.gyms && (
                  <div className="flex items-start text-sm text-gray-500">
                    <svg
                      className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span>
                      {s.gyms.name} · {s.gyms.location}
                    </span>
                  </div>
                )}

                {s.spots_left !== undefined && (
                  <p className="text-sm font-medium text-gray-700">
                    {s.spots_left > 0 ? (
                      <span className="text-green-600">
                        {s.spots_left} spots left
                      </span>
                    ) : (
                      <span className="text-red-600">Fully booked</span>
                    )}
                  </p>
                )}

                <button className="flex items-center gap-2 text-grey-200 text-sm rounded-full py-1">
                  <Link href={`/sessions/${s.id}`}> View Activity Details </Link>
                  <svg
                    width="6"
                    height="8"
                    viewBox="0 0 6 8"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1.25.5 4.75 4l-3.5 3.5"
                      stroke="#050040"
                      strokeOpacity=".4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
