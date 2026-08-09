"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Experience = {
  id: string;
  slug?: string | null;
  name: string;
  tagline: string | null;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  price_kes: number;
  discount_kes: number;
  max_capacity: number;
  spots_left: number;
  includes: string[];
  image_url: string | null;
  category: string | null;
  meeting_point: string | null;
  gym_id: string;
  gyms?: { name: string; area: string | null; location: string | null } | null;
};

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const fmtDate = (dateStr: string) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

function ExperienceCard({ exp }: { exp: Experience }) {
  const spotsLow = exp.spots_left > 0 && exp.spots_left <= 5;
  const soldOut = exp.spots_left <= 0;
  const discount = Number(exp.discount_kes) || 0;
  const hasDiscount = discount > 0;
  const finalPrice = Number(exp.price_kes) - discount;

  return (
    <Link
      href={`/experiences/${exp.slug ?? exp.id}`}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: "180px" }}>
        {exp.image_url ? (
          <img
            src={exp.image_url}
            alt={exp.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-blue-600 flex items-center justify-center">
            <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
            {exp.category || "Experience"}
          </span>
          {soldOut ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-800/80 text-white text-[11px] font-bold">
              Sold out
            </span>
          ) : spotsLow ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">
              🔥 {exp.spots_left} left
            </span>
          ) : null}
        </div>
        {hasDiscount && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center px-2.5 py-1 rounded-full bg-green-500 text-white text-[11px] font-bold">
            Save KES {discount.toLocaleString()}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <p className="font-black text-gray-900 text-base truncate">{exp.name}</p>
        {exp.gyms?.name && (
          <p className="text-gray-400 text-xs italic mt-0.5 truncate">{exp.gyms.name}</p>
        )}
        <p className="text-gray-400 text-xs mt-1 truncate">
          {fmtDate(exp.date)} · {fmtTime(exp.start_time)}{exp.end_time ? ` – ${fmtTime(exp.end_time)}` : ""}
        </p>
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          {soldOut ? (
            <p className="text-sm font-bold text-gray-400">Sold out</p>
          ) : hasDiscount ? (
            <p className="text-sm font-bold text-gray-900 flex items-baseline gap-1.5">
              <span className="text-gray-400 line-through text-xs font-medium">
                KES {Number(exp.price_kes).toLocaleString()}
              </span>
              <span>KES {finalPrice.toLocaleString()}</span>
            </p>
          ) : (
            <p className="text-sm font-bold text-gray-900">KES {Number(exp.price_kes).toLocaleString()} per person</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function ExperiencesClient() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const debouncedSearch = useDebounce(search);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  const nextYearStr = useMemo(() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return toDateStr(d);
  }, [today]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from("experiences")
          .select("id, slug, name, tagline, description, date, start_time, end_time, price_kes, discount_kes, max_capacity, spots_left, includes, image_url, category, meeting_point, gym_id, gyms(name, area, location)")
          .eq("is_active", true)
          .gte("date", todayStr)
          .lte("date", nextYearStr)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true });
        if (err) { setError("Failed to load experiences"); setExperiences([]); }
        else setExperiences((data || []) as unknown as Experience[]);
      } catch {
        setError("An unexpected error occurred");
        setExperiences([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [todayStr, nextYearStr]);

  const categories = useMemo(() => {
    const cats = experiences.map((e) => e.category).filter(Boolean) as string[];
    return ["All", ...Array.from(new Set(cats))];
  }, [experiences]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return experiences.filter((e) => {
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.tagline?.toLowerCase().includes(q) ||
        e.gyms?.name.toLowerCase().includes(q) ||
        e.meeting_point?.toLowerCase().includes(q);
      const matchCat = cat === "All" || e.category === cat;
      return matchSearch && matchCat;
    });
  }, [experiences, debouncedSearch, cat]);

  const clearFilters = () => { setSearch(""); setCat("All"); };
  const hasFilters = search || cat !== "All";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-6">
        <input
          type="text"
          placeholder="Search experiences..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm focus:outline-none focus:border-gray-400"
          style={{ minWidth: "160px" }}
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none bg-white"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {loading ? "Loading…" : `${filtered.length} experience${filtered.length !== 1 ? "s" : ""}`}
        </span>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-32">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-3">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <p className="text-gray-400 text-sm">No upcoming experiences.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-blue-600 font-semibold text-sm hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((exp) => (
            <ExperienceCard key={exp.id} exp={exp} />
          ))}
        </div>
      )}
    </div>
  );
}
