"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { NEIGHBOURHOODS } from "../lib/neighbourhoods";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Session = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string;
  time: string;
  date?: string;
  category: string;
  image_url?: string;
  instructor?: string;
  duration_minutes?: number;
  drop_in_price?: number | null;
  spots_left?: number;
  gym_id?: string;
  gyms?: {
    id: string;
    name: string;
    location: string;
    area: string;
    type: string;
    image_url?: string | null;
    deposit_pct?: number | null;
  } | null;
};

function sessionPricing(s: Session) {
  const total = Number(s.drop_in_price) || 0;
  if (!total) return null;
  const pct = s.gyms?.deposit_pct ?? 30;
  const deposit = Math.round((total * pct) / 100);
  return { total, deposit, remainder: total - deposit };
}

function fmtTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

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

// ─── Date Rail ────────────────────────────────────────────────────────────────

function DateRail({
  days,
  selected,
  sessionDates,
  onSelect,
}: {
  days: Array<{ date: Date; dateStr: string }>;
  selected: string;
  sessionDates: Set<string>;
  onSelect: (d: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {days.map(({ date, dateStr }) => {
        const on = dateStr === selected;
        const isToday = dateStr === todayStr;
        const hasDot = sessionDates.has(dateStr);
        return (
          <button
            key={dateStr}
            onClick={() => onSelect(dateStr)}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-[60px] h-[60px] rounded-full border transition-colors ${
              on
                ? "bg-gray-900 border-gray-900 text-white"
                : "bg-white border-gray-200 text-gray-700 hover:border-gray-400"
            }`}
          >
            <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${on ? "text-white/65" : "text-gray-400"}`}>
              {isToday ? "Today" : DOW[date.getDay()]}
            </span>
            <span className={`text-lg font-black leading-tight ${on ? "text-white" : "text-gray-900"}`}>
              {date.getDate()}
            </span>
            {hasDot && (
              <span className={`w-1 h-1 rounded-full ${on ? "bg-white/60" : "bg-blue-500"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const pricing = sessionPricing(session);
  const soldOut = session.spots_left === 0;
  const spotsLow = session.spots_left != null && session.spots_left > 0 && session.spots_left <= 5;

  return (
    <Link
      href={`/sessions/${session.slug ?? session.id}`}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: "180px" }}>
        {session.image_url ? (
          <img
            src={session.image_url}
            alt={session.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
            {session.category || "Class"}
          </span>
          {soldOut ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-800/80 text-white text-[11px] font-bold">
              Full
            </span>
          ) : spotsLow ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">
              🔥 {session.spots_left} left
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-3.5">
        <p className="font-black text-gray-900 text-base truncate">{session.name}</p>
        {session.gyms?.name && (
          <p className="text-gray-400 text-xs italic mt-0.5 truncate">{session.gyms.name}</p>
        )}
        <p className="text-gray-400 text-xs mt-1 truncate">
          {session.date ? `${fmtDate(session.date)} · ` : ""}{fmtTime(session.time)}
          {session.duration_minutes ? ` · ${session.duration_minutes} min` : ""}
        </p>
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          {soldOut ? (
            <p className="text-sm font-bold text-gray-400">Fully booked</p>
          ) : pricing ? (
            <p className="text-sm font-bold text-gray-900">
              KES {pricing.deposit.toLocaleString()} deposit
              {pricing.remainder > 0 ? ` · +${pricing.remainder.toLocaleString()} at venue` : ""}
            </p>
          ) : (
            <p className="text-sm font-bold text-gray-900">Free</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [loc, setLoc] = useState("All");
  const debouncedSearch = useDebounce(search);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = useMemo(() => toDateStr(today), [today]);
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  const next14Days = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return { date: d, dateStr: toDateStr(d) };
    }),
  [today]);

  const endStr = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 13);
    return toDateStr(d);
  }, [today]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from("sessions")
          .select("*, gyms!gym_id (id, name, location, area, type, image_url, deposit_pct)")
          .gte("date", todayStr)
          .lte("date", endStr)
          .order("date", { ascending: true })
          .order("time", { ascending: true });

        if (fetchError) { setError("Failed to load sessions"); setSessions([]); }
        else setSessions((data ?? []) as unknown as Session[]);
      } catch {
        setError("An unexpected error occurred");
        setSessions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [todayStr, endStr]);

  const categories = useMemo(() => {
    const cats = sessions.map((s) => s.category).filter(Boolean);
    return ["All", ...new Set(cats)];
  }, [sessions]);

  const sessionDates = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions) { if (sess.date) s.add(sess.date); }
    return s;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if ((s.date ?? todayStr) !== selectedDay) return false;
      const matchesSearch =
        !debouncedSearch ||
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory = cat === "All" || s.category === cat;
      const nb = NEIGHBOURHOODS.find((n) => n.label === loc);
      const gymLoc = (s.gyms?.location ?? "").toLowerCase();
      const matchesLocation =
        loc === "All" ||
        (nb ? nb.keywords.some((k) => gymLoc.includes(k)) : gymLoc.includes(loc.toLowerCase()));
      return matchesSearch && matchesCategory && matchesLocation;
    });
  }, [sessions, debouncedSearch, cat, loc, selectedDay, todayStr]);

  const clearFilters = () => { setSearch(""); setCat("All"); setLoc("All"); };
  const hasFilters = search || cat !== "All" || loc !== "All";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Date Rail */}
      <div className="mb-4">
        <DateRail
          days={next14Days}
          selected={selectedDay}
          sessionDates={sessionDates}
          onSelect={setSelectedDay}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-5">
        <input
          type="text"
          placeholder="Search classes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:border-gray-400 min-w-[130px] max-w-[180px] flex-1"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-2 text-sm focus:outline-none bg-white"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>
          ))}
        </select>
        <select
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-2 text-sm focus:outline-none bg-white max-w-[180px]"
        >
          <option value="All">All locations</option>
          {NEIGHBOURHOODS.map((nb) => (
            <option key={nb.label} value={nb.label}>{nb.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {filteredSessions.length} class{filteredSessions.length !== 1 ? "es" : ""}
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
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-3">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">No classes on this day.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-blue-600 font-semibold text-sm hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredSessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
