"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = "overview" | "venue" | "sessions" | "revenue" | "checkin";

type Gym = {
  id: string;
  name: string;
  location: string;
  area: string;
  type: string;
  description: string;
  image_url: string | null;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
  rating: number;
  created_at: string;
};

type Session = {
  id: string;
  gym_id: string;
  name: string;
  description: string;
  time: string;
  date: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  spots_left: number;
  is_active: boolean;
  category: string;
  instructor: string;
  image_url: string | null;
  recurring?: boolean;
};

type Booking = {
  id: string;
  user_id: string;
  session_id: string;
  gym_id: string;
  booking_date: string;
  booking_time: string;
  checked_in?: boolean;
  users?: { name: string; email: string; phone: string } | null;
  sessions?: { name: string; date: string; time: string; credits_required: number } | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  "strength", "cardio", "yoga", "pilates", "crossfit",
  "martial-arts", "dance", "swimming", "cycling", "wellness",
];

const VENUE_TYPES = [
  { value: "gym",          label: "Gym" },
  { value: "yoga",         label: "Yoga" },
  { value: "pilates",      label: "Pilates" },
  { value: "studio",       label: "Studio" },
  { value: "crossfit",     label: "CrossFit" },
  { value: "martial-arts", label: "Martial Arts" },
  { value: "swimming",     label: "Swimming" },
  { value: "spa",          label: "Spa & Wellness" },
  { value: "dance",        label: "Dance" },
  { value: "kids",         label: "Kids Activities" },
];

const inp =
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#050040]/25 focus:border-[#050040] transition bg-white";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];
const monthStr = () => new Date().toISOString().slice(0, 7);
const fmtDate  = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

function generateRecurringDates(startDate: string, endDate: string, dayIndices: number[]): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T12:00:00");
  const end     = new Date(endDate   + "T12:00:00");
  while (current <= end) {
    if (dayIndices.includes(current.getDay())) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function uploadPhoto(file: File, bucket: string, prefix: string): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const Ic = {
  Grid: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
    </svg>
  ),
  Building: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-3a2 2 0 012-2h2a2 2 0 012 2v3" />
    </svg>
  ),
  Calendar: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Chart: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Check: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Logout: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  Upload: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Plus: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Trash: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  ChevronDown: (p: React.SVGProps<SVGSVGElement>) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
};

const NAV: { key: Section; label: string; Icon: typeof Ic.Grid }[] = [
  { key: "overview",  label: "Overview",  Icon: Ic.Grid },
  { key: "venue",     label: "Venue",     Icon: Ic.Building },
  { key: "sessions",  label: "Sessions",  Icon: Ic.Calendar },
  { key: "revenue",   label: "Revenue",   Icon: Ic.Chart },
  { key: "checkin",   label: "Check-in",  Icon: Ic.Check },
];

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function PartnerDashboard() {
  const router = useRouter();
  const [section, setSection]             = useState<Section>("overview");
  const [user, setUser]                   = useState<any>(null);
  const [gyms, setGyms]                   = useState<Gym[]>([]);
  const [activeGym, setActiveGym]         = useState<Gym | null>(null);
  const [sessions, setSessions]           = useState<Session[]>([]);
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [switching, setSwitching]         = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [showVenuePicker, setShowVenuePicker] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) { router.push("/partner-login"); return; }
    setUser(user);
    setEmailVerified(!!user.email_confirmed_at);

    const { data: gymsData } = await supabase
      .from("gyms")
      .select("*")
      .eq("contact_email", user.email)
      .order("name");

    if (gymsData && gymsData.length > 0) {
      setGyms(gymsData);
      setActiveGym(gymsData[0]);
      await Promise.all([loadSessions(gymsData[0].id), loadBookings(gymsData[0].id)]);
    }
    setLoading(false);
  }

  async function switchVenue(gym: Gym) {
    if (gym.id === activeGym?.id) { setShowVenuePicker(false); return; }
    setSwitching(true);
    setShowVenuePicker(false);
    setActiveGym(gym);
    setSessions([]);
    setBookings([]);
    await Promise.all([loadSessions(gym.id), loadBookings(gym.id)]);
    setSwitching(false);
  }

  async function loadSessions(gymId: string) {
    const { data } = await supabase
      .from("sessions").select("*").eq("gym_id", gymId)
      .order("date", { ascending: false }).order("time");
    setSessions(data || []);
  }

  async function loadBookings(gymId: string) {
    const { data } = await supabase
      .from("bookings")
      .select("*, users(name, email, phone), sessions(name, date, time, credits_required)")
      .eq("gym_id", gymId)
      .order("booking_date", { ascending: false })
      .limit(500);
    setBookings(data || []);
  }

  function handleGymSaved(updated: Gym) {
    setGyms(prev => prev.map(g => g.id === updated.id ? updated : g));
    setActiveGym(updated);
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/partner-login");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (gyms.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm p-10 text-center max-w-sm w-full">
        <p className="text-gray-900 font-bold text-xl mb-2">No venues found</p>
        <p className="text-gray-500 text-sm mb-6">No venue is linked to this account yet.</p>
        <Link href="/partner-signup"
          className="inline-block bg-[#050040] text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition">
          Register Your Venue
        </Link>
      </div>
    </div>
  );

  const gym = activeGym!;

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 bg-[#050040] flex-col fixed inset-y-0 left-0 z-20">
        <div className="p-5 border-b border-white/10 flex-shrink-0">
          <Link href="/">
            <img src="/images/logo-white.png" alt="Active CityPass" className="h-8 w-auto" />
          </Link>
          <p className="text-white/40 text-[11px] font-medium mt-1.5 tracking-wide">Partner Portal</p>
        </div>

        {/* Venue switcher */}
        {gyms.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-b border-white/10 flex-shrink-0 relative">
            <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5 px-1">Current venue</p>
            <button
              onClick={() => setShowVenuePicker(p => !p)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{gym.name}</p>
                <p className="text-white/40 text-[10px] truncate capitalize">{gym.type} · {gym.area}</p>
              </div>
              <Ic.ChevronDown className={`w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform ${showVenuePicker ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {showVenuePicker && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-xl shadow-xl overflow-hidden z-30 border border-gray-100">
                {gyms.map(g => (
                  <button
                    key={g.id}
                    onClick={() => switchVenue(g)}
                    className={`w-full text-left px-4 py-3 text-sm transition flex items-center gap-3 ${
                      g.id === gym.id
                        ? "bg-[#050040]/5 text-[#050040] font-semibold"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{g.name}</p>
                      <p className="text-xs text-gray-400 truncate capitalize">{g.type} · {g.area}</p>
                    </div>
                    {g.id === gym.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#050040] flex-shrink-0" />
                    )}
                  </button>
                ))}
                <div className="border-t border-gray-100">
                  <Link
                    href="/partner-signup"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition"
                    onClick={() => setShowVenuePicker(false)}
                  >
                    <Ic.Plus className="w-4 h-4" />
                    Add another venue
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSection(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                section === key
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white hover:bg-white/8"
              }`}>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 flex-shrink-0">
          <div className="px-3 py-2 mb-1">
            <p className="text-white/40 text-[10px] truncate">{user?.email}</p>
          </div>
          <button onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/8 transition-colors">
            <Ic.Logout className="w-[18px] h-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col md:ml-56">

        {/* Mobile top bar */}
        <header className="md:hidden bg-[#050040] px-4 py-3 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
          <img src="/images/logo-white.png" alt="Active CityPass" className="h-7 w-auto" />
          <button onClick={signOut} className="text-white/60 text-xs font-medium">Sign out</button>
        </header>

        {/* Mobile venue switcher */}
        {gyms.length > 1 && (
          <div className="md:hidden bg-[#050040]/95 px-4 pb-2 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gyms.map(g => (
                <button
                  key={g.id}
                  onClick={() => switchVenue(g)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    g.id === gym.id
                      ? "bg-white text-[#050040]"
                      : "bg-white/15 text-white/70 hover:bg-white/25"
                  }`}
                >
                  {g.name}
                </button>
              ))}
              <Link
                href="/partner-signup"
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/60 hover:bg-white/20 transition"
              >
                <Ic.Plus className="w-3 h-3" />
                Add venue
              </Link>
            </div>
          </div>
        )}

        {/* Mobile nav tabs */}
        <div className="md:hidden bg-white border-b border-gray-100 sticky top-[52px] z-10 overflow-x-auto flex-shrink-0">
          <div className="flex gap-1 px-3 py-2 min-w-max">
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => setSection(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  section === key ? "bg-[#050040] text-white" : "text-gray-500 hover:bg-gray-50"
                }`}>{label}</button>
            ))}
          </div>
        </div>

        {/* Banners */}
        {!emailVerified && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-2 text-xs flex-shrink-0">
            <span className="text-amber-700">Please verify your email to activate your listing.</span>
            <button
              onClick={async () => {
                await supabase.auth.resend({ type: "signup", email: user.email });
                alert("Verification email sent!");
              }}
              className="text-amber-900 font-semibold underline">Resend
            </button>
          </div>
        )}
        {!gym.is_active && (
          <div className="bg-orange-50 border-b border-orange-200 px-5 py-2.5 text-xs text-orange-700 font-medium flex-shrink-0">
            <strong>{gym.name}</strong> is pending approval — our team will review within 24–48 hours.
          </div>
        )}

        {/* Switching overlay */}
        {switching && (
          <div className="flex-1 flex items-center justify-center p-20">
            <div className="w-7 h-7 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Section content */}
        {!switching && (
          <main className="flex-1 p-4 md:p-8 max-w-5xl w-full mx-auto">
            {section === "overview" && (
              <OverviewSection gym={gym} sessions={sessions} bookings={bookings} />
            )}
            {section === "venue" && (
              <VenueSection gym={gym} gyms={gyms} onSaved={handleGymSaved} />
            )}
            {section === "sessions" && (
              <SessionsSection gym={gym} sessions={sessions} onRefresh={() => loadSessions(gym.id)} />
            )}
            {section === "revenue" && (
              <RevenueSection bookings={bookings} />
            )}
            {section === "checkin" && (
              <CheckInSection sessions={sessions} />
            )}
          </main>
        )}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ gym, sessions, bookings }: { gym: Gym; sessions: Session[]; bookings: Booking[] }) {
  const t = todayStr();
  const m = monthStr();

  const todayBookings  = bookings.filter(b => b.booking_date === t);
  const monthBookings  = bookings.filter(b => b.booking_date?.startsWith(m));
  const upcoming       = sessions.filter(s => s.date >= t && s.is_active).slice(0, 6);
  const totalCredits   = bookings.reduce((sum, b) => sum + (b.sessions?.credits_required ?? 0), 0);

  const stats = [
    { label: "Total Bookings",   value: bookings.length,      sub: "all time" },
    { label: "This Month",       value: monthBookings.length, sub: "bookings" },
    { label: "Today",            value: todayBookings.length, sub: "bookings" },
    { label: "Credits Earned",   value: totalCredits,         sub: "total" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {gym.name} · {gym.is_active ? "Live" : "Pending approval"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 font-medium mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Upcoming Sessions</h2>
        {upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm">No upcoming sessions.</p>
        ) : (
          <div className="space-y-1">
            {upcoming.map(s => {
              const booked = bookings.filter(b => b.session_id === s.id).length;
              const fill   = s.max_capacity > 0 ? Math.round((booked / s.max_capacity) * 100) : 0;
              return (
                <div key={s.id} className="flex items-center gap-4 py-2.5 border-b border-gray-50 last:border-0">
                  {s.image_url ? (
                    <img src={s.image_url} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center">
                      <Ic.Calendar className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{s.name}</p>
                    <p className="text-xs text-gray-400">{fmtDate(s.date)} · {s.time?.slice(0, 5)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{booked}/{s.max_capacity}</p>
                    <p className={`text-xs font-medium ${
                      fill >= 80 ? "text-red-500" : fill >= 50 ? "text-amber-500" : "text-green-500"
                    }`}>{fill}% full</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-gray-400 text-sm">No bookings yet.</p>
        ) : (
          <div className="space-y-1">
            {bookings.slice(0, 8).map(b => (
              <div key={b.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-[#050040]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#050040]">
                    {(b.users?.name ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.users?.name ?? "Member"}</p>
                  <p className="text-xs text-gray-400 truncate">{b.sessions?.name ?? "Session"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{fmtDate(b.booking_date)}</p>
                  <p className="text-xs font-semibold text-[#050040]">{b.sessions?.credits_required ?? 0} cr</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Venue ────────────────────────────────────────────────────────────────────

function VenueSection({ gym, gyms, onSaved }: { gym: Gym; gyms: Gym[]; onSaved: (g: Gym) => void }) {
  const [form, setForm] = useState({
    name:          gym.name,
    location:      gym.location,
    area:          gym.area,
    type:          gym.type,
    description:   gym.description,
    contact_phone: gym.contact_phone,
  });
  const [imageUrl,  setImageUrl]  = useState(gym.image_url ?? "");
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg,       setMsg]       = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset form when active gym changes
  useEffect(() => {
    setForm({
      name:          gym.name,
      location:      gym.location,
      area:          gym.area,
      type:          gym.type,
      description:   gym.description,
      contact_phone: gym.contact_phone,
    });
    setImageUrl(gym.image_url ?? "");
    setMsg("");
  }, [gym.id]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, "fitpass-images", `gyms/gym-${gym.id}`);
      setImageUrl(url);
    } catch (err: any) {
      alert("Photo upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    const { data, error } = await supabase
      .from("gyms")
      .update({ ...form, image_url: imageUrl || null })
      .eq("id", gym.id)
      .select()
      .single();
    setSaving(false);
    if (error) { setMsg("Error: " + error.message); return; }
    onSaved(data);
    setMsg("Saved!");
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Venue</h1>
        {gyms.length > 1 && (
          <p className="text-sm text-gray-400 mt-0.5">
            Managing <span className="font-medium text-gray-600">{gym.name}</span>
            {" "}· {gyms.length} venues on your account
          </p>
        )}
      </div>

      {/* All venues summary (multi-venue accounts) */}
      {gyms.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">All your venues</h2>
          <div className="space-y-2">
            {gyms.map(g => (
              <div key={g.id} className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                g.id === gym.id ? "border-[#050040]/30 bg-[#050040]/5" : "border-gray-100"
              }`}>
                <div className="w-9 h-9 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                  {g.image_url ? (
                    <img src={g.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Ic.Building className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{g.name}</p>
                  <p className="text-xs text-gray-400 truncate capitalize">{g.type} · {g.area}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    g.is_active ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"
                  }`}>
                    {g.is_active ? "Live" : "Pending"}
                  </span>
                  {g.id === gym.id && (
                    <span className="text-xs text-[#050040] font-semibold">Editing</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/partner-signup"
            className="mt-3 flex items-center gap-2 text-sm text-[#050040] font-medium hover:underline"
          >
            <Ic.Plus className="w-4 h-4" />
            Register another venue
          </Link>
        </div>
      )}

      {/* Edit active venue */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Edit: {gym.name}
        </p>

        {/* Photo */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Venue Photo</p>
          <div className="flex items-start gap-5">
            <div className="relative w-40 h-28 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
              {imageUrl ? (
                <img src={imageUrl} alt="Venue" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Ic.Upload className="w-8 h-8 text-gray-300" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                <Ic.Upload className="w-4 h-4" />
                {uploading ? "Uploading…" : "Upload photo"}
              </button>
              <p className="text-xs text-gray-400">JPG, PNG · max 5 MB · 16:9 recommended</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Venue name</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
            <select value={form.type} onChange={e => set("type", e.target.value)} className={inp}>
              {VENUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Street address</label>
            <input value={form.location} onChange={e => set("location", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Area / Neighbourhood</label>
            <input value={form.area} onChange={e => set("area", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contact email</label>
            <input value={gym.contact_email} disabled
              className={inp + " bg-gray-50 text-gray-400 cursor-not-allowed"} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contact phone</label>
            <input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)} className={inp} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={4} className={inp + " resize-none"} />
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-gray-50">
          <button onClick={handleSave} disabled={saving}
            className="bg-[#050040] text-white text-sm font-semibold px-8 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {msg && (
            <p className={`text-sm font-medium ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

const EMPTY: Omit<Session, "id" | "gym_id" | "spots_left" | "is_active"> = {
  name: "", description: "", time: "", date: "", duration_minutes: 60,
  credits_required: 1, max_capacity: 20, category: "strength", instructor: "", image_url: null,
};

function SessionsSection({ gym, sessions, onRefresh }: {
  gym: Gym; sessions: Session[]; onRefresh: () => void;
}) {
  const [filter,       setFilter]       = useState<"upcoming" | "all" | "past">("upcoming");
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState<typeof EMPTY>({ ...EMPTY });
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[] | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [isRecurring,  setIsRecurring]  = useState(false);
  const [recurDays,    setRecurDays]    = useState<number[]>([]);
  const [recurEndDate, setRecurEndDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const t = todayStr();

  const oneOff = sessions.filter(s => !s.recurring);
  const recurringGroups = new Map<string, Session[]>();
  for (const s of sessions.filter(s => s.recurring)) {
    const key = `${s.name}||${s.time}||${s.category}`;
    if (!recurringGroups.has(key)) recurringGroups.set(key, []);
    recurringGroups.get(key)!.push(s);
  }

  type RecurringGroup = { rep: Session; all: Session[] };
  const groups: RecurringGroup[] = [...recurringGroups.values()].map(all => {
    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    return { rep: sorted[0], all: sorted };
  });

  const filteredOneOff = oneOff.filter(s =>
    filter === "upcoming" ? s.date >= t :
    filter === "past"     ? s.date < t  : true
  );
  const filteredGroups = groups.filter(({ all }) =>
    filter === "upcoming" ? all.some(s => s.date >= t) :
    filter === "past"     ? all.every(s => s.date < t) : true
  );

  const totalCount = filteredOneOff.length + filteredGroups.length;

  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const resetRecurring = () => { setIsRecurring(false); setRecurDays([]); setRecurEndDate(""); };

  function openNew() {
    setForm({ ...EMPTY }); setEditId(null); setEditGroupIds(null); resetRecurring(); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(s: Session) {
    setForm({
      name: s.name, description: s.description, time: s.time, date: s.date,
      duration_minutes: s.duration_minutes, credits_required: s.credits_required,
      max_capacity: s.max_capacity, category: s.category, instructor: s.instructor,
      image_url: s.image_url,
    });
    setEditId(s.id); setEditGroupIds(null); resetRecurring(); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEditGroup(rep: Session, all: Session[]) {
    setForm({
      name: rep.name, description: rep.description, time: rep.time, date: rep.date,
      duration_minutes: rep.duration_minutes, credits_required: rep.credits_required,
      max_capacity: rep.max_capacity, category: rep.category, instructor: rep.instructor,
      image_url: rep.image_url,
    });
    setEditId(null); setEditGroupIds(all.map(s => s.id)); resetRecurring(); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleRecurDay(day: number) {
    setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, "fitpass-images", `sessions/session-${gym.id}`);
      setF("image_url", url);
    } catch (err: any) { alert("Upload failed: " + err.message); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.name || !form.time) { alert("Please fill in name and time."); return; }
    if (!editGroupIds && !editId && !form.date) { alert("Please fill in a start date."); return; }
    if (!editGroupIds && !editId && isRecurring) {
      if (recurDays.length === 0) { alert("Select at least one day for recurring sessions."); return; }
      if (!recurEndDate) { alert("Please set an end date for recurring sessions."); return; }
      if (recurEndDate <= form.date) { alert("End date must be after the start date."); return; }
    }
    setSaving(true);

    let error: any;

    if (editGroupIds) {
      ({ error } = await supabase.from("sessions").update({
        name: form.name, description: form.description, time: form.time,
        duration_minutes: Number(form.duration_minutes),
        credits_required: Number(form.credits_required),
        max_capacity: Number(form.max_capacity),
        category: form.category, instructor: form.instructor, image_url: form.image_url || null,
      }).in("id", editGroupIds));

    } else if (!editId && isRecurring) {
      const dates = generateRecurringDates(form.date, recurEndDate, recurDays);
      if (dates.length === 0) { setSaving(false); alert("No sessions fall on the selected days in that date range."); return; }
      const base = {
        gym_id: gym.id, name: form.name, description: form.description, time: form.time,
        duration_minutes: Number(form.duration_minutes), credits_required: Number(form.credits_required),
        max_capacity: Number(form.max_capacity), spots_left: Number(form.max_capacity),
        category: form.category, instructor: form.instructor, image_url: form.image_url || null,
        is_active: true, recurring: true,
      };
      ({ error } = await supabase.from("sessions").insert(dates.map(date => ({ ...base, date }))));

    } else {
      const payload = {
        gym_id: gym.id, ...form,
        duration_minutes: Number(form.duration_minutes),
        credits_required: Number(form.credits_required),
        max_capacity: Number(form.max_capacity),
        spots_left: Number(form.max_capacity),
        image_url: form.image_url || null,
        is_active: true,
      };
      ({ error } = editId
        ? await supabase.from("sessions").update(payload).eq("id", editId)
        : await supabase.from("sessions").insert(payload));
    }

    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setShowForm(false); setEditId(null); setEditGroupIds(null); setForm({ ...EMPTY }); resetRecurring();
    onRefresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session?")) return;
    await supabase.from("sessions").delete().eq("id", id);
    onRefresh();
  }

  async function handleToggle(s: Session) {
    await supabase.from("sessions").update({ is_active: !s.is_active }).eq("id", s.id);
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-gray-400 text-sm mt-0.5">{gym.name}</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-900 transition">
          <Ic.Plus className="w-4 h-4" />
          New session
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">
              {editGroupIds ? "Edit Recurring Series" : editId ? "Edit Session" : "New Session"}
            </h2>
            {editGroupIds && (
              <p className="text-xs text-gray-400 mt-0.5">
                Changes apply to all {editGroupIds.length} occurrences.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Session photo</p>
            <div className="flex items-center gap-4">
              <div className="w-28 h-20 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                {form.image_url ? (
                  <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Ic.Upload className="w-7 h-7 text-gray-300" />
                  </div>
                )}
              </div>
              <div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
                  <Ic.Upload className="w-4 h-4" />
                  {uploading ? "Uploading…" : "Upload photo"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <p className="text-xs text-gray-400 mt-1.5">JPG, PNG · max 5 MB</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Session name *</label>
              <input value={form.name} onChange={e => setF("name", e.target.value)}
                className={inp} placeholder="e.g. Morning HIIT" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Instructor</label>
              <input value={form.instructor} onChange={e => setF("instructor", e.target.value)}
                className={inp} placeholder="Instructor name" />
            </div>
            {!editGroupIds && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  {isRecurring ? "Start date *" : "Date *"}
                </label>
                <input type="date" value={form.date} onChange={e => setF("date", e.target.value)} className={inp} />
              </div>
            )}

            {!editId && !editGroupIds && (
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                  <div
                    onClick={() => { setIsRecurring(p => !p); setRecurDays([]); setRecurEndDate(""); }}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${isRecurring ? "bg-[#050040]" : "bg-gray-200"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Recurring session</span>
                </label>

                {isRecurring && (
                  <div className="mt-4 space-y-4 pl-1">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Repeat on *</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { label: "Mon", day: 1 }, { label: "Tue", day: 2 }, { label: "Wed", day: 3 },
                          { label: "Thu", day: 4 }, { label: "Fri", day: 5 }, { label: "Sat", day: 6 },
                          { label: "Sun", day: 0 },
                        ].map(({ label, day }) => (
                          <button key={day} type="button" onClick={() => toggleRecurDay(day)}
                            className={`w-11 h-10 rounded-xl text-xs font-semibold border transition ${
                              recurDays.includes(day)
                                ? "bg-[#050040] text-white border-[#050040]"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="max-w-xs">
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">End date *</label>
                      <input type="date" value={recurEndDate}
                        onChange={e => setRecurEndDate(e.target.value)}
                        min={form.date || undefined} className={inp} />
                    </div>
                    {form.date && recurEndDate && recurDays.length > 0 && (
                      <p className="text-xs text-[#050040] font-medium">
                        {generateRecurringDates(form.date, recurEndDate, recurDays).length} sessions will be created
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Time *</label>
              <input type="time" value={form.time} onChange={e => setF("time", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Duration (min)</label>
              <input type="number" min={15} value={form.duration_minutes}
                onChange={e => setF("duration_minutes", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Category</label>
              <select value={form.category} onChange={e => setF("category", e.target.value)} className={inp}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c} className="capitalize">{c.replace("-", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max capacity</label>
              <input type="number" min={1} value={form.max_capacity}
                onChange={e => setF("max_capacity", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Credits required</label>
              <input type="number" min={1} value={form.credits_required}
                onChange={e => setF("credits_required", e.target.value)} className={inp} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => setF("description", e.target.value)}
                rows={3} className={inp + " resize-none"} placeholder="What will members experience?" />
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-50">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#050040] text-white text-sm font-semibold px-8 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-50">
              {saving ? "Saving…" : editGroupIds ? "Update all occurrences" : editId ? "Save changes" : isRecurring ? "Create recurring sessions" : "Create session"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setEditGroupIds(null); }}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium px-4 py-2.5 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {(["upcoming", "all", "past"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium border transition capitalize ${
              filter === f
                ? "bg-[#050040] text-white border-[#050040]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}>{f}</button>
        ))}
        <span className="text-xs text-gray-400 ml-1">{totalCount} sessions</span>
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-gray-400 text-sm">No sessions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(({ rep, all }) => {
            const upcoming = all.filter(s => s.date >= t).sort((a, b) => a.date.localeCompare(b.date));
            const nextDate  = upcoming[0]?.date;
            const endDate   = all[all.length - 1]?.date;
            const allActive = all.every(s => s.is_active);

            async function toggleAll() {
              await supabase.from("sessions").update({ is_active: !allActive }).in("id", all.map(s => s.id));
              onRefresh();
            }
            async function deleteAll() {
              if (!confirm(`Delete all ${all.length} occurrences of "${rep.name}"?`)) return;
              await supabase.from("sessions").delete().in("id", all.map(s => s.id));
              onRefresh();
            }

            return (
              <div key={`${rep.name}||${rep.time}`} className="bg-white rounded-2xl shadow-sm p-4 flex gap-4 items-center">
                <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                  {rep.image_url ? (
                    <img src={rep.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Ic.Calendar className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{rep.name}</p>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">Recurring</span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500 capitalize">{rep.category.replace("-", " ")}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {all.length} sessions · {rep.time?.slice(0, 5)} · {rep.duration_minutes}min
                    {rep.instructor && ` · ${rep.instructor}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {nextDate ? `Next: ${fmtDate(nextDate)}` : `Ended ${fmtDate(endDate)}`}
                    {" · "}{rep.credits_required} credits
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleAll}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      allActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}>{allActive ? "Active" : "Inactive"}</button>
                  <button onClick={() => openEditGroup(rep, all)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition">Edit</button>
                  <button onClick={deleteAll}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                    <Ic.Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredOneOff.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                {s.image_url ? (
                  <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Ic.Calendar className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500 capitalize">{s.category.replace("-", " ")}</span>
                  {!s.is_active && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-400">Inactive</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDate(s.date)} · {s.time?.slice(0, 5)} · {s.duration_minutes}min
                  {s.instructor && ` · ${s.instructor}`}
                </p>
                <p className="text-xs text-gray-400">{s.spots_left}/{s.max_capacity} spots · {s.credits_required} credits</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggle(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    s.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}>{s.is_active ? "Active" : "Inactive"}</button>
                <button onClick={() => openEdit(s)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition">Edit</button>
                <button onClick={() => handleDelete(s.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                  <Ic.Trash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

function RevenueSection({ bookings }: { bookings: Booking[] }) {
  const m = monthStr();
  const monthBookings = bookings.filter(b => b.booking_date?.startsWith(m));
  const totalCredits  = bookings.reduce((s, b) => s + (b.sessions?.credits_required ?? 0), 0);
  const monthCredits  = monthBookings.reduce((s, b) => s + (b.sessions?.credits_required ?? 0), 0);

  const stats = [
    { label: "Total Bookings",       value: bookings.length },
    { label: "Bookings This Month",  value: monthBookings.length },
    { label: "Credits Earned Total", value: totalCredits },
    { label: "Credits This Month",   value: monthCredits },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Revenue</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 font-medium mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-900">Booking History</h2>
        </div>
        {bookings.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No bookings yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bookings.map(b => (
              <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-[#050040]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[#050040]">{(b.users?.name ?? "?")[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.users?.name ?? "Member"}</p>
                  <p className="text-xs text-gray-400 truncate">{b.sessions?.name ?? "Session"}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-500">{fmtDate(b.booking_date)}</p>
                  <p className="text-sm font-semibold text-[#050040]">+{b.sessions?.credits_required ?? 0} cr</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

function CheckInSection({ sessions }: { sessions: Session[] }) {
  const [date,            setDate]           = useState(todayStr());
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [attendees,       setAttendees]       = useState<Booking[]>([]);
  const [checkedIn,       setCheckedIn]       = useState<Set<string>>(new Set());
  const [loadingList,     setLoadingList]     = useState(false);
  const [search,          setSearch]          = useState("");

  const daySessions = sessions.filter(s => s.date === date);

  async function selectSession(id: string) {
    setSelectedSession(id); setSearch(""); setLoadingList(true);
    const { data } = await supabase
      .from("bookings").select("*, users(name, email, phone)").eq("session_id", id);
    setAttendees(data || []);
    setCheckedIn(new Set((data || []).filter((b: any) => b.checked_in).map((b: any) => b.id)));
    setLoadingList(false);
  }

  async function toggleCheckIn(bookingId: string) {
    const was = checkedIn.has(bookingId);
    setCheckedIn(prev => { const next = new Set(prev); was ? next.delete(bookingId) : next.add(bookingId); return next; });
    await supabase.from("bookings").update({ checked_in: !was }).eq("id", bookingId);
  }

  const displayed = attendees.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.users?.name ?? "").toLowerCase().includes(q) || (b.users?.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Check-in</h1>

      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
          <input type="date" value={date}
            onChange={e => { setDate(e.target.value); setSelectedSession(null); setAttendees([]); }}
            className={inp + " max-w-xs"} />
        </div>
        {daySessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions scheduled for this date.</p>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Select a session</p>
            <div className="flex flex-wrap gap-2">
              {daySessions.map(s => (
                <button key={s.id} onClick={() => selectSession(s.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${
                    selectedSession === s.id
                      ? "bg-[#050040] text-white border-[#050040]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}>
                  <span>{s.name}</span>
                  <span className={`text-xs ${selectedSession === s.id ? "text-white/70" : "text-gray-400"}`}>
                    {s.time?.slice(0, 5)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">Attendees</h2>
              <p className="text-xs text-gray-400 mt-0.5">{checkedIn.size} / {attendees.length} checked in</p>
            </div>
            <input placeholder="Search member…" value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#050040] w-40 transition" />
          </div>
          {loadingList ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-[#050040] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayed.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              {attendees.length === 0 ? "No bookings for this session yet." : "No members match your search."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {displayed.map(b => {
                const checked = checkedIn.has(b.id);
                return (
                  <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${checked ? "bg-green-100" : "bg-gray-100"}`}>
                      <span className={`text-sm font-bold ${checked ? "text-green-700" : "text-gray-500"}`}>
                        {(b.users?.name ?? "?")[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.users?.name ?? "Member"}</p>
                      <p className="text-xs text-gray-400 truncate">{b.users?.email}</p>
                    </div>
                    <button onClick={() => toggleCheckIn(b.id)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        checked
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-white text-gray-600 border-gray-200 hover:border-[#050040] hover:text-[#050040]"
                      }`}>
                      {checked && <Ic.Check className="w-3.5 h-3.5" />}
                      {checked ? "Checked in" : "Check in"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
