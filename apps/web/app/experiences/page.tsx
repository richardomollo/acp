import type { Metadata } from "next";
import { Suspense } from "react";
import ExperiencesClient from "./ExperiencesClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Experiences | Lana",
  description:
    "Discover full-day retreats, hikes, and wellness experiences across Kenya — yoga at Mt Longonot, meditation retreats, nature hikes and more.",
  openGraph: {
    title: "Experiences | Lana",
    description:
      "Discover full-day retreats, hikes, and wellness experiences across Kenya.",
    url: "https://activecitypass.com/experiences",
  },
};

export default function ExperiencesPage() {
  return (
    <div>
      {/* Page header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div>
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                Beyond the gym · Kenya-wide
              </p>
              <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
                Unforgettable fitness<br className="hidden sm:block" /> experiences across Kenya.
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
                Hikes, yoga retreats, wellness days, outdoor adventures — these aren't your everyday workouts.
                Discover and book unique one-day experiences across Kenya.
              </p>
            </div>
        </div>
      </div>

      <Suspense fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
            ))}
          </div>
        </div>
      }>
        <ExperiencesClient />
      </Suspense>
    </div>
  );
}
