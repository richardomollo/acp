import Link from "next/link";
import AppStoreBadge from "../components/AppStoreBadge";
import PhoneFrame from "../components/PhoneFrame";

const CUSTOMER_APP_STORE_URL = "https://apps.apple.com/nl/app/active-urban-pass/id6767222212?l=en-GB";

// ── Data ──────────────────────────────────────────────────────────────────────

const SPORTS_PILLS = [
  "Swimming", "Boxing", "Yoga", "Pilates", "Wellness", "Fitness", "HIIT",
  "Spinning", "Zumba", "Crossfit", "Martial Arts", "Dance", "Kids Activities",
];

const JOURNEY_CARDS = [
  {
    title: "Endless variety",
    body: "Choose from more than 10 types of sports offered by over 50 partner venues across Nairobi.",
    img: "/images/ref.jpeg",
  },
  {
    title: "Discover something new",
    body: "Sick of the same routine? You'll never get bored. Discover new activities every week.",
    img: "/images/gym.jpg",
  },
  {
    title: "Combine activities",
    body: "Like to switch it up? Gym on Monday, yoga on Wednesday, spa on Friday — book across all our partner venues.",
    img: "/images/padel.webp",
  },
  {
    title: "Rediscover yourself",
    body: "Add variety to your workout plan and try new sports or activities you've never done before in Nairobi.",
    img: "/images/ref.jpeg",
    imgPos: "center",
  },
  {
    title: "Stay flexible",
    body: "Morning gym, lunchtime yoga, weekend spa — don't miss out on all the ways to stay active and well.",
    img: "/images/run.jpg",
    imgPos: "center top",
  },
  {
    title: "Relax and unwind",
    body: "Treat your body to some time out with our wellness partners, and boost your mental wellbeing.",
    img: "/images/gym.jpg",
    imgPos: "center",
  },
];

const WORKOUT_TYPES = [
  {
    title: "In-person classes",
    body: "Book a class and enjoy a group workout at one of our partner studios or gyms.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    title: "Open training",
    body: "No need to register — simply head to any partner gym and do your thing.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Online — coming soon",
    body: "Stay flexible and work out from the comfort of your home — live and on demand.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
    ),
  },
];

const NEW_APP_FEATURES = [
  { emoji: "🏃", title: "Outdoor Activities", body: "Connect Strava and bring your runs, walks and rides straight into your fitness journey." },
  { emoji: "🏆", title: "Challenges", body: "Take on monthly distance and activity challenges, with live progress tracking." },
  { emoji: "🔥", title: "Fitness Journey", body: "Streaks, achievements, goals and body stats — all your progress in one place." },
  { emoji: "🗓️", title: "Workout History", body: "Look back on every session you've completed, rated and logged." },
];

const STEPS = [
  {
    num: "1",
    title: "Create your account",
    body: "Sign up in seconds with Apple, Google, or email, and start exploring hundreds of sports and wellness activities across Nairobi.",
  },
  {
    num: "2",
    title: "Get inspired",
    body: "Need some inspiration? Find partner venues, classes, and personal trainers near you via the app or your browser.",
  },
  {
    num: "3",
    title: "Book your session",
    body: "Secure a spot in a class or for solo training. Pay a deposit to lock in your spot — settle the rest at the venue.",
  },
  {
    num: "4",
    title: "Check in — just like that",
    body: "Checking in has never been easier: scan the QR code at the venue using the app or show your booking confirmation.",
  },
  {
    num: "5",
    title: "Track your progress",
    body: "Sync Apple Health automatically and see your workouts, steps, heart rate, weight, and training trends all in one place.",
  },
  {
    num: "6",
    title: "Train and eat well, free",
    body: "Follow guided workouts in the Fitness Hub, or plan your meals with 90+ Kenyan recipes in the Nutrition Hub — both built into your account.",
  },
  {
    num: "7",
    title: "Stay connected with your coach",
    body: "Your personal trainer or nutritionist can assign workouts and meal plans, and follow your progress right alongside you.",
  },
];

const FITNESS_HUB_FEATURES = [
  { emoji: "🏋️", title: "Workout Library", body: "14 guided programs across full body, HIIT, strength, mobility & more — with a built-in player, rest timers, and set logging." },
  { emoji: "🥗", title: "Nutrition Library", body: "92 real Kenyan meals with macros, mapped to your goals — build your own weekly meal plan in minutes." },
  { emoji: "📊", title: "Progress Analytics", body: "Track lifted weight, muscle load, workout streaks, calories & steps (synced from Apple Health) over time." },
  { emoji: "❤️", title: "Favorites & Ratings", body: "Save the exercises and workouts you love, and pick up right where you left off." },
];

const FITNESS_HUB_CATEGORIES = [
  { emoji: "💪", label: "Full Body" },
  { emoji: "🔥", label: "HIIT" },
  { emoji: "🧘", label: "Mobility" },
  { emoji: "🎯", label: "Core" },
  { emoji: "🏋️", label: "Push" },
  { emoji: "🚣", label: "Pull" },
  { emoji: "🦵", label: "Legs" },
  { emoji: "🏆", label: "Strength" },
];

const TESTIMONIALS = [
  {
    name: "Sarah M.",
    quote: "Above all, fitness to me means fun — and that's exactly what Active CityPass delivers. Some days I train solo, other days I discover new studios with friends!",
  },
  {
    name: "James K.",
    quote: "I love yoga — and Active CityPass lets me practice like I never thought I could. I try different studios across Nairobi every week.",
  },
  {
    name: "Amara N.",
    quote: "Exercising keeps me fit and healthy. I love that I can do a gym session and then relax at a spa partner — all through Active CityPass.",
  },
  {
    name: "David O.",
    quote: "The Active CityPass concept is simple and super practical. I find my sport in the app, scan a QR code, and start training within seconds.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function WalkthroughPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════ */}
      <section className="bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left: text */}
            <div className="order-2 lg:order-1">
              <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-md">
                Active City Pass, NAIROBI
              </p>
              <h1 className="text-4xl lg:text-6xl font-black text-gray-900 leading-[1.05] tracking-tight mb-6">
                Sports and wellness<br />the way you want it
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-md">
                The most flexible sports and wellness offer in Nairobi — book and pay only for what you use.
                Enjoy sports, unwind with wellness, and work out anytime, anywhere.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sessions"
                  className="px-7 py-3.5 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors"
                >
                  Explore Sessions, venues, classes, personal Trainers and more
                </Link>
                {/* <Link
                  href="/venues"
                  className="px-7 py-3.5 border-2 border-gray-200 text-gray-800 text-sm font-semibold rounded-full hover:border-gray-400 transition-colors"
                >
                 Explore Venues
                </Link> */}
              </div>
              {/* <div className="mt-6">
                <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="dark" />
              </div> */}
            </div>

            {/* Right: image collage */}
            <div className="relative order-1 lg:order-2">
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
            </div>

          </div>
        </div>
      </section>

         {/* ════════════════════════════════════════════════
          SPORTS PILLS BAND (marquee)
      ════════════════════════════════════════════════ */}
      <section className="border-y border-gray-100 bg-white overflow-hidden py-4">
        <div className="flex gap-6 animate-marquee whitespace-nowrap">
          {[...SPORTS_PILLS, ...SPORTS_PILLS].map((sport, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-600 flex-shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-black inline-block" />
              {sport}
            </span>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          APP SCREENSHOTS — download push
      ════════════════════════════════════════════════ */}
      <section className="bg-white py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">See it in action</p>
            <h2 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-6">
              Everything you need, right in your pocket
            </h2>
            <p className="text-gray-500 text-base leading-relaxed mb-8">
              Browse workouts, book sessions, and track your progress — all from one app.
            </p>
            <div className="flex justify-center">
              <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="dark" />
            </div>
          </div>

          <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6 scrollbar-none lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0 lg:mx-auto lg:px-0 max-w-5xl">
            <PhoneFrame src="/images/app/screenshot-home.png" alt="Home screen in the Active CityPass app" className="w-40 flex-shrink-0 snap-center lg:w-full" />
            <PhoneFrame src="/images/app/screenshot-fitness-hub.png" alt="Fitness Hub screen in the Active CityPass app" className="w-40 flex-shrink-0 snap-center lg:w-full" />
            <PhoneFrame src="/images/app/screenshot-workout-detail.png" alt="Workout detail screen in the Active CityPass app" className="w-40 flex-shrink-0 snap-center lg:w-full" />
            <PhoneFrame src="/images/app/screenshot-workout-player.png" alt="Workout player screen in the Active CityPass app" className="w-40 flex-shrink-0 snap-center lg:w-full" />
            <PhoneFrame src="/images/app/screenshot-create-workout.png" alt="Create workout screen in the Active CityPass app" className="w-40 flex-shrink-0 snap-center lg:w-full" />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          4-STEP ONBOARDING
      ════════════════════════════════════════════════ */}
      <section className="bg-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left: headline + app */}
            <div className="lg:sticky lg:top-28">
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">How it works</p>
              <h2 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-8 max-w-sm">
                1000+ activities to choose from across Nairobi
              </h2>
              <div className="" style={{ maxWidth: "220px"}}>
                <PhoneFrame
                  src="/images/app/screenshot-home.png"
                  alt="Active CityPass home screen"
                  className="w-full t"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="light" />
                {/* <span className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-full text-xs font-semibold text-gray-600">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.28.15.59.2.9.16l12.93-7.47-2.79-2.79-11.04 10.1zm15.6-9l-3.21-3.21 3.21-3.21 3.22 1.86a1.5 1.5 0 010 2.7l-3.22 1.86zM2.43.24A1.5 1.5 0 002 1.5v21a1.5 1.5 0 00.43 1.05l.09.08 11.77-11.77v-.28L2.52.16l-.09.08zm12.87 11.43L3.18.24c-.31-.04-.62.01-.9.16l11.04 10.1 2.98-2.83z"/></svg>
                  Google Play
                </span> */}
              </div>
            </div>

            {/* Right: steps */}
            <div className="flex flex-col gap-0">
              {STEPS.map((step, i) => (
                <div
                  key={step.num}
                  className="flex gap-6 pb-12"
                  style={{ borderLeft: i < STEPS.length - 1 ? "2px solid #f0f0f0" : "2px solid transparent", paddingLeft: "1.5rem", marginLeft: "1.25rem" }}
                >
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center text-sm font-bold -ml-11"
                  >
                    {step.num}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          PARTNER BANNER
      ════════════════════════════════════════════════ */}
      {/* <section className="relative py-20 lg:py-28 overflow-hidden">
        <img src="/images/desktop.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div>
              <p className="text-white/70 text-xs font-bold tracking-widest uppercase mb-4">Partner with us</p>
              <h2 className="text-3xl lg:text-5xl font-black text-white leading-tight max-w-xl">
                Team up with us for a new era of sports
              </h2>
              <p className="text-white/70 mt-4 max-w-lg leading-relaxed text-base">
                Are you a gym, personal trainer, coach, studio, wellness venue or fitness experiences provider? Become part of Nairobi's leading sports and wellness platform and inspire people to live an
                active, healthy life — anytime, anywhere.
              </p>
            </div>
            <Link
              href="/partners/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-8 py-4 border-2 border-white/30 text-white text-sm font-semibold rounded-full hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              Become a partner
            </Link>
          </div>
        </div>
      </section> */}


      {/* ════════════════════════════════════════════════
          JOURNEY — 3 CARDS
      ════════════════════════════════════════════════ */}
      <section className="bg-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
           <p className="text-xs tracking-widest uppercase text-gray-400 mb-2">For individuals</p>
          <h2 className="text-3xl lg:text-5xl font-black text-gray-900 mb-12 max-w-xl leading-tight">
            Embark on a new kind of fitness journey.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {JOURNEY_CARDS.map((card) => (
              <div key={card.title} className="group rounded-3xl overflow-hidden bg-gray-50 hover:shadow-xl transition-shadow duration-300">
                <div className="relative overflow-hidden" style={{ height: "220px" }}>
                  <img
                    src={card.img}
                    alt={card.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    style={card.imgPos ? { objectPosition: card.imgPos } : undefined}
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{card.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 r">
          
          <p className="text-black/60 text-sm max-w-xl  mb-10 leading-relaxed py-4">
            Search and find  your favourite sports and wellness activities.
            In your area, your neighbourhood, and city-wide.
          </p>
          <Link
            href="/sessions"
            className="inline-block px-8 py-4 bg-black text-white hover:text-black text-sm font-bold rounded-full hover:bg-gray-100 transition-colors"
          >
            Explore Sessions, classes and activities
          </Link>
        </div>
          
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          WORKOUT TYPES — 3 CARDS
      ════════════════════════════════════════════════ */}
      <section className="bg-gray-50 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
           <p className="text-xs tracking-widest uppercase text-gray-400 mb-2">Groups and families</p>
          <h2 className="text-3xl lg:text-5xl font-black text-gray-900 mb-4 max-w-xl leading-tight">
            Get active, wherever you want.
          </h2>
          <p className="text-gray-500 text-base text-sm  mb-14 max-w-lg leading-relaxed">
            From group classes to solo training — choose how you want to work out, on your schedule.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {WORKOUT_TYPES.map((type) => (
              <div key={type.title} className="bg-white rounded-3xl p-8 hover:shadow-lg transition-shadow duration-300">
                <div className="text-gray-900 mb-5">{type.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{type.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{type.body}</p>
              </div>
            ))}
          </div>

          {/* New in the app */}
          <div className="mt-16">
            <p className="text-xs tracking-widest uppercase text-gray-400 mb-2">New in the app</p>
            <h3 className="text-xl lg:text-2xl font-black text-gray-900 mb-8 max-w-lg leading-tight">
              Track outdoor runs, hit challenges, and see your whole journey.
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {NEW_APP_FEATURES.map((f) => (
                <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-100">
                  <span className="text-2xl mb-4 block">{f.emoji}</span>
                  <h4 className="text-gray-900 font-bold text-sm mb-2">{f.title}</h4>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 r">
          <p className="text-black/50 text-xs font-bold tracking-widest uppercase py-4">Across Nairobi</p>
          <p className="text-black/60 text-sm max-w-xl  mb-10 leading-relaxed">
            Search and find  your favourite sports and wellness activities.
            In your area, your neighbourhood, and city-wide.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/sessions"
              className="inline-block px-8 py-4 bg-black text-white hover:text-black text-sm font-bold rounded-full hover:bg-gray-100 transition-colors"
            >
              Explore Sessions, classes and activities
            </Link>
            <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="light" />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          VENUE DISCOVERY
      ════════════════════════════════════════════════ */}
      {/* <section className="relative overflow-hidden bg-black py-24 lg:py-32">
        <div className="absolute inset-0">
          <img src="/images/desktop.jpg" alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center">
          <p className="text-white/50 text-xs font-bold tracking-widest uppercase mb-4">Across Nairobi</p>
          <h2 className="text-4xl lg:text-6xl font-black text-white mb-6 leading-tight">
            Discover your possibilities
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Search and find all partner venues offering your favourite sports and wellness activities.
            In your area, your neighbourhood, and city-wide.
          </p>
          <Link
            href="/venues"
            className="inline-block px-8 py-4 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-100 transition-colors"
          >
            Explore our venues
          </Link>
        </div>
      </section> */}

      {/* ════════════════════════════════════════════════
          FITNESS HUB — teaser, app-only
      ════════════════════════════════════════════════ */}
      <section className="bg-black py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-xs tracking-widest uppercase text-white/40 mb-3">In the app only</p>
          <h2 className="text-3xl lg:text-5xl font-black text-white mb-4 max-w-2xl leading-tight">
            Your Fitness &amp; Nutrition Hub
          </h2>
          <p className="text-white/50 text-base max-w-xl mb-12 leading-relaxed">
            110+ exercises, 14 guided workout programs, and 92 real Kenyan meals — free with your account,
            built into the mobile app.
          </p>

          {/* Feature grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {FITNESS_HUB_FEATURES.map((f) => (
              <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <span className="text-3xl mb-4 block">{f.emoji}</span>
                <h3 className="text-white font-bold text-base mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Locked preview strip */}
          <div className="relative rounded-3xl overflow-hidden border border-white/10">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 p-6 sm:p-8 blur-[2px] opacity-60 select-none">
              {FITNESS_HUB_CATEGORIES.map((c) => (
                <div key={c.label} className="bg-white/10 rounded-2xl aspect-square flex flex-col items-center justify-center gap-2">
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-white text-[10px] font-semibold">{c.label}</span>
                </div>
              ))}
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.85))" }}
            >
              <div className="text-center px-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold mb-4">
                  🔒 Unlock the full Fitness Hub
                </span>
                <p className="text-white font-bold text-lg mb-6 max-w-xs mx-auto">
                  Download the app to start training, tracking & eating better — free.
                </p>
                <div className="flex justify-center">
                  <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="light" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          TESTIMONIALS
      ════════════════════════════════════════════════ */}
      {/* <section className="bg-gray-50 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl lg:text-5xl font-black text-gray-900 mb-14 max-w-xl leading-tight">
            What our community thinks about us
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-3xl p-7 flex flex-col gap-6 shadow-sm">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">{t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* ════════════════════════════════════════════════
          NEWSLETTER
      ════════════════════════════════════════════════ */}
      {/* <section className="bg-gray-50 py-20 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div>
              <h2 className="text-2xl lg:text-3xl font-black text-gray-900 mb-2">Stay up to date</h2>
              <p className="text-gray-500 text-sm max-w-md leading-relaxed">
                Subscribe to our newsletter and we'll let you know when we've got new partners and sessions.
                You'll also get exclusive fitness, nutrition, and lifestyle content.
              </p>
            </div>
            <div className="flex gap-2 w-full lg:w-auto">
              <input
                type="email"
                placeholder="Your email address"
                className="flex-1 lg:w-72 px-5 py-3.5 border border-gray-200 rounded-full text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 transition-colors"
              />
              <button className="px-6 py-3.5 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors whitespace-nowrap">
                Subscribe
              </button>
            </div>
          </div>
        </div>
      </section> */}

      {/* ── Marquee animation ── */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 28s linear infinite;
        }
      `}</style>

    </div>
  );
}
