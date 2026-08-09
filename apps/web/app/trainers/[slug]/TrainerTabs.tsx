"use client";

import { useState } from "react";
import Link from "next/link";

function StarFull({ filled }: { filled: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill={filled ? "#f59e0b" : "#e5e7eb"}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const TYPE_COLORS: Record<string, string> = {
  "1-on-1": "bg-purple-100 text-purple-700",
  group: "bg-blue-100 text-blue-700",
  online: "bg-cyan-100 text-cyan-700",
  outdoor: "bg-green-100 text-green-700",
  "home-visit": "bg-orange-100 text-orange-700",
  "drop-in": "bg-pink-100 text-pink-700",
};

type Offering = {
  id: string;
  title: string;
  description?: string | null;
  type: string | null;
  duration_minutes: number | null;
  price_kes: number | null;
  max_participants: number | null;
  image_url?: string | null;
  location_details?: string | null;
  meeting_link?: string | null;
  service_zones?: string[] | null;
};

type Review = {
  rating: number;
  comment?: string | null;
  created_at?: string | null;
  users?: { full_name?: string } | { full_name?: string }[] | null;
};

type PT = {
  id: string;
  full_name: string;
  professional_name?: string | null;
  bio?: string | null;
  specialisations?: string[] | null;
  training_locations?: string[] | null;
  session_types?: string[] | null;
  service_areas?: string[] | null;
  years_of_experience?: number | null;
  is_certified_verified?: boolean | null;
};

export default function TrainerTabs({
  pt,
  offerings,
  reviews,
  avgRating,
  reviewCount,
}: {
  pt: PT;
  offerings: Offering[];
  reviews: Review[];
  avgRating: number | null;
  reviewCount: number;
}) {
  const [tab, setTab] = useState<"about" | "sessions">("about");

  const tabs = [
    { key: "about", label: "About" },
    { key: "sessions", label: `Sessions (${offerings.length})` },
  ] as const;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── About tab ── */}
      {tab === "about" && (
        <div className="max-w-3xl">
          {pt.bio && (
            <p className="text-gray-600 leading-relaxed text-sm mb-6">{pt.bio}</p>
          )}

          {pt.specialisations && pt.specialisations.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Specialisations</h2>
              <div className="flex flex-wrap gap-2">
                {pt.specialisations.map((spec) => (
                  <span key={spec} className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 font-medium">
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pt.training_locations && pt.training_locations.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Training Locations</h2>
              <div className="flex flex-wrap gap-2">
                {pt.training_locations.map((loc) => (
                  <span key={loc} className="inline-flex items-center gap-1.5 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pt.session_types && pt.session_types.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Session Types</h2>
              <div className="flex flex-wrap gap-2">
                {pt.session_types.map((type) => (
                  <span key={type} className="inline-flex items-center gap-1.5 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pt.service_areas && pt.service_areas.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Service Areas</h2>
              <div className="flex flex-wrap gap-2">
                {pt.service_areas.map((area) => (
                  <span key={area} className="inline-flex items-center gap-1.5 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                    </svg>
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(pt.years_of_experience != null || pt.is_certified_verified) && (
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-8 py-4 border-t border-b border-gray-100">
              {pt.years_of_experience != null && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{pt.years_of_experience} year{pt.years_of_experience !== 1 ? "s" : ""} of experience</span>
                </div>
              )}
              {pt.is_certified_verified && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <span className="text-blue-700 font-medium">Certified & Verified trainer</span>
                </div>
              )}
            </div>
          )}

          {/* Reviews */}
          <div className="mt-2">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              Reviews
              {reviewCount > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({reviewCount})</span>}
            </h2>

            {reviewCount === 0 ? (
              <div className="py-8 text-center border border-gray-100 rounded-2xl">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-500 text-sm">No reviews yet</p>
              </div>
            ) : (
              <>
                {avgRating !== null && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl mb-4">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
                      <div className="flex items-center gap-0.5 mt-1 justify-center">
                        {[1, 2, 3, 4, 5].map((i) => <StarFull key={i} filled={i <= Math.round(avgRating)} />)}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{reviewCount} review{reviewCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviews.filter((r) => r.rating === star).length;
                        const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-3">{star}</span>
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="#f59e0b">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-4">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {reviews.map((review, idx) => {
                    const usersRaw = review.users;
                    const reviewer = (Array.isArray(usersRaw) ? usersRaw[0]?.full_name : (usersRaw as { full_name?: string } | null)?.full_name) ?? "Anonymous";
                    const dateStr = review.created_at
                      ? new Date(review.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                      : "";
                    return (
                      <div key={idx} className="border border-gray-100 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
                              {getInitials(reviewer)}
                            </div>
                            <p className="text-sm font-medium text-gray-900">{reviewer}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((i) => <StarFull key={i} filled={i <= review.rating} />)}
                            </div>
                            {dateStr && <span className="text-xs text-gray-400">{dateStr}</span>}
                          </div>
                        </div>
                        {review.comment && <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Sessions tab ── */}
      {tab === "sessions" && (
        <div>
          {offerings.length === 0 ? (
            <div className="py-12 text-center border border-gray-100 rounded-2xl">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-sm">No sessions listed yet.</p>
              <p className="text-gray-400 text-xs mt-1">Contact this trainer directly to discuss availability.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {offerings.map((offering) => (
                <li key={offering.id}>
                  <Link
                    href={`/pt-offerings/${offering.id}`}
                    className="flex gap-4 py-4 rounded-lg hover:bg-gray-50 transition-colors duration-150"
                  >
                    {/* Thumbnail */}
                    {offering.image_url ? (
                      <img
                        src={offering.image_url}
                        alt={offering.title}
                        className="w-[110px] h-[110px] rounded-xl object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-[110px] h-[110px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {offering.type && (
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded capitalize ${TYPE_COLORS[offering.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {offering.type.replace("-", " ")}
                          </span>
                        )}
                        {offering.duration_minutes && (
                          <span className="text-xs text-gray-400">{formatDuration(offering.duration_minutes)}</span>
                        )}
                        {offering.max_participants && offering.max_participants > 1 && (
                          <span className="text-xs text-gray-400">· Up to {offering.max_participants} people</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{offering.title}</p>
                      {offering.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-1.5">
                          {offering.description}
                        </p>
                      )}
                      {offering.price_kes != null && Number(offering.price_kes) > 0 ? (
                        <p className="text-sm font-bold text-gray-900">KES {Number(offering.price_kes).toLocaleString()}</p>
                      ) : (
                        <p className="text-xs text-gray-400">Price on request</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
