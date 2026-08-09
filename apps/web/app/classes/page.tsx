import type { Metadata } from "next";
import { Suspense } from "react";
import SessionsClient from "../sessions/SessionsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Classes | Active CityPass",
  description:
    "Find and book fitness sessions across Nairobi — gym workouts, yoga classes, pilates, swimming, HIIT and more. Filter by date, venue, and activity type.",
  openGraph: {
    title: "Browse Classes | Active CityPass",
    description:
      "Find and book fitness sessions across Nairobi — gym workouts, yoga, pilates, swimming, HIIT and more.",
    url: "https://activecitypass.com/classes",
  },
};

export default function ClassesPage() {
  return (
    <div>
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
            Classes &amp; sessions · Nairobi-wide
          </p>
          <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
            Book a class at any gym<br className="hidden sm:block" /> or studio in Nairobi.
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
            Pick a date, find a class, and secure your spot in seconds — no annual contracts,
            no single-venue lock-in.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
              ))}
            </div>
          </div>
        }
      >
        <SessionsClient />
      </Suspense>
    </div>
  );
}
