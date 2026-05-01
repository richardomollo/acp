"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const SLIDES = [
  {
    // id: 1,
    accent: "#000000",
    // illustration: (
    //   <svg viewBox="0 0 320 280" fill="none" className="w-full max-w-xs mx-auto">
    //     <rect x="20" y="160" width="40" height="100" rx="4" fill="#c7d2fe" opacity=".4"/>
    //     <rect x="70" y="130" width="50" height="130" rx="4" fill="#a5b4fc" opacity=".5"/>
    //     <rect x="130" y="100" width="60" height="160" rx="4" fill="#818cf8" opacity=".6"/>
    //     <rect x="200" y="140" width="45" height="120" rx="4" fill="#a5b4fc" opacity=".5"/>
    //     <rect x="255" y="170" width="45" height="90" rx="4" fill="#c7d2fe" opacity=".4"/>
    //     {[140,160,180,200].map(y => [140,155,170].map(x => (
    //       <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="1" fill="#6366f1" opacity=".4"/>
    //     )))}
    //     <circle cx="160" cy="60" r="22" fill="#6366f1"/>
    //     <path d="M148 82 Q160 130 172 82" stroke="#818cf8" strokeWidth="3" fill="none"/>
    //     <path d="M148 100 L135 125 M172 100 L185 125" stroke="#818cf8" strokeWidth="3" strokeLinecap="round"/>
    //     <circle cx="160" cy="60" r="40" fill="#6366f1" opacity=".1"/>
    //     {[[50,40],[270,30],[290,80],[30,90],[310,130]].map(([cx,cy],i) => (
    //       <circle key={i} cx={cx} cy={cy} r="2" fill="#6366f1" opacity=".4"/>
    //     ))}
    //   </svg>
    // ),
    eyebrow: "Welcome to Active CityPass",
    headline: "All of Nairobi's fitness in one membership",
    body: "Gyms, yoga, boxing, swimming, spas, kids activities — one flexible pass unlocks them all. Train, play, and unwind on your terms.",
  },
  {
    // id: 2,
    accent: "#000000",
    // illustration: (
    //   <svg viewBox="0 0 320 280" fill="none" className="w-full max-w-xs mx-auto">
    //     <circle cx="160" cy="140" r="90" fill="#bae6fd" opacity=".2"/>
    //     <circle cx="160" cy="140" r="60" fill="#7dd3fc" opacity=".15"/>
    //     {[
    //       { x: 80,  y: 80,  label: "Gym",  color: "#0ea5e9" },
    //       { x: 195, y: 65,  label: "Yoga", color: "#a78bfa" },
    //       { x: 60,  y: 165, label: "Spa",  color: "#fb7185" },
    //       { x: 210, y: 170, label: "Pool", color: "#34d399" },
    //     ].map(({ x, y, label, color }) => (
    //       <g key={label}>
    //         <rect x={x-28} y={y-18} width="56" height="36" rx="8" fill={color} opacity=".1" stroke={color} strokeWidth="1"/>
    //         <circle cx={x} cy={y} r="10" fill={color}/>
    //         <text x={x} y={y+4} textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">{label[0]}</text>
    //         <line x1={x} y1={y+10} x2="160" y2="140" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity=".4"/>
    //       </g>
    //     ))}
    //     <circle cx="160" cy="140" r="14" fill="#0ea5e9"/>
    //     <circle cx="160" cy="140" r="6" fill="white"/>
    //     <circle cx="160" cy="140" r="28" fill="#0ea5e9" opacity=".15"/>
    //   </svg>
    // ),
    eyebrow: "50+ Venues across Nairobi",
    headline: "Discover world-class venues near you",
    body: "From Westlands to Karen, Kilimani to Lavington — browse top-rated gyms, studios, pools, and wellness centres all on one map.",
  },
  {
    // id: 3,
    accent: "#000000",
    // illustration: (
    //   <svg viewBox="0 0 320 280" fill="none" className="w-full max-w-xs mx-auto">
    //     <rect x="105" y="20" width="110" height="200" rx="18" fill="#d1fae5" stroke="#10b981" strokeWidth="2"/>
    //     <rect x="113" y="35" width="94" height="170" rx="10" fill="#f0fdf4"/>
    //     <rect x="145" y="22" width="30" height="6" rx="3" fill="#d1fae5"/>
    //     <rect x="113" y="35" width="94" height="24" fill="#10b981"/>
    //     <text x="160" y="51" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">Book a Session</text>
    //     {[
    //       { y: 70,  name: "HIIT Class", time: "7:00 AM", spots: "3 left", color: "#10b981" },
    //       { y: 108, name: "Hot Yoga",   time: "9:30 AM", spots: "5 left", color: "#8b5cf6" },
    //       { y: 146, name: "Boxing",     time: "6:00 PM", spots: "2 left", color: "#f97316" },
    //     ].map(({ y, name, time, spots, color }) => (
    //       <g key={name}>
    //         <rect x="120" y={y} width="80" height="30" rx="6" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
    //         <rect x="120" y={y} width="4" height="30" rx="2" fill={color}/>
    //         <text x="130" y={y+12} fill="#111827" fontSize="7" fontWeight="600">{name}</text>
    //         <text x="130" y={y+23} fill="#6b7280" fontSize="6">{time}</text>
    //         <text x="192" y={y+18} textAnchor="end" fill={color} fontSize="6" fontWeight="600">{spots}</text>
    //       </g>
    //     ))}
    //     <rect x="128" y="185" width="64" height="16" rx="8" fill="#10b981"/>
    //     <text x="160" y="196" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold">Book Now</text>
    //   </svg>
    // ),
    eyebrow: "Instant booking",
    headline: "Pick a class, tap book, show up",
    body: "Browse real-time availability, book in seconds, and get an instant confirmation. No phone calls, no forms — just tap and go.",
  },
  {
    // id: 4,
    accent: "#000000",
    // illustration: (
    //   <svg viewBox="0 0 320 280" fill="none" className="w-full max-w-xs mx-auto">
    //     <circle cx="160" cy="120" r="55" fill="#ede9fe" opacity=".5"/>
    //     <circle cx="160" cy="120" r="42" fill="#ddd6fe" opacity=".5"/>
    //     <circle cx="160" cy="120" r="30" fill="#8b5cf6"/>
    //     <text x="160" y="128" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold">C</text>
    //     {[
    //       { angle: 0,   label: "🏋️" },
    //       { angle: 60,  label: "🧘" },
    //       { angle: 120, label: "🥊" },
    //       { angle: 180, label: "💆" },
    //       { angle: 240, label: "🏊" },
    //       { angle: 300, label: "🎭" },
    //     ].map(({ angle, label }) => {
    //       const rad = (angle * Math.PI) / 180;
    //       const x = 160 + 75 * Math.cos(rad);
    //       const y = 120 + 75 * Math.sin(rad);
    //       return (
    //         <g key={angle}>
    //           <circle cx={x} cy={y} r="18" fill="white" stroke="#8b5cf6" strokeWidth="1.5"/>
    //           <text x={x} y={y+6} textAnchor="middle" fontSize="14">{label}</text>
    //         </g>
    //       );
    //     })}
    //     <circle cx="160" cy="120" r="75" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 4" opacity=".4"/>
    //   </svg>
    // ),
    eyebrow: "One credit, endless choice",
    headline: "Use credits across anything you love",
    body: "Gym session Monday, yoga Tuesday, spa Friday — your credits work across every partner venue. Mix and match as your week demands.",
  },
  {
    // id: 5,
    accent: "#050040",
    // illustration: (
    //   <svg viewBox="0 0 320 280" fill="none" className="w-full max-w-xs mx-auto">
    //     <circle cx="160" cy="110" r="65" fill="#e0e7ff" opacity=".4"/>
    //     <path d="M125 60 h70 v55 a35 35 0 01-70 0Z" fill="#c7d2fe" stroke="#6366f1" strokeWidth="2"/>
    //     <path d="M125 80 Q105 80 105 100 Q105 120 125 115" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    //     <path d="M195 80 Q215 80 215 100 Q215 120 195 115" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    //     <rect x="148" y="115" width="24" height="30" rx="2" fill="#a5b4fc" stroke="#6366f1" strokeWidth="1.5"/>
    //     <rect x="135" y="145" width="50" height="10" rx="5" fill="#818cf8" stroke="#6366f1" strokeWidth="1.5"/>
    //     <path d="M160 75 l5 15 h16 l-13 9 5 15-13-9-13 9 5-15-13-9h16z" fill="#6366f1"/>
    //     {[[80,40,"#f472b6"],[240,35,"#34d399"],[70,170,"#fbbf24"],[250,165,"#a78bfa"],[90,100,"#60a5fa"],[235,110,"#fb923c"]].map(([cx,cy,fill],i)=>(
    //       <rect key={i} x={Number(cx)-4} y={Number(cy)-4} width="8" height="8" rx="2" fill={String(fill)} opacity=".8"
    //         transform={`rotate(${i*30} ${cx} ${cy})`}/>
    //     ))}
    //     <rect x="95" y="195" width="130" height="38" rx="10" fill="#050040"/>
    //     <text x="160" y="212" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">14-Day Free Trial</text>
    //     <text x="160" y="226" textAnchor="middle" fill="#a5b4fc" fontSize="8">No credit card required</text>
    //   </svg>
    // ),
    eyebrow: "Start free today",
    headline: "14 days on us, no strings attached",
    body: "Try Active CityPass completely free for 14 days. Book sessions, explore venues, and find what you love — no card needed to start.",
  },
];

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
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Left: fixed image panel ── */}
      <div className="relative hidden md:flex md:w-1/2 flex-col">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/desktop.jpg')" }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-[#000]/20" />

        {/* Logo */}
        <div className="relative z-10 p-8">
          <Link href="/" className="inline-flex">
            <img src="/images/logo-white.png" alt="Active CityPass" className="h-17 w-auto" />
          </Link>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 mt-auto p-30">
          <p className="text-white/90 text-xs font-semibold tracking-widest uppercase mb-3">
            One pass. 50+ venues. Unlimited possibilities.
          </p>
          <h2 className="text-white text-3xl font-bold leading-snug mb-3">
            Nairobi's most flexible sports & <br/>
             wellness membership
          </h2>
          <p className="text-white/90 text-sm leading-relaxed">
             The most flexible sports and wellness membership in Nairobi. Activities for individuals, partners, kids, and families — train, play, and unwind anytime, anywhere.
          </p>
        </div>
      </div>

      {/* ── Right: slides panel ── */}
      <div
        className="flex-1 flex flex-col bg-white min-h-screen"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Mobile logo (hidden on desktop) */}
        <div className="md:hidden flex items-center justify-between px-6 pt-6 pb-2">
          <Link href="/">
            <img src="/images/logo.png" alt="Active CityPass" className="h-10 w-auto" />
          </Link>
        </div>

        {/* Top bar */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2">
          {/* Progress pills */}
          <div className="flex gap-1.5 flex-1 max-w-[160px]">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > current ? "forward" : "back")}
                className="flex-1 h-1.5 rounded-full transition-all duration-300"
                style={{ background: i <= current ? "#050040" : "#e5e7eb" }}
              />
            ))}
          </div>
          <Link
            href="/sessions"
            className="text-sm text-gray-400 hover:text-gray-700 transition font-medium ml-6"
          >
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
          {/* Illustration */}
          <div className="w-full max-w-[260px] mb-8">
          </div>

          {/* Text */}
          <div className="text-center max-w-sm">
            <p
              className="text-xs font-bold tracking-widest uppercase mb-3"
              style={{ color: slide.accent }}
            >
              {slide.eyebrow}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-4">
              {slide.headline}
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              {slide.body}
            </p>
          </div>
        </div>

        {/* Bottom nav */}
        <div className="px-8 pb-10 pt-2">
          {isLast ? (
            <div className="flex flex-col gap-3 max-w-sm mx-auto">
              <Link
                href="/login?view=signup"
                className="w-full text-center bg-[#050040] text-white font-bold py-3.5 rounded-full hover:bg-indigo-900 transition text-sm"
              >
                Start my free 14-day trial
              </Link>
              <Link
                href="/login"
                className="w-full text-center border border-gray-200 text-gray-600 font-medium py-3.5 rounded-full hover:bg-gray-50 transition text-sm"
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
                      background: i === current ? "#050040" : "#e5e7eb",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={next}
                className="w-11 h-11 rounded-full bg-[#050040] flex items-center justify-center text-white hover:bg-indigo-900 transition shadow-md"
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
  );
}
