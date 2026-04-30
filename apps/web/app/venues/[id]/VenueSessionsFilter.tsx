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
  return d.toISOString().split("T")[0];
}

function parseTime(date: string, time: string): Date {
  const dt = new Date(`${date}T${time}`);
  return isNaN(dt.getTime()) ? new Date(0) : dt;
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

  const windowStart = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    }),
  [today]);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (s.date !== selectedDay) return false;
      if (selectedDay === todayStr) {
        const dt = parseTime(s.date, s.time);
        if (dt < windowStart) return false;
      }
      return true;
    });
  }, [sessions, selectedDay, todayStr, windowStart]);

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

      {filtered.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">
          No classes scheduled for this day.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-5">
          {filtered.map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="bg-white rounded-xl pb-4 overflow-hidden border border-gray-200 hover:-translate-y-1 transition duration-300 block"
            >
              <div className="relative h-35 w-full">
                {session.image_url && (
                  <img
                    src={session.image_url}
                    alt={session.name}
                    className="w-full h-35 object-cover object-top"
                  />
                )}
              </div>
              <div className="flex flex-col p-6">
                <h2 className="text-m font-semibold">
                  {session.name} - {session.category}, {session.duration_minutes} min
                </h2>
                <p className="text-sm text-gray-600">{session.instructor}</p>
                <p className="text-sm text-gray-600">{session.duration_minutes} min</p>
                <p className="text-sm text-gray-600 mb-2">
                  {session.spots_left} spots left out of {session.max_capacity}
                </p>
                <p className="text-sm text-gray-700">
                  📅 {new Date(session.date).toLocaleDateString()} · 🕒 {session.time}
                </p>
                <p className="text-sm text-gray">
                  Credits required to book: {session.credits_required}
                </p>
              </div>
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}
