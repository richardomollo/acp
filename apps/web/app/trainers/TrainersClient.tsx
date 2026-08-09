"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Trainer = {
  id: string;
  slug?: string | null;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  specialisations: string[] | null;
  training_locations: string[] | null;
  service_areas: string[] | null;
  years_of_experience: number | null;
  is_certified_verified: boolean | null;
  min_price: number | null;
  avg_rating: number | null;
  review_count: number;
};

const SPECIALISATION_FILTERS = [
  "All", "Weight Loss", "Strength Training", "HIIT", "Yoga", "Pilates",
  "Boxing", "CrossFit", "Rehabilitation", "Nutrition", "Running", "Functional Training",
];

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function TrainerCard({ trainer }: { trainer: Trainer }) {
  const displayName = trainer.professional_name ?? trainer.full_name;
  const visibleSpecs = trainer.specialisations?.slice(0, 2) ?? [];
  const location = trainer.training_locations?.[0] ?? trainer.service_areas?.[0] ?? null;

  return (
    <Link
      href={`/trainers/${trainer.slug ?? trainer.id}`}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      {/* Photo */}
      <div className="relative overflow-hidden" style={{ height: "200px" }}>
        {trainer.photo_url ? (
          <img
            src={trainer.photo_url}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-blue-950 flex items-center justify-center">
            <span className="text-white font-black text-3xl">{getInitials(trainer.full_name)}</span>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
            {visibleSpecs[0] || "Trainer"}
          </span>
          {trainer.avg_rating !== null && trainer.review_count > 0 ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white shadow-sm text-xs font-bold text-gray-900">
              ★ {trainer.avg_rating.toFixed(1)}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white shadow-sm text-[11px] font-bold text-gray-900">
              New
            </span>
          )}
        </div>
        {trainer.is_certified_verified && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/92 text-blue-600 text-[11px] font-bold">
            ✓ Verified Pro
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5">
        <p className="font-black text-gray-900 text-base truncate">{displayName}</p>
        {visibleSpecs.length > 0 && (
          <p className="text-gray-400 text-xs italic mt-0.5 truncate">{visibleSpecs.join(" · ")}</p>
        )}
        {(trainer.years_of_experience != null || location) && (
          <p className="text-gray-400 text-xs mt-1 truncate">
            {trainer.years_of_experience != null ? `${trainer.years_of_experience} yrs exp` : ""}
            {trainer.years_of_experience != null && location ? " · " : ""}
            {location ?? ""}
          </p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">
            {trainer.min_price != null
              ? `from KES ${trainer.min_price.toLocaleString()}`
              : "Book a session"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function TrainersClient({ trainers }: { trainers: Trainer[] }) {
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState("All");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trainers.filter((t) => {
      const displayName = t.professional_name ?? t.full_name;
      const matchesSearch =
        !q ||
        displayName.toLowerCase().includes(q) ||
        t.full_name.toLowerCase().includes(q) ||
        t.specialisations?.some((s) => s.toLowerCase().includes(q)) ||
        t.service_areas?.some((a) => a.toLowerCase().includes(q)) ||
        t.training_locations?.some((l) => l.toLowerCase().includes(q));
      const matchesSpec =
        specFilter === "All" ||
        t.specialisations?.some((s) => s.toLowerCase().includes(specFilter.toLowerCase()));
      return matchesSearch && matchesSpec;
    });
  }, [trainers, search, specFilter]);

  const clearFilters = () => { setSearch(""); setSpecFilter("All"); };
  const hasFilters = search || specFilter !== "All";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-6">
        <input
          type="text"
          placeholder="Search trainers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm focus:outline-none focus:border-gray-400"
          style={{ minWidth: "140px" }}
        />
        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none bg-white"
        >
          {SPECIALISATION_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "All" ? "All specialisations" : s}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} trainer{filtered.length !== 1 ? "s" : ""}
        </span>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-3">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-gray-400 text-sm">No trainers match your search.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-blue-600 font-semibold text-sm hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} />
          ))}
        </div>
      )}
    </div>
  );
}
