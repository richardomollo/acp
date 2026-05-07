"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type VenueSession = {
  id: string;
  name: string;
  category: string;
  date: string;
  time: string;
  duration_minutes: number;
  instructor: string;
  spots_left: number;
  max_capacity: number;
  image_url?: string | null;
  credits_required: number;
};

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function VenueSessionsFilter({
  sessions,
}: {
  sessions: VenueSession[];
}) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => toDateStr(today), [today]);

  const days = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    }),
  [today]);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  const filtered = useMemo(() => {
    return sessions.filter((s) => s.date === selectedDay);
  }, [sessions, selectedDay]);

  return (
    <div className="mt-12">
      <h2 className="text-xl font-semibold mb-4">Classes offered</h2>

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
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

      {filtered.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">
          No classes scheduled for this day.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
          {filtered.map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              {session.image_url && (
                <img
                  src={session.image_url}
                  alt={session.name}
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                  {session.category}{session.instructor ? ` · ${session.instructor}` : ""}
                </p>
                <p className="text-sm font-semibold text-gray-900 truncate">{session.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {session.time.slice(0, 5)}
                  {session.duration_minutes ? ` · ${session.duration_minutes} min` : ""}
                  {session.spots_left != null ? ` · ${session.spots_left} spots left` : ""}
                </p>
              </div>
              <div className="flex-shrink-0 self-center">
                <span className="border border-blue-500 text-blue-500 rounded-lg px-3 py-1 text-xs font-medium whitespace-nowrap">
                  {session.credits_required} credit{session.credits_required !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
