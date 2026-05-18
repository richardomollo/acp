"use client";

import { useState } from "react";
import Link from "next/link";

const PARTNER_TYPES = [
  { emoji: "🏋️", label: "Gyms & Fitness Centres" },
  { emoji: "🧘", label: "Yoga & Pilates Studios" },
  { emoji: "🥊", label: "Boxing & Martial Arts" },
  { emoji: "🏊", label: "Swimming Pools" },
  { emoji: "💆", label: "Spas & Wellness Centres" },
  { emoji: "🎭", label: "Dance Studios" },
  { emoji: "🧗", label: "Climbing Walls" },
  { emoji: "👨‍👩‍👧", label: "Kids Activities" },
];

const BENEFITS = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Reach New Clients",
    body: "Tap into thousands of active, health-conscious Nairobians actively searching for their next session. Most Active CityPass users are first-time visitors to the venues they book.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Fill Empty Slots",
    body: "Turn unused capacity into revenue. Active CityPass only promotes your available spots, so your loyal members' favourite times are never disrupted.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Powerful Dashboard",
    body: "Manage sessions, track bookings, and view earnings — all from one intuitive partner portal. No complex setup, no extra hardware.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Zero Risk",
    body: "No upfront fees. You only pay when you earn. We handle payment processing, customer support, and all the booking logistics.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    ),
    title: "Smart Pricing Tools",
    body: "Use dynamic credits to price your sessions by demand, day, and time — peak pricing, last-minute discounts, and more. Maximise revenue automatically.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: "Build Loyalty",
    body: "Convert Active CityPass visitors into long-term members. Our platform helps you showcase what makes your venue special and keeps clients coming back.",
  },
];

const STEPS = [
  { n: "01", title: "Apply Online", body: "Fill in your business details — name, location, what you offer, and when. Takes about 5 minutes." },
  { n: "02", title: "Get Approved", body: "Our team reviews your profile within 24–48 hours and sets you up for success." },
  { n: "03", title: "List Your Sessions", body: "Add classes, sessions, or open gym slots with your own schedule, capacity, and credit pricing." },
  { n: "04", title: "Start Earning", body: "Members book through Active CityPass. You get paid per visit — no subscriptions, no lock-in." },
];

const TESTIMONIALS = [
  {
    quote: "We were sceptical at first, but within two months we'd converted three CityPass visitors into full members. The extra bookings alone cover our listing.",
    name: "Amara Wanjiku",
    role: "Owner, Iron Haven Gym — Westlands",
  },
  {
    quote: "The partner dashboard is genuinely easy to use. I manage all our yoga class slots from my phone in minutes.",
    name: "Priya Mehta",
    role: "Studio Manager, Zen Flow Yoga — Karen",
  },
  {
    quote: "Our Saturday slots used to run at 60% capacity. Now they're routinely full. Active CityPass members are exactly our target demographic.",
    name: "David Ouma",
    role: "Director, AquaFit Nairobi — Kilimani",
  },
];

const FAQS = [
  {
    q: "What types of businesses can list on Active CityPass?",
    a: "Any sports, fitness, or wellness business in Nairobi — gyms, yoga studios, swimming pools, spas, climbing walls, kids' activity centres, dance studios, martial arts gyms, and more.",
  },
  {
    q: "How does payment work?",
    a: "Members pay Active CityPass using their credits. We pay you per confirmed visit at an agreed rate. Payouts are processed monthly, directly to your M-Pesa or bank account.",
  },
  {
    q: "Will CityPass members replace my existing members?",
    a: "No. You control which sessions and time slots you list. CityPass only fills capacity you've already made available, leaving your core members' spots untouched.",
  },
  {
    q: "How quickly can I go live?",
    a: "Most partners are approved and live within 48 hours of submitting their application. You can start adding sessions immediately after approval.",
  },
  {
    q: "Is there a contract or minimum commitment?",
    a: "No long-term contract. You can pause or remove your listing at any time. We succeed when you succeed.",
  },
];

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 py-5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left gap-4"
      >
        <span className="font-medium text-gray-900">{q}</span>
        <span className="flex-shrink-0 text-gray-400">
          {open ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </span>
      </button>
      {open && <p className="mt-3 text-gray-600 text-sm leading-relaxed">{a}</p>}
    </div>
  );
}

export default function PartnersLandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <section className="relative text-white overflow-hidden"
        style={{ backgroundImage: "url('/images/desktop.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="absolute inset-0 bg-white/" />
        <div className="relative max-w-7xl mx-auto px-6 md:px-16 py-24 md:py-36 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <span className="inline-block text-grey-300 text-xs font-semibold tracking-widest uppercase py-1 rounded-full mb-5">
              Grow your business. Fill every session.
            </span>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
              Turn empty spots <br /> into revenue with Us.
            </h1>
            <p className="text-lg text-grey-100 max-w-xl mb-8 leading-relaxed">
              Join Nairobi's leading sports and wellness network. Reach thousands of active members,
              turn empty slots into revenue, and keep full control of your schedule.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link href="/partner-signup"
                className="bg-black text-[#fff] font-semibold px-8 py-3.5 rounded-full hover:bg-indigo-50 transition text-center hover:text-[#000]">
                Become a Partner
              </Link>
              <Link href="/partner-login"
                className="border border-white/40 text-white font-medium px-8 py-3.5 rounded-full hover:bg-black/50 hover:border-black/40 transition text-center">
                Already a Partner? Sign in →
              </Link>
            </div>
          </div>

          {/* Quick stats column */}
          {/* <div className="flex-shrink-0 grid grid-cols-2 gap-4 w-full md:w-auto">
            {[
              { n: "50+", label: "Partner Venues" },
              { n: "5,000+", label: "Active Members" },
              { n: "10,000+", label: "Sessions Booked" },
              { n: "48 hrs", label: "To Go Live" },
            ].map(({ n, label }) => (
              <div key={label} className="bg-white/10 rounded-2xl p-6 text-center">
                <p className="text-3xl font-bold">{n}</p>
                <p className="text-indigo-200 text-sm mt-1">{label}</p>
              </div>
            ))}
          </div> */}
        </div>
      </section>

      {/* ── Partner Types ── */}
      <section className="bg-gray-50 py-14"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-16 text-center">
          <p className="text-sm font-semibold text-gray-500 tracking-widest uppercase mb-6">
            We work with all kinds of wellness businesses
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {PARTNER_TYPES.map(({ emoji, label }) => (
              <span key={label}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm font-medium text-gray-700">
                <span>{emoji}</span> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section id="benefits" className="py-14 ">
        <div className="max-w-7xl mx-auto px-6 md:px-16 text-center">
          <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything you need to grow
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Active CityPass handles discovery, payments, and customer support — so you can focus on what you do best.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {BENEFITS.map(({ icon, title, body }) => (
            <div key={title} className="bg-gray-50 rounded-2xl p-8 hover:shadow-md transition">
              <div className="w-12 h-12 rounded-xl bg-black-100 text-black-600 flex items-center justify-center mb-5">
                {icon}
              </div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        </div>
        
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="bg-[#fff] text-grey py-20">
        <div className="max-w-5xl mx-auto px-6 md:px-16">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-white-200">From application to first booking in as little as 48 hours.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="relative">
                <p className="text-5xl font-black text-white-500/30 mb-3">{n}</p>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-white-200 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/partner-signup"
              className="inline-block bg-black text-[#fff] font-semibold px-10 py-3.5 rounded-full hover:bg-indigo-50  hover:text-[#000] transition">
              Apply Now — It's Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      {/* <section className="py-20 max-w-7xl mx-auto px-6 md:px-16">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Loved by our partners
          </h2>
          <p className="text-gray-500">Real businesses, real results.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {TESTIMONIALS.map(({ quote, name, role }) => (
            <div key={name} className="bg-gray-50 rounded-2xl p-8 flex flex-col">
              <svg className="w-8 h-8 text-indigo-300 mb-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
              <p className="text-gray-700 text-sm leading-relaxed flex-1 mb-6">"{quote}"</p>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{role}</p>
              </div>
            </div>
          ))}
        </div>
      </section> */}

      {/* ── FAQ ── */}
      <section id="faq" className="bg-gray-50 py-20">
        <div className="max-w-3xl mx-auto px-6 md:px-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">
            Frequently asked questions
          </h2>
          {FAQS.map((faq) => (
            <FAQ key={faq.q} {...faq} />
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ready to grow with us?
          </h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Join 50+ sports and wellness venues already growing their businesses on Active CityPass.
            Application is free and takes 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/partner-signup"
              className="bg-[#050040] text-white font-semibold px-10 py-3.5 rounded-full hover:bg-indigo-900 transition">
              Become a Partner
            </Link>
            <Link href="/partner-login"
              className="border border-gray-300 text-gray-700 font-medium px-10 py-3.5 rounded-full hover:bg-gray-50 transition">
              Partner Login
            </Link>
          </div>
          <p className="text-gray-400 text-xs mt-6">No upfront fees · No long-term contract · Cancel anytime</p>
        </div>
      </section>

    </div>
  );
}
