"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Gym = {
  id: string;
  slug?: string | null;
  name: string;
  location: string;
  image_url: string | null;
  description: string | null;
};

type Session = {
  id: string;
  slug?: string | null;
  name: string;
  date: string;
  time: string;
  drop_in_price: number | null;
  image_url: string | null;
  gym_id: string;
  spots_left: number;
  category: string | null;
  gyms?: { name: string; deposit_pct: number | null } | null;
};

type Experience = {
  id: string;
  slug?: string | null;
  name: string;
  tagline: string | null;
  date: string;
  start_time: string;
  price_kes: number;
  discount_kes: number;
  spots_left: number;
  image_url: string | null;
  category: string | null;
  gyms?: { name: string } | null;
};

type Trainer = {
  id: string;
  slug?: string | null;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  specialisations: string[];
  years_of_experience: number | null;
  is_certified_verified: boolean;
  avg_rating: number | null;
  min_price: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function sessionDeposit(s: Session) {
  const total =
    s.drop_in_price && Number(s.drop_in_price) > 0
      ? Number(s.drop_in_price)
      : 0;
  const pct = s.gyms?.deposit_pct ?? 30;
  const deposit = Math.round((total * pct) / 100);
  return { deposit, remainder: total - deposit };
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  seeAllHref,
}: {
  eyebrow: string;
  title: string;
  seeAllHref?: string;
}) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-1">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
          {title}
        </h2>
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors flex-shrink-0 pb-0.5"
        >
          See all →
        </Link>
      )}
    </div>
  );
}

// ─── Date Rail ────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
      {days.map(({ date, dateStr }) => {
        const on = dateStr === selected;
        const isToday = dateStr === todayStr;
        const hasDot = sessionDates.has(dateStr);
        return (
          <button
            key={dateStr}
            onClick={() => onSelect(dateStr)}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-full border text-center transition-colors ${
              on
                ? "bg-gray-900 border-gray-900 text-white"
                : "bg-white border-gray-200 text-gray-700 hover:border-gray-400"
            }`}
          >
            <span className={`text-[9px] font-bold uppercase tracking-wide ${on ? "text-white/70" : "text-gray-400"}`}>
              {isToday ? "Today" : DOW[date.getDay()]}
            </span>
            <span className={`text-lg font-black leading-tight ${on ? "text-white" : "text-gray-900"}`}>
              {date.getDate()}
            </span>
            {hasDot && (
              <span className={`w-1 h-1 rounded-full mt-0.5 ${on ? "bg-white/60" : "bg-blue-500"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Overlay Card (sessions / experiences) ────────────────────────────────────

function OverlayCard({
  imageUrl,
  catLabel,
  name,
  tagline,
  metaText,
  dateBadge,
  scarcity,
  priceLabel,
  priceSub,
  priceRemainder,
  saveBadge,
  href,
}: {
  imageUrl: string | null;
  catLabel: string;
  name: string;
  tagline?: string | null;
  metaText?: string | null;
  dateBadge?: { mon: string; day: number } | null;
  scarcity?: string | null;
  priceLabel: ReactNode;
  priceSub: string;
  priceRemainder?: string | null;
  saveBadge?: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: "160px" }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
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

        {/* Top row: category tag + date badge */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
            {catLabel}
          </span>
          {dateBadge ? (
            <div className="bg-white rounded-xl px-2 py-1 text-center shadow-sm">
              <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wide leading-none">
                {dateBadge.mon}
              </div>
              <div className="text-lg font-black text-gray-900 leading-tight">
                {dateBadge.day}
              </div>
            </div>
          ) : scarcity ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">
              🔥 {scarcity}
            </span>
          ) : null}
        </div>

        {saveBadge && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center px-2.5 py-1 rounded-full bg-green-500 text-white text-[11px] font-bold">
            {saveBadge}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5">
        <p className="font-black text-gray-900 text-base truncate">{name}</p>
        {tagline && (
          <p className="text-gray-400 text-xs italic mt-0.5 truncate">{tagline}</p>
        )}
        {metaText && (
          <p className="text-gray-400 text-xs mt-1 truncate">{metaText}</p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">{priceLabel}</p>
          {priceSub && <p className="text-gray-400 text-[11px]">{priceSub}</p>}
          {priceRemainder && (
            <p className="text-gray-400 text-[11px]">{priceRemainder}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Stacked Card (venues / trainers) ─────────────────────────────────────────

function StackedCard({
  imageUrl,
  fallbackBg = "#1d3cb0",
  catLabel,
  rating,
  verified,
  name,
  tagline,
  meta1,
  priceLabel,
  href,
}: {
  imageUrl: string | null;
  fallbackBg?: string;
  catLabel: string;
  rating?: number | null;
  verified?: boolean;
  name: string;
  tagline?: string | null;
  meta1?: string | null;
  priceLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-md block hover:shadow-lg transition-shadow"
    >
      <div className="relative overflow-hidden" style={{ height: "180px" }}>
        {imageUrl ? (
          <img
            src={imageUrl.split(",")[0]}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: fallbackBg }}
          >
            <svg className="w-10 h-10 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/55 text-white text-[11px] font-bold">
            {catLabel}
          </span>
          {rating != null ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white shadow-sm text-xs font-bold text-gray-900">
              ★ {rating}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white shadow-sm text-[11px] font-bold text-gray-900">
              New
            </span>
          )}
        </div>
        {verified && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/92 text-blue-600 text-[11px] font-bold">
            ✓ Verified Pro
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-base truncate">{name}</p>
        {tagline && <p className="text-gray-400 text-xs italic mt-0.5 truncate">{tagline}</p>}
        {meta1 && (
          <p className="text-gray-400 text-xs mt-1 truncate">📍 {meta1}</p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-sm font-bold text-gray-900">{priceLabel}</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Editorial Card ───────────────────────────────────────────────────────────

function EditorialCard({
  img,
  eyebrow,
  title,
  desc,
}: {
  img: string;
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden shadow-sm" style={{ aspectRatio: "3/4" }}>
      <img src={img} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.72))" }} />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/75 mb-1">{eyebrow}</p>
        <p className="text-white font-black text-xl leading-tight">{title}</p>
        <p className="text-white/75 text-xs mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const HOW_STEPS = [
  { num: "01", title: "Discover", desc: "Browse 50+ Nairobi venues, classes and trainers in one place." },
  { num: "02", title: "Book", desc: "Reserve with a small deposit — pay the balance at the venue." },
  { num: "03", title: "Show up", desc: "Scan to check in. One pass works everywhere you move." },
];

function HowItWorks() {
  return (
    <div className="bg-gray-900 rounded-3xl p-8 lg:p-10">
      <p className="text-[11px] font-bold tracking-widest uppercase text-blue-500 mb-2">How it works</p>
      <h2 className="text-2xl font-black text-white leading-tight mb-8">
        Pick a class, tap book, show up
      </h2>
      <div className="grid sm:grid-cols-3 gap-6">
        {HOW_STEPS.map((step) => (
          <div key={step.num} className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-black text-sm">{step.num}</span>
            </div>
            <div>
              <p className="text-white font-bold text-base">{step.title}</p>
              <p className="text-white/55 text-sm leading-relaxed mt-1">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Editorial data ───────────────────────────────────────────────────────────

const FOR_EVERYONE = [
  { img: "/images/ref.jpeg",  eyebrow: "Early risers",   title: "Morning movers",     desc: "Sunrise classes before the city wakes." },
  { img: "/images/plts.webp", eyebrow: "Wind down",      title: "Restore & recover",  desc: "Yoga, spa and mobility sessions." },
  { img: "/images/yoga.jpg",  eyebrow: "Bring a friend", title: "Train together",      desc: "Group classes with room for two." },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [calSelected, setCalSelected] = useState(() => toDateStr(new Date()));

  const next14Days = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return { date: d, dateStr: toDateStr(d) };
    }),
  []);

  const sessionDates = useMemo(
    () => new Set(sessions.map((s) => s.date)),
    [sessions],
  );

  const visibleSessions = useMemo(
    () => sessions.filter((s) => s.date === calSelected),
    [sessions, calSelected],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const todayStr = toDateStr(new Date());
        const endStr = toDateStr((() => { const d = new Date(); d.setDate(d.getDate() + 13); return d; })());

        const [gymsRes, sessRes, expRes, ptRes] = await Promise.all([
          supabase.from("gyms").select("id, slug, name, location, image_url, description").eq("is_active", true).limit(6),
          supabase.from("sessions")
            .select("id, slug, name, date, time, drop_in_price, image_url, gym_id, spots_left, category, gyms(name, deposit_pct)")
            .gte("date", todayStr).lte("date", endStr)
            .order("date", { ascending: true }).order("time", { ascending: true }).limit(60),
          supabase.from("experiences")
            .select("id, slug, name, tagline, date, start_time, price_kes, discount_kes, spots_left, image_url, category, gyms(name)")
            .eq("is_active", true).gte("date", todayStr)
            .order("date", { ascending: true }).limit(6),
          supabase.from("personal_trainers")
            .select("id, slug, full_name, professional_name, photo_url, specialisations, years_of_experience, is_certified_verified")
            .eq("status", "approved").limit(8),
        ]);

        setGyms(gymsRes.data ?? []);
        setSessions((sessRes.data ?? []) as unknown as Session[]);
        setExperiences((expRes.data ?? []) as unknown as Experience[]);

        const ptData = ptRes.data ?? [];
        if (ptData.length) {
          const ptIds = ptData.map((p: any) => p.id);
          const [pricesRes, reviewsRes] = await Promise.all([
            supabase.from("pt_offerings").select("pt_id, price_kes").in("pt_id", ptIds).eq("is_active", true).eq("is_draft", false),
            supabase.from("pt_reviews").select("pt_id, rating").in("pt_id", ptIds),
          ]);
          setTrainers(
            ptData.map((pt: any) => {
              const offers = pricesRes.data?.filter((o: any) => o.pt_id === pt.id) ?? [];
              const reviews = reviewsRes.data?.filter((r: any) => r.pt_id === pt.id) ?? [];
              const prices = offers.map((o: any) => o.price_kes).filter(Boolean) as number[];
              const avg = reviews.length
                ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
                : null;
              return {
                ...pt,
                min_price: prices.length ? Math.min(...prices) : null,
                avg_rating: avg ? Math.round(avg * 10) / 10 : null,
              };
            }),
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-white min-h-screen">

      {/* ── Hero ── */}
      <section className="bg-white pt-14 pb-12 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-3">
            Lana · Nairobi
          </p>
          <h1 className="text-4xl lg:text-6xl font-black text-gray-900 leading-[1.05] tracking-tight mb-4 max-w-3xl">
            Get active, wherever you want.
          </h1>
          <p className="text-gray-500 text-base leading-relaxed mb-8 max-w-xl">
            Access to gyms, studios, wellness experiences, kids activities, coaches and trainers across Nairobi — all in one pass.
          </p>
          <Link
            href="/sessions"
            className="inline-flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 hover:border-gray-400 transition-colors group"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-gray-400 text-base flex-1">Search classes, gyms, trainers...</span>
            <span className="text-xs font-bold text-blue-600 group-hover:underline">Browse →</span>
          </Link>
        </div>
      </section>

      {/* ── Partner with us ── */}
      <section className="bg-gray-950 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-blue-400 mb-2">Partner with us</p>
            <p className="text-white font-bold text-lg leading-snug max-w-xl">
              Are you a gym, personal trainer, coach, studio, wellness venue or fitness experiences provider?
            </p>
            <p className="text-white/55 text-sm mt-1.5 max-w-lg">
              Join Nairobi's leading sports and wellness platform and reach thousands of active customers.
            </p>
          </div>
          <Link
            href="/partners/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-gray-900 font-bold text-sm px-6 py-3 rounded-full hover:bg-gray-100 transition-colors"
          >
            Become a Partner →
          </Link>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 space-y-14 pb-20">

        {/* ── Coming Up Soon ── */}
        {(loading || sessions.length > 0) && (
          <section>
            <SectionHeader eyebrow="Your schedule" title="Coming Up Soon" seeAllHref="/sessions" />
            <DateRail
              days={next14Days}
              selected={calSelected}
              sessionDates={sessionDates}
              onSelect={setCalSelected}
            />
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
                ))}
              </div>
            ) : visibleSessions.length === 0 ? (
              <div className="flex items-center gap-2 py-8 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium">No classes on this day</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleSessions.slice(0, 8).map((s) => {
                  const { deposit, remainder } = sessionDeposit(s);
                  const d = new Date(s.date);
                  return (
                    <OverlayCard
                      key={s.id}
                      imageUrl={s.image_url}
                      catLabel={s.category || "Class"}
                      name={s.name}
                      tagline={s.gyms?.name}
                      metaText={fmtTime(s.time)}
                      dateBadge={{ mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), day: d.getDate() }}
                      priceLabel={`KES ${deposit.toLocaleString()}`}
                      priceSub="deposit"
                      priceRemainder={remainder > 0 ? `+${remainder.toLocaleString()} at venue` : null}
                      href={`/sessions/${s.slug ?? s.id}`}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Something for Everyone ── */}
        <section>
          <SectionHeader eyebrow="Curated for you" title="Something for everyone" />
          <div className="grid grid-cols-3 gap-4">
            {FOR_EVERYONE.map((item) => (
              <EditorialCard key={item.title} {...item} />
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <HowItWorks />

        {/* ── Explore Top Venues ── */}
        {(loading || gyms.length > 0) && (
          <section>
            <SectionHeader eyebrow="Near you" title="Explore Top Venues" seeAllHref="/venues" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {loading
                ? [...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
                  ))
                : gyms.map((gym) => (
                    <StackedCard
                      key={gym.id}
                      imageUrl={gym.image_url}
                      catLabel="Venue"
                      name={gym.name}
                      tagline={gym.description}
                      meta1={gym.location}
                      priceLabel="Explore"
                      href={`/venues/${gym.slug ?? gym.id}`}
                    />
                  ))}
            </div>
          </section>
        )}

        {/* ── Experiences ── */}
        {(loading || experiences.length > 0) && (
          <section>
            <SectionHeader eyebrow="Beyond the gym" title="Experiences" seeAllHref="/experiences" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {loading
                ? [...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "260px" }} />
                  ))
                : experiences.map((exp) => {
                    const scarcity =
                      exp.spots_left > 0 && exp.spots_left <= 6
                        ? `${exp.spots_left} spots left`
                        : null;
                    const d = new Date(exp.date);
                    const discount = Number(exp.discount_kes) || 0;
                    const hasDiscount = discount > 0;
                    const finalPrice = Number(exp.price_kes) - discount;
                    return (
                      <OverlayCard
                        key={exp.id}
                        imageUrl={exp.image_url}
                        catLabel={exp.category || "Experience"}
                        name={exp.name}
                        tagline={exp.tagline}
                        metaText={d.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                        scarcity={scarcity}
                        saveBadge={hasDiscount ? `Save KES ${discount.toLocaleString()}` : null}
                        priceLabel={
                          hasDiscount ? (
                            <span className="flex items-baseline gap-1.5">
                              <span className="text-gray-400 line-through text-xs font-medium">
                                KES {Number(exp.price_kes).toLocaleString()}
                              </span>
                              <span>KES {finalPrice.toLocaleString()}</span>
                            </span>
                          ) : (
                            `KES ${Number(exp.price_kes).toLocaleString()}`
                          )
                        }
                        priceSub="per person"
                        href={`/experiences/${exp.slug ?? exp.id}`}
                      />
                    );
                  })}
            </div>
          </section>
        )}

        {/* ── Train with a Pro ── */}
        {(loading || trainers.length > 0) && (
          <section>
            <SectionHeader eyebrow="1-on-1 coaching" title="Train with a Pro" seeAllHref="/trainers" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {loading
                ? [...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-2xl bg-gray-100 animate-pulse" style={{ height: "280px" }} />
                  ))
                : trainers.map((pt) => (
                    <StackedCard
                      key={pt.id}
                      imageUrl={pt.photo_url}
                      fallbackBg="#1d3cb0"
                      catLabel={pt.specialisations[0] || "Trainer"}
                      rating={pt.avg_rating}
                      verified={pt.is_certified_verified}
                      name={pt.professional_name ?? pt.full_name}
                      tagline={pt.specialisations.slice(0, 2).join(" · ") || null}
                      meta1={pt.years_of_experience ? `${pt.years_of_experience} yrs exp` : null}
                      priceLabel={
                        pt.min_price
                          ? `from KES ${pt.min_price.toLocaleString()}`
                          : "Book a session"
                      }
                      href={`/trainers/${pt.slug ?? pt.id}`}
                    />
                  ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
