"use client";

import { useState } from "react";
import Link from "next/link";
import AppStoreBadge from "../../components/AppStoreBadge";

const PARTNER_APP_STORE_URL = "https://apps.apple.com/nl/app/active-urban-pass-partners/id6760468404?l=en-GB";

const SPORTS_PILLS = [
  "Swimming", "Boxing", "Yoga", "Pilates", "Wellness", "Fitness",
  "HIIT", "Spinning", "Zumba", "Crossfit", "Martial Arts", "Dance", "Kids Activities",
];

const PARTNER_TYPES = [
  { emoji: "🏋️", label: "Gyms & Fitness Centres" },
  { emoji: "🧘", label: "Yoga & Pilates Studios" },
  { emoji: "🥊", label: "Boxing & Martial Arts" },
  { emoji: "🏊", label: "Swimming Pools" },
  { emoji: "💆", label: "Spas & Wellness Centres" },
  { emoji: "🎭", label: "Dance Studios" },
  { emoji: "🧗", label: "Climbing Walls" },
  { emoji: "👨‍👩‍👧", label: "Kids Activities" },
  { emoji: "🏃", label: "Personal Trainers" },
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
    body: "Tap into thousands of active, health-conscious Nairobians searching for their next session, PT, class, or experience. Most Active CityPass users are first-time visitors to the partners they book.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Fill Quiet Hours",
    body: "Turn available slots into revenue — whether that's an open gym hour, a free coaching slot, or an off-peak class. You stay in control of what you list and when.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Powerful Dashboard",
    body: "Manage your sessions, PT slots, or experiences — track bookings and view earnings from one intuitive partner portal. Works for solo coaches and multi-venue businesses alike.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Zero Risk",
    body: "No upfront fees. You only pay when you earn. We handle payment processing, customer support, and all the booking logistics — so you focus on delivering great sessions.",
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
    title: "Simple Commission",
    body: "New clients, bookings, payments, and support — for a commission agreed with you directly. No setup fees, no monthly charges, no surprises.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: "Build Lasting Relationships",
    body: "Convert Active CityPass visitors into long-term clients. Whether you run a studio, coach one-on-one, or host experiences — our platform helps you showcase what makes you different.",
  },
];

const STEPS = [
  { n: "01", title: "Apply Online", body: "Tell us about yourself — your name, location, what you offer, and who it's for. Takes about 5 minutes." },
  { n: "02", title: "Get Approved", body: "Our team reviews your profile within 24–48 hours and works with you to agree your commission rate." },
  { n: "03", title: "List What You Offer", body: "Add group classes, PT sessions, coaching slots, open access hours, or one-off experiences — on your own schedule." },
  { n: "04", title: "Start Earning", body: "Clients book through Active CityPass. You get paid per confirmed visit — no long-term contracts, no lock-in." },
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
    q: "Who can partner with Active CityPass?",
    a: "Anyone offering sports, fitness, or wellness services in Nairobi. That includes gyms, yoga and pilates studios, swimming pools, spas, dance studios, martial arts gyms, climbing walls, kids' activity centres — and individual personal trainers, coaches, and fitness experience providers. If you help people move and feel better, you're a fit.",
  },
  {
    q: "How does payment work?",
    a: "Clients pay Active CityPass at the time of booking. We pay you per confirmed visit at your agreed rate. Payouts are processed monthly, directly to your M-Pesa or bank account.",
  },
  {
    q: "Will this affect my existing clients?",
    a: "No. You control exactly what you list — specific sessions, time slots, or experiences. Active CityPass only fills availability you've already made available, so your existing clients and regulars are never displaced.",
  },
  {
    q: "I'm a personal trainer — can I list my PT sessions?",
    a: "Absolutely. Individual trainers and coaches are welcome. You can list one-on-one PT sessions, small group training, or specialised coaching slots, and manage everything from the partner app.",
  },
  {
    q: "How quickly can I go live?",
    a: "Most partners are approved and live within 48 hours of submitting their application. You can start adding offerings immediately after approval.",
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
      <section className="bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-16 py-16 lg:py-24">
          <div className="grid lg:grid-cols-1 gap-12 items-center">

            {/* Left: text */}
            <div className="text-center flex flex-col items-center">
              <span className="inline-block text-gray-500 text-xs font-semibold tracking-widest uppercase py-1 rounded-full mb-5">
                For gyms, trainers, coaches &amp; wellness pros
              </span>
              <h1 className="text-4xl lg:text-6xl font-black leading-[1.05] tracking-tight text-gray-900 mb-6 max-w-4xl">
               Grow Your Fitness Business. Fill More Sessions. Pay Only When You Earn.
              </h1>
              <p className="text-lg text-gray-500 mb-8 leading-relaxed max-w-2xl">
               Join Active CityPass to reach thousands of active Nairobians, fill empty slots, and let us handle discovery, bookings, payments, and support—so you can focus on coaching and delivering exceptional fitness experiences.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href="/partner-signup"
                  className="bg-[#050040] text-white font-semibold px-8 py-3.5 rounded-full hover:bg-indigo-900 transition text-center">
                  Become a Partner
                </Link>
                <Link href="/partner-login"
                  className="border border-gray-300 text-gray-700 font-medium px-8 py-3.5 rounded-full hover:bg-gray-50 transition text-center">
                  Already a Partner? Sign in →
                </Link>
              </div>
              {/* <div className="mt-6">
                <AppStoreBadge href={PARTNER_APP_STORE_URL} variant="dark" />
              </div> */}
            </div>

            {/* Right: image collage */}
            {/* <div className="relative order-1 lg:order-2">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 h-[280px] lg:h-[480px]">
                <div className="flex flex-col gap-3 lg:mt-12">
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/ref.jpeg" alt="Fitness" className="w-full h-full object-cover" style={{ objectPosition: "15% center" }} />
                  </div>
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/yoga.jpg" alt="Yoga" className="w-full h-full object-cover" style={{ objectPosition: "center top" }} />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/gym.jpg" alt="Gym" className="w-full h-full object-cover" style={{ objectPosition: "center" }} />
                  </div>
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/pt.jpeg" alt="personal trainer" className="w-full h-full object-cover" style={{ objectPosition: "center" }} />
                  </div>
                </div>
                <div className="hidden lg:flex flex-col gap-3 mt-8">
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/padel.webp" alt="Wellness" className="w-full h-full object-cover" style={{ objectPosition: "80% center" }} />
                  </div>
                  <div className="flex-1 rounded-2xl overflow-hidden">
                    <img src="/images/run.jpg" alt="Training" className="w-full h-full object-cover" style={{ objectPosition: "85% center" }} />
                  </div>
                </div>
              </div>
            </div> */}

          </div>
        </div>
      </section>

      {/* ── Activities Ticker ── */}
      <section className="border-y border-gray-100 bg-white overflow-hidden py-4">
        <div className="flex gap-6 animate-marquee whitespace-nowrap">
          {[...SPORTS_PILLS, ...SPORTS_PILLS].map((sport, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-600 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-black inline-block" />
              {sport}
            </span>
          ))}
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
            Active CityPass handles discovery, payments, and customer support — so you can focus on delivering great sessions, classes, and experiences.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {BENEFITS.map(({ icon, title, body }) => (
            <div key={title} className="bg-gray-50 rounded-2xl p-8 hover:shadow-md transition">
              {/* <div className="w-12 h-12 rounded-xl bg-black-100 text-black-600 flex items-center justify-center mb-5">
                {icon}
              </div> */}
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
            <p className="text-white-200">From application to your first booking in as little as 48 hours — whether you're a studio, a PT, or anything in between.</p>
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
            Join gyms, personal trainers, coaches, studios, and wellness venues already growing on Active CityPass.
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
