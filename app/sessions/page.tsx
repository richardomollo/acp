"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

type Session = {
  id: string;
  name: string;
  description?: string;
  time?: string;
  category?: string;
  image_url?: string;
  gyms?: {
    name: string;
    location: string;
    type: string;
  };
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

  /* ---------------- Fetch ---------------- */

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);

      const { data } = await supabase
        .from("sessions")
        .select(`
          id,
          name,
          description,
          time,
          category,
          image_url,
          gyms (
            name,
            location,
            type
          )
        `)
        .order("time", { ascending: true });

      setSessions(data ?? []);
      setLoading(false);
    };

    fetchSessions();
  }, []);

  /* ---------------- URL Sync ---------------- */

  useEffect(() => {
    const params = new URLSearchParams();

    if (debouncedSearch) params.set("q", debouncedSearch);
    if (catParam !== "All") params.set("cat", catParam);
    if (locParam !== "All") params.set("loc", locParam);

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, catParam, locParam, router]);

  /* ---------------- Filters ---------------- */

  const categories = useMemo(() => {
    return ["All", ...new Set(sessions.map(s => s.category).filter(Boolean))];
  }, [sessions]);

  const locations = useMemo(() => {
    return ["All", ...new Set(sessions.map(s => s.gyms?.location).filter(Boolean))];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase());

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

  /* ---------------- UI ---------------- */

  if (loading) {
    return <p className="p-8 text-gray-500">Loading classes…</p>;
  }

  return (
    <div className="max-w-7h-[70px] w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">All Classes</h1>

      {/* Filters */}
      <div className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-6">
        {/* Search */}
        <input
          type="text"
          placeholder="Search classes "
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border px-3 border border-gray-200 py-2 text-sm"
        />

        {/* Category */}
        <select
          value={catParam}
          onChange={(e) =>
            router.replace(`?q=${debouncedSearch}&cat=${e.target.value}&loc=${locParam}`)
          }
          className="rounded-md border px-3 py-2 border border-gray-200 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Location */}
        <select
          value={locParam}
          onChange={(e) =>
            router.replace(`?q=${debouncedSearch}&cat=${catParam}&loc=${e.target.value}`)
          }
          className="rounded-md border px-3 py-2 border border-gray-200 text-sm"
        >
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {/* Clear */}
        <button
          onClick={clearFilters}
          className="rounded-md border text-sm  border border-gray-200 font-medium hover:bg-gray-50"
        >
          Clear filters
        </button>
      </div>

      {/* Results */}
      {filteredSessions.length === 0 ? (
        <p className="text-gray-500">No classes match your filters.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {filteredSessions.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-s transition"
            >
              <Link href={`/sessions/${s.id}`}>
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="h-40 bg-gray-100 flex items-center justify-center text-gray-400">
                    No image
                  </div>
                )}
              </Link>

              <div className="p-4 space-y-1">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="text-sm text-gray-500">{s.category}</p>
                <p className="text-sm text-gray-500">{s.time}</p>
                {s.gyms && (
                  <p className="text-sm text-gray-500">
                    {s.gyms.name} · {s.gyms.location}
                  </p>
                )}
                {/* <Link
                  href={`/sessions/${s.id}`}
                  className="block mt-3 text-sm font-medium text-center rounded-md bg-black text-white py-2 hover:bg-gray-800"
                >
                  View class
                </Link> */}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
