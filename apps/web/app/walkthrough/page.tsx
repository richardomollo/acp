"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const SLIDES = [
  {
    accent: "#000000",
    eyebrow: "Welcome to Active CityPass",
    headline: "All of Nairobi's fitness in one membership",
    body: "Gyms, yoga, boxing, swimming, spas, kids activities — one flexible pass unlocks them all. Train, play, and unwind on your terms.",
  },
  {
    accent: "#000000",
    eyebrow: "50+ Venues across Nairobi",
    headline: "Discover world-class venues near you",
    body: "From Westlands to Karen, Kilimani to Lavington — browse top-rated gyms, studios, pools, and wellness centres all on one map.",
  },
  {
    accent: "#000000",
    eyebrow: "Instant booking",
    headline: "Pick a class, tap book, show up",
    body: "Browse real-time availability, book in seconds, and get an instant confirmation. No phone calls, no forms — just tap and go.",
  },
  {
    accent: "#000000",
    eyebrow: "One credit, endless choice",
    headline: "Use credits across anything you love",
    body: "Gym session Monday, yoga Tuesday, spa Friday — your credits work across every partner venue. Mix and match as your week demands.",
  },
  {
    accent: "#050040",
    eyebrow: "Start free today",
    headline: "14 days on us, no strings attached",
    body: "Try Active CityPass completely free for 14 days. Book sessions, explore venues, and find what you love — no card needed to start.",
  },
];

const COLLAGE = [
  // [col, objectPosition]
  ["15%_20%", "10%_80%"],   // col 1: top, bottom
  ["50%_15%", "55%_85%"],   // col 2: top, bottom (offset)
  ["85%_25%", "80%_70%"],   // col 3: top, bottom
] as const;

export default function WalkthroughPage() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isLast = current === SLIDES.length - 1;

  const goTo = (index: number, dir: "forward" | "back") => {
    if (animating || index < 0 || index >= SLIDES.length) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrent(index);
      setAnimating(false);
    }, 280);
  };

  const next = () => goTo(current + 1, "forward");
  const back = () => goTo(current - 1, "back");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, animating]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : back();
    touchStartX.current = null;
  };

  const slide = SLIDES[current];

  return (
    <>
      {/* ── Mobile: ClassPass-style single screen ── */}
      <div className="md:hidden min-h-screen flex flex-col bg-white">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/">
            <img src="/images/logo.png" alt="Active CityPass" className="h-9 w-auto" />
          </Link>
          <Link href="/sessions" className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">
            Explore →
          </Link>
        </div>

        {/* Image collage */}
        <div className="grid grid-cols-3 gap-1.5 mx-3" style={{ height: "42vh" }}>
          {COLLAGE.map(([top, bottom], colIdx) => (
            <div key={colIdx} className={`flex flex-col gap-1.5 ${colIdx === 1 ? "mt-6" : ""}`}>
              <div className="flex-1 overflow-hidden rounded-2xl">
                <img
                  src="/images/ref.jpeg"
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: top }}
                />
              </div>
              <div className="flex-1 overflow-hidden rounded-2xl">
                <img
                  src="/images/yoga.jpg"
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: bottom }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col px-6 pt-7 pb-8 flex-1">
          <h1 className="text-[1.75rem] font-bold text-gray-900 leading-tight mb-3">
            All of Nairobi's fitness, wellness &amp; fun
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-7">
            Active CityPass gives you access to 50+ top-rated gyms, studios, pools, spas, and kids activities — one flexible pass unlocks them all.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/login?view=signup"
              className="w-full text-center bg-[#000] text-white font-bold py-4 rounded-full text-sm hover:bg-indigo-900 transition"
            >
              Get 14 days free
            </Link>
            <Link
              href="/login"
              className="w-full text-center border-2 border-[#000] text-[#000] font-bold py-[14px] rounded-full text-sm hover:bg-gray-50 transition"
            >
              I already have an account
            </Link>
            <Link
              href="/sessions"
              className="w-full text-center text-gray-500 font-medium py-2 underline underline-offset-2 text-sm"
            >
              Browse classes &amp; sessions
            </Link>
          </div>

          <p className="text-gray-400 text-xs text-center mt-auto pt-6 leading-relaxed">
            14-day free trial available for new members only. Cancel anytime.
          </p>
        </div>
      </div>

      {/* ── Desktop: split-screen slide walkthrough ── */}
      <div className="hidden md:flex h-screen overflow-hidden">

        {/* Left: image panel */}
        <div className="relative flex w-1/2 flex-col flex-shrink-0">
          <img src="/images/desktop.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-[#000]/40" />

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between p-8">
            <Link href="/" className="inline-flex">
              <img src="/images/logo-white.png" alt="Active CityPass" className="h-12 w-auto" />
            </Link>
          </div>

          {/* Tagline */}
          <div className="relative z-10 flex flex-col items-start justify-center flex-1 p-8">
            <p className="text-white/80 text-xs font-semibold tracking-widest uppercase mb-2">
              One pass. 50+ venues. Unlimited possibilities.
            </p>
            <h2 className="text-white text-3xl font-bold leading-snug mb-3">
              Nairobi's most flexible sports &amp; wellness membership
            </h2>
            <p className="text-white/80 text-sm leading-relaxed">
              Activities for individuals, partners, kids, and families — train, play, and unwind anytime, anywhere.
            </p>
          </div>
        </div>

        {/* Right: slides panel */}
        <div
          className="flex-1 flex flex-col bg-white overflow-y-auto"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex justify-end px-8 pt-6 pb-2">
            <Link href="/sessions" className="text-sm text-gray-400 hover:text-gray-700 transition font-medium">
              Explore →
            </Link>
          </div>

          {/* Slide content */}
          <div
            className="flex-1 flex flex-col items-center justify-center px-8 py-8"
            style={{
              opacity: animating ? 0 : 1,
              transform: animating
                ? `translateX(${direction === "forward" ? "30px" : "-30px"})`
                : "translateX(0)",
              transition: "opacity 0.28s ease, transform 0.28s ease",
            }}
          >
            <div className="text-center max-w-sm">
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: slide.accent }}>
                {slide.eyebrow}
              </p>
              <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-4">
                {slide.headline}
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                {slide.body}
              </p>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="px-8 pb-8 pt-2">
            {isLast ? (
              <div className="flex flex-col gap-3 max-w-sm mx-auto">
                <Link
                  href="/login?view=signup"
                  className="w-full text-center bg-[#000] text-white font-bold py-3.5 rounded-full hover:bg-indigo-900 transition text-sm"
                >
                  Start my free 14-day trial
                </Link>
                <Link
                  href="/login"
                  className="w-full text-center border border-gray-10 text-gray-600 font-medium py-3.5 rounded-full hover:bg-gray-50 transition text-sm"
                >
                  I already have an account
                </Link>
                <Link
                  href="/sessions"
                  className="w-full text-center text-gray-400 hover:text-gray-600 transition text-sm"
                >
                  Explore Active CityPass →
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between max-w-sm mx-auto">
                <button
                  onClick={back}
                  disabled={current === 0}
                  className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-400 transition disabled:opacity-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>

                <div className="flex gap-2">
                  {SLIDES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goTo(i, i > current ? "forward" : "back")}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === current ? 20 : 8,
                        height: 8,
                        background: i === current ? "#000" : "#e5e7eb",
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={next}
                  className="w-11 h-11 rounded-full bg-[#000] flex items-center justify-center text-white hover:bg-indigo-900 transition shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
