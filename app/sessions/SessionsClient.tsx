"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

// Type for sessions with gym data
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

/* ---------------- Page ---------------- */

export default function SessionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* URL-based state */
  const qParam = searchParams.get("q") ?? "";
  const catParam = searchParams.get("cat") ?? "All";
  const locParam = searchParams.get("loc") ?? "All";

  const [search, setSearch] = useState(qParam);
  const debouncedSearch = useDebounce(search);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          .order("time", { ascending: true });

        if (fetchError) {
          console.error("Supabase error:", fetchError);
          setError("Failed to load sessions");
          setSessions([]);
        } else {
          console.log("Raw Supabase data:", data);
          console.log("First session gyms:", data?.[0]?.gyms);
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
  }, []);

  /* ---------------- URL Sync ---------------- */

  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearch) params.set("q", debouncedSearch);
    if (catParam !== "All") params.set("cat", catParam);
    if (locParam !== "All") params.set("loc", locParam);

    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : "/sessions", { 
      scroll: false 
    });
  }, [debouncedSearch, catParam, locParam, router]);

  /* ---------------- Filters ---------------- */

  const categories = useMemo(() => {
    const cats = sessions
      .map(s => s.category)
      .filter(Boolean);
    return ["All", ...new Set(cats)];
  }, [sessions]);

  const locations = useMemo(() => {
    const locs = sessions
      .map(s => s.gyms?.location)
      .filter(Boolean);
    return ["All", ...new Set(locs)];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesCategory =
        catParam === "All" || s.category === catParam;

      const matchesLocation =
        locParam === "All" || s.gyms?.location === locParam;

      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [sessions, debouncedSearch, catParam, locParam]);

  /* ---------------- Clear Filters ---------------- */

  const clearFilters = () => {
    setSearch("");
    router.replace("/sessions");
  };

  /* ---------------- Handlers ---------------- */

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
    <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-24 xl:px-32 py-12">
      <h1 className="text-3xl font-bold mb-8">
        All Activities, Classes and Wellness Sessions
      </h1>

      {/* Filters */}
      <div className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-4">
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
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSessions.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
            >
              <Link href={`/sessions/${s.id}`}>
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400">
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
                )}
              </Link>

              <div className="p-4 space-y-2">
                <Link href={`/sessions/${s.id}`}>
                  <h2 className="font-semibold text-lg hover:text-blue-600 transition-colors">
                    {s.name}
                  </h2>
                </Link>
                
                <p className="text-sm text-gray-600">{s.category}</p>
                
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
                  {s.time}
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

                {s.instructor && (
                  <p className="text-sm text-gray-500">
                    Instructor: {s.instructor}
                  </p>
                )}

                {s.duration_minutes && (
                  <p className="text-sm text-gray-500">
                    {s.duration_minutes} minutes
                  </p>
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

                <Link
                  href={`/sessions/${s.id}`}
                  className="block mt-4 text-sm font-medium text-center rounded-md bg-black text-white py-2 hover:bg-gray-800 transition-colors"
                >
                  View Details
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}