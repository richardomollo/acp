"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { fetchVenueTypes, fetchSessionCategories } from "@/app/lib/lookups";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = "overview" | "venue" | "sessions" | "experiences" | "programmes" | "revenue" | "checkin" | "trainers";

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
  rate_floor: number | null;
  rate_floor_percentage: number | null;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
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
  drop_in_price: number | null;
  max_capacity: number;
  spots_left: number;
  is_active: boolean;
  category: string;
  instructor: string;
  instructor_id?: string | null;
  image_url: string | null;
  recurring?: boolean;
  cancellation_cutoff_hours?: number | null;
  deposit_pct?: number | null;
  no_show_grace_mins?: number | null;
};

type Booking = {
  id: string;
  user_id: string;
  session_id: string;
  gym_id: string;
  booking_date: string;
  booking_time: string;
  checked_in?: boolean;
  no_show?: boolean;
  confirmation_code: string | null;
  status?: string;
  deposit_amount?: number;
  guest_email?: string | null;
  users?: { name: string; email: string; phone: string } | null;
  sessions?: { name: string; date: string; time: string; drop_in_price: number | null } | null;
};

type ExperienceBooking = {
  id: string;
  status: string;
  deposit_amount: number;
  remainder_amount: number;
  created_at: string;
  guest_name: string | null;
  email: string | null;
  experience_id: string;
  experiences?: { name: string; date: string; gyms?: { rate_floor_percentage: number | null } | null } | null;
  users?: { name: string } | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────


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
  Grid: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
    </svg>
  ),
  Building: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-3a2 2 0 012-2h2a2 2 0 012 2v3" />
    </svg>
  ),
  Calendar: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Chart: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Check: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Logout: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  Upload: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Plus: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Trash: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  ChevronDown: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Share: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  ),
  Sparkles: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  Users: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3.13a4 4 0 10-4-4 4 4 0 004 4zm7 3a4 4 0 10-4-4" />
    </svg>
  ),
  Trophy: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 21h8m-4-4v4m-6-17h12v4a6 6 0 01-12 0V4zM4 6h2v2a3 3 0 01-3-3V4a1 1 0 011-1zm16 0h-2v2a3 3 0 003-3V4a1 1 0 00-1-1z" />
    </svg>
  ),
};

const NAV: { key: Section; label: string; Icon: typeof Ic.Grid }[] = [
  { key: "overview",  label: "Overview",  Icon: Ic.Grid },
  { key: "venue",     label: "Venue",     Icon: Ic.Building },
  { key: "sessions",     label: "Sessions",     Icon: Ic.Calendar },
  { key: "experiences",  label: "Experiences",  Icon: Ic.Sparkles },
  { key: "programmes",   label: "Programmes",   Icon: Ic.Trophy },
  { key: "revenue",      label: "Revenue",      Icon: Ic.Chart },
  { key: "checkin",   label: "Check-in",  Icon: Ic.Check },
  { key: "trainers",  label: "Trainers",  Icon: Ic.Users },
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
  const [expBookings, setExpBookings]     = useState<ExperienceBooking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [switching, setSwitching]         = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const [targetMargin, setTargetMargin]     = useState(0.20);
  const [venueTypes, setVenueTypes] = useState<string[]>([]);
  const [sessionCategories, setSessionCategories] = useState<string[]>([]);
  const [hasPTRole, setHasPTRole] = useState(false);
  const [communityStatus, setCommunityStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");

  useEffect(() => {
    fetchVenueTypes().then(setVenueTypes);
    fetchSessionCategories().then(setSessionCategories);
  }, []);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) { router.push("/partner-login"); return; }
    setUser(user);
    setEmailVerified(!!user.email_confirmed_at);

    // Resolve owned gyms via partners -> partner_gyms (same linkage the RLS
    // policies and the mobile partner app use), not by matching contact_email
    // against the login email — that string match breaks silently if
    // contact_email has so much as a typo, unlike this account-based join.
    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const [partnerGymsRes, settingsRes] = await Promise.all([
      partner
        ? supabase.from("partner_gyms")
            .select("gyms(*, rate_floor, rate_floor_percentage)")
            .eq("partner_id", partner.id)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("app_settings")
        .select("key, value")
        .in("key", ["target_margin"]),
    ]);

    const gymsData = (partnerGymsRes.data ?? [])
      .map((pg: any) => pg.gyms)
      .filter(Boolean)
      .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "")) as Gym[];

    if (settingsRes.data) {
      for (const row of settingsRes.data) {
        const v = parseFloat(row.value);
        if (!isNaN(v)) {
          if (row.key === "target_margin") setTargetMargin(v);
        }
      }
    }

    const { data: ptData } = await supabase
      .from("personal_trainers")
      .select("id")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();
    if (ptData) setHasPTRole(true);

    const { data: communityMembership } = await supabase
      .from("community_members")
      .select("communities(review_status)")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const communityRow = communityMembership?.communities as any;
    if (communityRow) setCommunityStatus(communityRow.review_status);

    if (gymsData.length > 0) {
      setGyms(gymsData);
      setActiveGym(gymsData[0]);
      await Promise.all([
        loadSessions(gymsData[0].id),
        loadBookings(gymsData[0].id),
        loadExperienceBookings(gymsData[0].id),
      ]);
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
    setExpBookings([]);
    await Promise.all([loadSessions(gym.id), loadBookings(gym.id), loadExperienceBookings(gym.id)]);
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
      .select("*, users(name, email, phone), sessions(name, date, time, drop_in_price)")
      .eq("gym_id", gymId)
      .order("booking_date", { ascending: false })
      .limit(500);
    setBookings(data || []);
  }

  async function loadExperienceBookings(gymId: string) {
    const { data } = await supabase
      .from("experience_bookings")
      .select("id, status, deposit_amount, remainder_amount, created_at, guest_name, email, experience_id, experiences!experience_id(name, date, gyms!gym_id(rate_floor_percentage)), users!user_id(name)")
      .eq("gym_id", gymId)
      .in("status", ["deposit_paid", "confirmed", "checked_in"])
      .order("created_at", { ascending: false })
      .limit(200);
    setExpBookings((data as unknown as ExperienceBooking[]) || []);
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

  const communityCta =
    communityStatus === "approved"
      ? { href: "/community-dashboard", label: "Community Dashboard" }
      : communityStatus === "pending" || communityStatus === "rejected"
      ? { href: "/community-onboarding/pending", label: "Community Status" }
      : { href: "/community-onboarding", label: "Start a Community" };

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
          {hasPTRole && (
            <Link href="/pt-dashboard"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/8 transition-colors mb-1">
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Switch to PT Dashboard
            </Link>
          )}
          <Link href={communityCta.href}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/8 transition-colors mb-1">
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
            </svg>
            {communityCta.label}
          </Link>
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
          <div className="flex items-center gap-3">
            {hasPTRole && (
              <Link href="/pt-dashboard" className="text-white/60 text-xs font-medium hover:text-white transition-colors flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                PT Dashboard
              </Link>
            )}
            <Link href={communityCta.href} className="text-white/60 text-xs font-medium hover:text-white transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
              </svg>
              {communityCta.label}
            </Link>
            <button onClick={signOut} className="text-white/60 text-xs font-medium">Sign out</button>
          </div>
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
              <OverviewSection
                gym={gym}
                sessions={sessions}
                bookings={bookings}
                targetMargin={targetMargin}
                onNavigate={setSection}
              />
            )}
            {section === "venue" && (
              <VenueSection gym={gym} gyms={gyms} onSaved={handleGymSaved} venueTypes={venueTypes} />
            )}
            {section === "sessions" && (
              <SessionsSection gym={gym} sessions={sessions} targetMargin={targetMargin} onRefresh={() => loadSessions(gym.id)} sessionCategories={sessionCategories} />
            )}
            {section === "experiences" && (
              <ExperiencesSection gym={gym} onRefresh={() => {}} />
            )}
            {section === "programmes" && (
              <ProgrammesSection gym={gym} />
            )}
            {section === "revenue" && (
              <RevenueSection bookings={bookings} expBookings={expBookings} targetMargin={targetMargin} />
            )}
            {section === "checkin" && (
              <CheckInSection sessions={sessions} />
            )}
            {section === "trainers" && (
              <TrainersSection gym={gym} gyms={gyms} />
            )}
          </main>
        )}
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmtKes = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

function calcPayout(b: Booking, margin: number): number {
  const gross = Number(b.sessions?.drop_in_price) || 0;
  return Math.round(gross * (1 - margin));
}

function isNoShow(b: Booking): boolean {
  return !!(b.no_show || (!b.checked_in && b.booking_date < todayStr()));
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ gym, sessions, bookings, targetMargin, onNavigate }: {
  gym: Gym; sessions: Session[]; bookings: Booking[];
  targetMargin: number; onNavigate: (s: Section) => void;
}) {
  const t = todayStr();
  const m = monthStr();

  const todaySessions  = sessions.filter(s => s.date === t && s.is_active);
  const todayBookings  = bookings.filter(b => b.booking_date === t);
  const monthBookings  = bookings.filter(b => b.booking_date?.startsWith(m));
  const upcoming       = sessions.filter(s => s.date > t && s.is_active)
                                  .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                                  .slice(0, 5);

  const totalEarned = bookings.reduce((s, b) => s + calcPayout(b, targetMargin), 0);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr  = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">

      {/* ── Hero card ── */}
      <div className="bg-[#050040] rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white/50 text-sm">{dateStr}</p>
            <h1 className="text-2xl font-bold mt-0.5">{greeting}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                gym.is_active ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${gym.is_active ? "bg-green-400" : "bg-amber-400"}`} />
                {gym.is_active ? "Live on platform" : "Pending approval"}
              </span>
              <span className="text-white/30 text-xs">{gym.type} · {gym.area}</span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-white/10">
          <button onClick={() => onNavigate("checkin")}
            className="flex items-center gap-2 px-4 py-2 bg-white text-[#050040] text-sm font-semibold rounded-xl hover:bg-white/90 transition">
            <Ic.Check className="w-4 h-4" />
            Check in members
          </button>
          <button onClick={() => onNavigate("sessions")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition">
            <Ic.Plus className="w-4 h-4" />
            Add session
          </button>
          <button onClick={() => onNavigate("revenue")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition">
            <Ic.Chart className="w-4 h-4" />
            Revenue
          </button>
        </div>
      </div>

      {/* ── Today's sessions ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Today's sessions</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {todaySessions.length === 0
                ? "Nothing scheduled today"
                : `${todaySessions.length} session${todaySessions.length !== 1 ? "s" : ""} · ${todayBookings.length} booking${todayBookings.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={() => onNavigate("checkin")}
            className="text-xs font-semibold text-[#050040] hover:underline flex items-center gap-1">
            Check in <span>→</span>
          </button>
        </div>
        {todaySessions.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400">No sessions scheduled for today.</p>
            <button onClick={() => onNavigate("sessions")}
              className="mt-2 text-sm font-semibold text-[#050040] hover:underline">
              + Schedule a session
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todaySessions
              .sort((a, b) => a.time.localeCompare(b.time))
              .map(s => {
                const booked      = bookings.filter(b => b.session_id === s.id).length;
                const checkedInNow = bookings.filter(b => b.session_id === s.id && b.checked_in).length;
                const pct         = s.max_capacity > 0 ? (booked / s.max_capacity) * 100 : 0;
                return (
                  <div key={s.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#050040]/6 flex items-center justify-center flex-shrink-0">
                      <Ic.Calendar className="w-5 h-5 text-[#050040]/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{s.time?.slice(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-green-400"}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{booked}/{s.max_capacity} booked</span>
                        {checkedInNow > 0 && (
                          <span className="text-xs text-green-600 font-medium">{checkedInNow} present</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => onNavigate("checkin")}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#050040]/15 text-[#050040] text-xs font-semibold hover:bg-[#050040] hover:text-white hover:border-[#050040] transition">
                      <Ic.Check className="w-3.5 h-3.5" />
                      Check in
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total earned",   value: fmtKes(totalEarned), sub: "all time",    dark: true  },
          { label: "This month",     value: monthBookings.length, sub: "bookings",   dark: false },
          { label: "Today",          value: todayBookings.length, sub: "check-ins",  dark: false },
          { label: "All bookings",   value: bookings.length,      sub: "all time",   dark: false },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 shadow-sm ${s.dark ? "bg-[#050040]" : "bg-white"}`}>
            <p className={`text-xs font-medium mb-1 ${s.dark ? "text-white/50" : "text-gray-500"}`}>{s.label}</p>
            <p className={`text-2xl font-bold ${s.dark ? "text-white" : "text-gray-900"}`}>{s.value}</p>
            <p className={`text-xs mt-0.5 ${s.dark ? "text-white/30" : "text-gray-400"}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Upcoming (next few days) ── */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Coming up</h2>
            <p className="text-xs text-gray-400 mt-0.5">Next scheduled sessions</p>
          </div>
          <div className="divide-y divide-gray-50">
            {upcoming.map(s => {
              const booked = bookings.filter(b => b.session_id === s.id).length;
              const pct    = s.max_capacity > 0 ? Math.round((booked / s.max_capacity) * 100) : 0;
              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                  {s.image_url
                    ? <img src={s.image_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" />
                    : <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center">
                        <Ic.Calendar className="w-5 h-5 text-gray-300" />
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{s.name}</p>
                    <p className="text-xs text-gray-400">{fmtDate(s.date)} · {s.time?.slice(0, 5)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{booked}/{s.max_capacity}</p>
                    <p className={`text-xs font-medium ${pct >= 80 ? "text-red-500" : pct >= 50 ? "text-amber-500" : "text-green-500"}`}>
                      {pct}% full
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent bookings ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent bookings</h2>
          <button onClick={() => onNavigate("revenue")}
            className="text-xs font-semibold text-[#050040] hover:underline flex items-center gap-1">
            All revenue <span>→</span>
          </button>
        </div>
        {bookings.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No bookings yet.</p>
            <p className="text-xs text-gray-300 mt-1">Share your sessions link to get your first booking.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bookings.slice(0, 6).map(b => {
              const noShow  = isNoShow(b);
              const avatarBg = b.checked_in ? "bg-green-100" : noShow ? "bg-red-100" : "bg-[#050040]/8";
              const avatarTx = b.checked_in ? "text-green-700" : noShow ? "text-red-400" : "text-[#050040]";
              const label    = b.checked_in ? "Earned" : noShow ? "No show" : "Pending";
              const lblCls   = b.checked_in ? "text-green-500" : noShow ? "text-red-400" : "text-amber-400";
              return (
                <div key={b.id} className={`flex items-center gap-3 px-5 py-3 ${noShow ? "opacity-70" : ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBg}`}>
                    <span className={`text-xs font-bold ${avatarTx}`}>
                      {(b.users?.name ?? b.guest_email?.split("@")[0] ?? "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.users?.name ?? b.guest_email?.split("@")[0] ?? "Member"}</p>
                    <p className="text-xs text-gray-400 truncate">{b.sessions?.name ?? "Session"} · {fmtDate(b.booking_date)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold ${noShow ? "text-gray-400 line-through" : "text-[#050040]"}`}>
                      {fmtKes(calcPayout(b, targetMargin))}
                    </p>
                    <p className={`text-xs font-medium ${lblCls}`}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Venue ────────────────────────────────────────────────────────────────────

function VenueSection({ gym, gyms, onSaved, venueTypes }: { gym: Gym; gyms: Gym[]; onSaved: (g: Gym) => void; venueTypes: string[] }) {
  const [form, setForm] = useState({
    name:                     gym.name,
    location:                 gym.location,
    area:                     gym.area,
    type:                     gym.type,
    description:              gym.description,
    contact_phone:            gym.contact_phone,
    cancellation_cutoff_hours: gym.cancellation_cutoff_hours ?? 24,
    deposit_pct:               gym.deposit_pct               ?? 30,
    no_show_grace_mins:        gym.no_show_grace_mins        ?? 15,
  });
  const [imageUrl,  setImageUrl]  = useState(gym.image_url ?? "");
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg,       setMsg]       = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset form when active gym changes
  useEffect(() => {
    setForm({
      name:                     gym.name,
      location:                 gym.location,
      area:                     gym.area,
      type:                     gym.type,
      description:              gym.description,
      contact_phone:            gym.contact_phone,
      cancellation_cutoff_hours: gym.cancellation_cutoff_hours ?? 24,
      deposit_pct:               gym.deposit_pct               ?? 30,
      no_show_grace_mins:        gym.no_show_grace_mins        ?? 15,
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
      .update({
        ...form,
        image_url: imageUrl || null,
        cancellation_cutoff_hours: form.cancellation_cutoff_hours,
        deposit_pct: form.deposit_pct,
        no_show_grace_mins: form.no_show_grace_mins,
      })
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
              {venueTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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

        {/* Cancellation policy */}
        <div className="border-t border-gray-100 pt-6 space-y-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Cancellation Policy
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Free cancellation window</label>
            <p className="text-xs text-gray-400 mb-3">How many hours before a session customers can cancel for free.</p>
            <div className="flex flex-wrap gap-2">
              {CUTOFF_OPTIONS.map(h => {
                const label = h === null ? "None" : h === 0 ? "No free cancellation" : `${h}h`;
                const val   = h === null ? 24 : h;
                const active = form.cancellation_cutoff_hours === val;
                return (
                  <button key={String(h)} type="button"
                    onClick={() => setForm(p => ({ ...p, cancellation_cutoff_hours: val }))}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>{label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Deposit required</label>
            <p className="text-xs text-gray-400 mb-3">Percentage of session price paid at booking.</p>
            <div className="flex flex-wrap gap-2">
              {DEPOSIT_OPTIONS.map(pct => {
                const val   = pct === null ? 30 : pct;
                const label = `${val}%`;
                const active = form.deposit_pct === val;
                return (
                  <button key={String(pct)} type="button"
                    onClick={() => setForm(p => ({ ...p, deposit_pct: val }))}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>{label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">No-show grace period</label>
            <p className="text-xs text-gray-400 mb-3">How long after a session starts before a customer is marked no-show.</p>
            <div className="flex flex-wrap gap-2">
              {GRACE_OPTIONS.map(m => {
                const val   = m === null ? 15 : m;
                const label = m === null ? "15 min" : m === 0 ? "Immediate" : `${m} min`;
                const active = form.no_show_grace_mins === val;
                return (
                  <button key={String(m)} type="button"
                    onClick={() => setForm(p => ({ ...p, no_show_grace_mins: val }))}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>{label}</button>
                );
              })}
            </div>
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

function ShareRow({ sessionId, name, date, time, gymName }: {
  sessionId: string; name: string; date: string; time: string; gymName: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : "https://activecitypass.com"}/sessions/${sessionId}`;
  const displayUrl = `activecitypass.com/sessions/${sessionId}`;
  const shareText = encodeURIComponent(`Book "${name}" at ${gymName} — ${fmtDate(date)} at ${time.slice(0, 5)}`);
  const shareUrl = encodeURIComponent(url);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: name, text: decodeURIComponent(shareText), url }); } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs text-gray-400 mb-2">Share this session on WhatsApp, Instagram, or any social to get more bookings.</p>
      {/* Link pill + copy */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-400 truncate font-mono flex-1">{displayUrl}</span>
          <button onClick={handleCopy} title={copied ? "Copied!" : "Copy link"}
            className={`flex-shrink-0 transition ${copied ? "text-green-600" : "text-gray-400 hover:text-gray-600"}`}>
            {copied
              ? <Ic.Check className="w-3.5 h-3.5" />
              : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )
            }
          </button>
        </div>
        {/* Native share CTA */}
        <button onClick={handleShare}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#050040] text-white text-xs font-semibold rounded-lg hover:bg-[#0a006b] transition">
          <Ic.Share className="w-3.5 h-3.5" />
          Share
        </button>
      </div>
      {/* Social quick-share icons */}
      <div className="flex items-center gap-2">
        {/* WhatsApp */}
        <a href={`https://wa.me/?text=${shareText}%20${shareUrl}`} target="_blank" rel="noopener noreferrer"
          title="Share on WhatsApp"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#25D366] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
        {/* X / Twitter */}
        <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noopener noreferrer"
          title="Share on X"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-black hover:opacity-75 transition">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
        {/* Facebook */}
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noopener noreferrer"
          title="Share on Facebook"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1877F2] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </a>
        {/* Telegram */}
        <a href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noopener noreferrer"
          title="Share on Telegram"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#229ED9] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}

const CUTOFF_OPTIONS  = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50]   as const;
const GRACE_OPTIONS   = [null, 0, 5, 10, 15, 30]          as const;

const EMPTY: Omit<Session, "id" | "gym_id" | "spots_left" | "is_active"> = {
  name: "", description: "", time: "", date: "", duration_minutes: 60,
  max_capacity: 20, category: "strength", instructor: "", instructor_id: null, image_url: null, drop_in_price: null,
  cancellation_cutoff_hours: null, deposit_pct: null, no_show_grace_mins: null,
};

function SessionsSection({ gym, sessions, targetMargin, onRefresh, sessionCategories }: {
  gym: Gym; sessions: Session[]; targetMargin: number; onRefresh: () => void; sessionCategories: string[];
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
  const [trainers, setTrainers] = useState<{ id: string; full_name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("gym_trainers").select("id, full_name")
      .eq("gym_id", gym.id).neq("status", "suspended")
      .then(({ data }) => setTrainers(data ?? []));
  }, [gym.id]);

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
      duration_minutes: s.duration_minutes,
      max_capacity: s.max_capacity, category: s.category, instructor: s.instructor,
      instructor_id: s.instructor_id ?? null,
      image_url: s.image_url, drop_in_price: s.drop_in_price,
      cancellation_cutoff_hours: s.cancellation_cutoff_hours ?? null,
      deposit_pct: s.deposit_pct ?? null,
      no_show_grace_mins: s.no_show_grace_mins ?? null,
    });
    setEditId(s.id); setEditGroupIds(null); resetRecurring(); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEditGroup(rep: Session, all: Session[]) {
    setForm({
      name: rep.name, description: rep.description, time: rep.time, date: rep.date,
      duration_minutes: rep.duration_minutes,
      max_capacity: rep.max_capacity, category: rep.category, instructor: rep.instructor,
      instructor_id: rep.instructor_id ?? null,
      image_url: rep.image_url, drop_in_price: rep.drop_in_price,
      cancellation_cutoff_hours: rep.cancellation_cutoff_hours ?? null,
      deposit_pct: rep.deposit_pct ?? null,
      no_show_grace_mins: rep.no_show_grace_mins ?? null,
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

    const policyOverride = {
      cancellation_cutoff_hours: form.cancellation_cutoff_hours ?? null,
      deposit_pct: form.deposit_pct ?? null,
      no_show_grace_mins: form.no_show_grace_mins ?? null,
    };

    if (editGroupIds) {
      ({ error } = await supabase.from("sessions").update({
        name: form.name, description: form.description, time: form.time,
        duration_minutes: Number(form.duration_minutes),
        max_capacity: Number(form.max_capacity),
        category: form.category, instructor: form.instructor, instructor_id: form.instructor_id ?? null,
        image_url: form.image_url || null, drop_in_price: form.drop_in_price,
        ...policyOverride,
      }).in("id", editGroupIds));

    } else if (!editId && isRecurring) {
      const dates = generateRecurringDates(form.date, recurEndDate, recurDays);
      if (dates.length === 0) { setSaving(false); alert("No sessions fall on the selected days in that date range."); return; }
      const base = {
        gym_id: gym.id, name: form.name, description: form.description, time: form.time,
        duration_minutes: Number(form.duration_minutes),
        max_capacity: Number(form.max_capacity), spots_left: Number(form.max_capacity),
        category: form.category, instructor: form.instructor, instructor_id: form.instructor_id ?? null,
        image_url: form.image_url || null, drop_in_price: form.drop_in_price,
        is_active: true, recurring: true, ...policyOverride,
      };
      ({ error } = await supabase.from("sessions").insert(dates.map(date => ({ ...base, date }))));

    } else {
      const payload = {
        gym_id: gym.id, ...form,
        duration_minutes: Number(form.duration_minutes),
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
              <input value={form.instructor}
                onChange={e => setForm(p => ({ ...p, instructor: e.target.value, instructor_id: null }))}
                className={inp} placeholder="Instructor name" />
              {trainers.length > 0 && (
                <select
                  value={form.instructor_id ?? ""}
                  onChange={e => {
                    const trainer = trainers.find(tr => tr.id === e.target.value);
                    setForm(p => ({ ...p, instructor_id: trainer?.id ?? null, instructor: trainer ? trainer.full_name : p.instructor }));
                  }}
                  className={inp + " mt-2 text-xs"}
                >
                  <option value="">Or assign a registered trainer…</option>
                  {trainers.map(tr => <option key={tr.id} value={tr.id}>{tr.full_name}</option>)}
                </select>
              )}
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
                {sessionCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Max capacity</label>
              <input type="number" min={1} value={form.max_capacity}
                onChange={e => setF("max_capacity", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Walk-in / Drop-in price (KES)</label>
              <input
                type="number" min={0} step={50}
                value={form.drop_in_price ?? ""}
                onChange={e => setF("drop_in_price", e.target.value === "" ? null : Number(e.target.value))}
                className={inp} placeholder="e.g. 1500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your payout</label>
              {(() => {
                const hasFloor = gym.rate_floor_percentage != null;
                const hasPrice = form.drop_in_price != null && Number(form.drop_in_price) > 0;
                if (hasFloor && hasPrice) {
                  const payout = Number(form.drop_in_price) * (gym.rate_floor_percentage! / 100);
                  return (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                      <span className="text-xs text-blue-500">
                        Partner payout: KES {Math.round(payout).toLocaleString()}
                      </span>
                    </div>
                  );
                }
                if (!hasFloor) return (
                  <div className="px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                    ⚠ No wholesale rate agreed yet — payout will be set once admin finalises the rate floor.
                  </div>
                );
                return (
                  <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                    Enter the walk-in price above to see your payout.
                  </div>
                );
              })()}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => setF("description", e.target.value)}
                rows={3} className={inp + " resize-none"} placeholder="What will members experience?" />
            </div>
          </div>

          {/* Session-level policy override */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Cancellation Policy Override</p>
              <p className="text-xs text-gray-400 mb-4">Leave at "Venue default" to inherit your venue policy. Override only for this session.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Free cancellation window</label>
              <div className="flex flex-wrap gap-2">
                {CUTOFF_OPTIONS.map(h => {
                  const label  = h === null ? "Venue default" : h === 0 ? "None" : `${h}h`;
                  const active = form.cancellation_cutoff_hours === (h ?? null);
                  return (
                    <button key={String(h)} type="button"
                      onClick={() => setForm(p => ({ ...p, cancellation_cutoff_hours: h ?? null }))}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Deposit required</label>
              <div className="flex flex-wrap gap-2">
                {DEPOSIT_OPTIONS.map(pct => {
                  const label  = pct === null ? "Venue default" : `${pct}%`;
                  const active = form.deposit_pct === (pct ?? null);
                  return (
                    <button key={String(pct)} type="button"
                      onClick={() => setForm(p => ({ ...p, deposit_pct: pct ?? null }))}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">No-show grace period</label>
              <div className="flex flex-wrap gap-2">
                {GRACE_OPTIONS.map(m => {
                  const label  = m === null ? "Venue default" : m === 0 ? "Immediate" : `${m} min`;
                  const active = form.no_show_grace_mins === (m ?? null);
                  return (
                    <button key={String(m)} type="button"
                      onClick={() => setForm(p => ({ ...p, no_show_grace_mins: m ?? null }))}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
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
              <div key={`${rep.name}||${rep.time}`} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex gap-4 items-center">
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
                      {rep.drop_in_price != null && gym.rate_floor_percentage != null && (
                        <span className="text-green-600"> · KES {Math.round(rep.drop_in_price * (gym.rate_floor_percentage / 100)).toLocaleString()} payout</span>
                      )}
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
                <ShareRow sessionId={(upcoming[0] ?? rep).id} name={rep.name} date={(upcoming[0] ?? rep).date} time={rep.time} gymName={gym.name} />
              </div>
            );
          })}

          {filteredOneOff.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex gap-4 items-center">
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
                  <p className="text-xs text-gray-400">
                    {s.spots_left}/{s.max_capacity} spots
                    {s.drop_in_price != null && gym.rate_floor_percentage != null && (
                      <span className="text-green-600"> · KES {Math.round(s.drop_in_price * (gym.rate_floor_percentage / 100)).toLocaleString()} payout</span>
                    )}
                  </p>
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
              <ShareRow sessionId={s.id} name={s.name} date={s.date} time={s.time} gymName={gym.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

function RevenueSection({ bookings, expBookings, targetMargin }: {
  bookings: Booking[]; expBookings: ExperienceBooking[]; targetMargin: number;
}) {
  const m = monthStr();
  const today = todayStr();

  const earnedBookings  = bookings.filter(b => b.checked_in);
  const noShowBookings  = bookings.filter(b => isNoShow(b));
  const pendingBookings = bookings.filter(b => !b.checked_in && !isNoShow(b));
  const monthBookings   = bookings.filter(b => b.booking_date?.startsWith(m));

  const sessionTotalEarned = earnedBookings.reduce((s, b) => s + calcPayout(b, targetMargin), 0);
  const sessionMonthEarned = monthBookings.filter(b => b.checked_in).reduce((s, b) => s + calcPayout(b, targetMargin), 0);
  const noShowAmount = noShowBookings.reduce((s, b) => s + calcPayout(b, targetMargin), 0);

  function calcExpPayout(eb: ExperienceBooking): number {
    const exp = Array.isArray(eb.experiences) ? (eb.experiences as any[])[0] : eb.experiences;
    const gym = Array.isArray(exp?.gyms) ? (exp.gyms as any[])[0] : exp?.gyms;
    const commission = gym?.rate_floor_percentage ?? (targetMargin * 100);
    return Math.round(Number(eb.deposit_amount || 0) * (1 - commission / 100));
  }

  // Deposit already collected — all paid experience bookings count as earned
  const earnedExpBookings = expBookings;
  const pendingExpBookings: ExperienceBooking[] = [];

  const expTotalEarned = earnedExpBookings.reduce((s, eb) => s + calcExpPayout(eb), 0);
  const expMonthEarned = earnedExpBookings.filter(eb => {
    const expDate = (eb.experiences as any)?.date ?? eb.created_at.slice(0, 10);
    return expDate.startsWith(m);
  }).reduce((s, eb) => s + calcExpPayout(eb), 0);

  const totalEarned = sessionTotalEarned + expTotalEarned;
  const monthEarned = sessionMonthEarned + expMonthEarned;
  const pendingCount = pendingBookings.length + pendingExpBookings.length;

  const stats = [
    { label: "Total Earned",        value: fmtKes(totalEarned),   sub: `${earnedBookings.length + earnedExpBookings.length} paid bookings`, dark: true  },
    { label: "Earned This Month",   value: fmtKes(monthEarned),   sub: "confirmed attendance",                                              dark: false },
    { label: "Pending",             value: pendingCount,           sub: "upcoming bookings",                                                 dark: false },
    { label: "No Shows",            value: noShowBookings.length,  sub: `${fmtKes(noShowAmount)} missed`,                                    dark: false },
  ];

  const hasAny = bookings.length > 0 || expBookings.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Revenue</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`rounded-2xl p-5 shadow-sm ${s.dark ? "bg-[#050040]" : "bg-white"}`}>
            <p className={`text-xs font-medium mb-1 ${s.dark ? "text-white/50" : "text-gray-500"}`}>{s.label}</p>
            <p className={`text-2xl font-bold ${s.dark ? "text-white" : "text-gray-900"}`}>{s.value}</p>
            <p className={`text-xs mt-0.5 ${s.dark ? "text-white/30" : "text-gray-400"}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-900">Booking History</h2>
        </div>
        {!hasAny ? (
          <div className="p-10 text-center text-gray-400 text-sm">No bookings yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {bookings.map(b => {
              const noShow  = isNoShow(b);
              const label   = b.checked_in ? "Earned" : noShow ? "No show" : "Pending";
              const lblCls  = b.checked_in ? "text-green-600" : noShow ? "text-red-400" : "text-amber-500";
              const avatarBg = b.checked_in ? "bg-green-100" : noShow ? "bg-red-100" : "bg-[#050040]/10";
              const avatarTx = b.checked_in ? "text-green-700" : noShow ? "text-red-400" : "text-[#050040]";
              return (
                <div key={b.id} className={`flex items-center gap-4 px-5 py-3 ${noShow ? "opacity-60" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBg}`}>
                    <span className={`text-xs font-bold ${avatarTx}`}>{(b.users?.name ?? b.guest_email?.split("@")[0] ?? "?")[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.users?.name ?? b.guest_email?.split("@")[0] ?? "Member"}</p>
                    <p className="text-xs text-gray-400 truncate">{b.sessions?.name ?? "Session"} · {fmtDate(b.booking_date)}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-semibold ${noShow ? "text-gray-400 line-through" : "text-[#050040]"}`}>
                      {fmtKes(calcPayout(b, targetMargin))}
                    </p>
                    <p className={`text-xs font-medium ${lblCls}`}>{label}</p>
                  </div>
                </div>
              );
            })}
            {expBookings.map(eb => {
              const exp = Array.isArray(eb.experiences) ? (eb.experiences as any[])[0] : eb.experiences as any;
              const expDate = exp?.date ?? eb.created_at.slice(0, 10);
              const label    = "Earned";
              const lblCls   = "text-green-600";
              const avatarBg = "bg-green-100";
              const avatarTx = "text-green-700";
              const memberName = eb.users?.name || eb.guest_name || eb.email?.split("@")[0] || "Guest";
              return (
                <div key={eb.id} className="flex items-center gap-4 px-5 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBg}`}>
                    <span className={`text-xs font-bold ${avatarTx}`}>{memberName[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{memberName}</p>
                    <p className="text-xs text-gray-400 truncate">{exp?.name ?? "Experience"} · {fmtDate(expDate)}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold text-[#050040]">{fmtKes(calcExpPayout(eb))}</p>
                    <p className={`text-xs font-medium ${lblCls}`}>{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

type CodeStatus = "idle" | "loading" | "success" | "already" | "invalid";

const PARTNER_CANCELLABLE = ["confirmed", "deposit_paid", "pending_payment"];

function CheckInSection({ sessions }: { sessions: Session[] }) {
  const [date,            setDate]            = useState(todayStr());
  const [selectedSession, setSelectedSession]  = useState<string | null>(null);
  const [attendees,       setAttendees]        = useState<Booking[]>([]);
  const [checkedIn,       setCheckedIn]        = useState<Set<string>>(new Set());
  const [loadingList,     setLoadingList]      = useState(false);
  const [search,          setSearch]           = useState("");
  const [codeInput,       setCodeInput]        = useState("");
  const [codeStatus,      setCodeStatus]       = useState<CodeStatus>("idle");
  const [lastMember,      setLastMember]       = useState<Booking | null>(null);
  const [cancellingId,    setCancellingId]     = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const daySessions = sessions.filter(s => s.date === date);
  const selectedSessionObj = sessions.find(s => s.id === selectedSession) ?? null;

  function getCheckInOpenTime(session: Session): Date {
    const t = new Date(`${session.date}T${session.time}`);
    return new Date(t.getTime() - 60 * 60 * 1000);
  }

  const openTime       = selectedSessionObj ? getCheckInOpenTime(selectedSessionObj) : null;
  const canCheckIn     = openTime ? now >= openTime : false;
  const openTimeStr    = openTime?.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

  async function handleSessionSelect(id: string) {
    setSelectedSession(id);
    setSearch("");
    setCodeInput("");
    setCodeStatus("idle");
    setLastMember(null);
    setLoadingList(true);
    const { data } = await supabase
      .from("bookings").select("*, users(name, email, phone)").eq("session_id", id);
    setAttendees(data || []);
    setCheckedIn(new Set((data || []).filter((b: any) => b.checked_in).map((b: any) => b.id)));
    setLoadingList(false);
    setTimeout(() => codeRef.current?.focus(), 100);
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCheckIn) return;
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setCodeStatus("loading");

    const match = attendees.find(b => b.confirmation_code?.toUpperCase() === code);
    if (!match) {
      setCodeStatus("invalid");
      return;
    }
    if (checkedIn.has(match.id)) {
      setLastMember(match);
      setCodeStatus("already");
      return;
    }
    await supabase.from("bookings").update({ checked_in: true }).eq("id", match.id);
    setCheckedIn(prev => { const next = new Set(prev); next.add(match.id); return next; });
    setLastMember(match);
    setCodeStatus("success");
    setCodeInput("");
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function undoCheckIn(bookingId: string) {
    setCheckedIn(prev => { const next = new Set(prev); next.delete(bookingId); return next; });
    await supabase.from("bookings").update({ checked_in: false }).eq("id", bookingId);
  }

  async function handlePartnerCancel(b: Booking) {
    if (!confirm(`Cancel booking for ${b.users?.name ?? b.guest_email?.split("@")[0] ?? "this member"}? They will receive a full refund.`)) return;
    setCancellingId(b.id);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { alert("Session expired. Please refresh."); setCancellingId(null); return; }
    const res = await fetch("/api/partner/cancel-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookingId: b.id, reason: "Cancelled by venue" }),
    });
    const data = await res.json();
    setCancellingId(null);
    if (!res.ok) { alert(data?.error ?? "Failed to cancel booking."); return; }
    setAttendees(prev => prev.filter(a => a.id !== b.id));
  }

  function resetCode() {
    setCodeInput("");
    setCodeStatus("idle");
    setLastMember(null);
    codeRef.current?.focus();
  }

  const displayed = attendees.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.users?.name ?? "").toLowerCase().includes(q) || (b.users?.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Check-in</h1>
        <p className="text-gray-500 text-sm mt-0.5">Ask members for their booking confirmation code to check them in</p>
      </div>

      {/* Date + session picker */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
          <input type="date" value={date}
            onChange={e => {
              setDate(e.target.value);
              setSelectedSession(null);
              setAttendees([]);
              setCodeStatus("idle");
              setLastMember(null);
            }}
            className={inp + " max-w-xs"} />
        </div>
        {daySessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions scheduled for this date.</p>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Select a session</p>
            <div className="flex flex-wrap gap-2">
              {daySessions.map(s => (
                <button key={s.id} onClick={() => handleSessionSelect(s.id)}
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

      {/* Code scanner — shown once a session is selected */}
      {selectedSession && !loadingList && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <p className="font-semibold text-gray-900">Enter Confirmation Code</p>
            <p className="text-xs text-gray-400 mt-0.5">The member's code is shown in their booking confirmation</p>
          </div>

          {!canCheckIn && openTime && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Check-in opens at <strong>{openTimeStr}</strong> — 1 hour before the session starts</span>
            </div>
          )}

          <form onSubmit={handleCodeSubmit} className="flex gap-3">
            <input
              ref={codeRef}
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeStatus("idle"); setLastMember(null); }}
              placeholder={canCheckIn ? "e.g. ABC-12345" : `Opens at ${openTimeStr}`}
              disabled={!canCheckIn}
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-mono tracking-widest uppercase focus:outline-none focus:border-[#050040] transition placeholder:normal-case placeholder:tracking-normal disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={!canCheckIn || !codeInput.trim() || codeStatus === "loading"}
              className="px-6 py-3 bg-[#050040] text-white text-sm font-semibold rounded-xl hover:bg-indigo-900 transition disabled:opacity-40 whitespace-nowrap">
              {codeStatus === "loading" ? "Checking…" : "Check In"}
            </button>
          </form>

          {/* Feedback */}
          {codeStatus === "success" && lastMember && (
            <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0">
                <span className="text-green-800 font-bold text-sm">{(lastMember.users?.name ?? lastMember.guest_email?.split("@")[0] ?? "?")[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800">{lastMember.users?.name ?? lastMember.guest_email?.split("@")[0] ?? "Member"} — checked in!</p>
                <p className="text-xs text-green-600">{lastMember.users?.email}</p>
              </div>
              <Ic.Check className="w-6 h-6 text-green-600 flex-shrink-0" />
            </div>
          )}

          {codeStatus === "already" && lastMember && (
            <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                <span className="text-amber-800 font-bold text-sm">{(lastMember.users?.name ?? lastMember.guest_email?.split("@")[0] ?? "?")[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">{lastMember.users?.name ?? lastMember.guest_email?.split("@")[0] ?? "Member"} is already checked in</p>
                <p className="text-xs text-amber-600">This booking was already marked present</p>
              </div>
              <button onClick={resetCode} className="text-xs text-amber-700 font-semibold underline whitespace-nowrap">OK</button>
            </div>
          )}

          {codeStatus === "invalid" && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700">Invalid code</p>
                <p className="text-xs text-red-500">No booking found for this session with that code</p>
              </div>
              <button onClick={resetCode} className="text-xs text-red-700 font-semibold underline whitespace-nowrap">Try again</button>
            </div>
          )}
        </div>
      )}

      {/* Attendee list */}
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
                const noShow  = !checked && isNoShow(b);
                return (
                  <div key={b.id} className={`flex items-center gap-4 px-5 py-3 transition ${checked ? "bg-green-50/40" : noShow ? "bg-red-50/30" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${checked ? "bg-green-100" : noShow ? "bg-red-100" : "bg-gray-100"}`}>
                      <span className={`text-sm font-bold ${checked ? "text-green-700" : noShow ? "text-red-400" : "text-gray-500"}`}>
                        {(b.users?.name ?? b.guest_email?.split("@")[0] ?? "?")[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${noShow ? "text-gray-400" : "text-gray-900"}`}>{b.users?.name ?? b.guest_email?.split("@")[0] ?? "Member"}</p>
                      <p className="text-xs text-gray-400 truncate">{b.users?.email}</p>
                    </div>
                    {checked ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                          <Ic.Check className="w-3.5 h-3.5" />
                          Present
                        </span>
                        <button onClick={() => undoCheckIn(b.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50">
                          Undo
                        </button>
                      </div>
                    ) : noShow ? (
                      <span className="text-xs font-semibold text-red-400 flex-shrink-0">No show</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-300">Not yet</span>
                        {PARTNER_CANCELLABLE.includes(b.status ?? "") && (
                          <button
                            onClick={() => handlePartnerCancel(b)}
                            disabled={cancellingId === b.id}
                            className="text-xs text-red-400 hover:text-red-600 font-medium transition disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-red-50"
                          >
                            {cancellingId === b.id ? "…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    )}
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

// ─── Experiences ──────────────────────────────────────────────────────────────

type Experience = {
  id: string;
  gym_id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  meeting_point: string | null;
  transport_info: string | null;
  price_kes: number;
  max_capacity: number;
  spots_left: number;
  includes: string[];
  itinerary: { time: string; activity: string; detail: string }[];
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
};

const EXP_EMPTY = {
  name: "",
  tagline: "",
  description: "",
  date: "",
  start_time: "",
  end_time: "",
  meeting_point: "",
  transport_info: "",
  price_kes: "" as string | number,
  max_capacity: 20 as number,
  image_url: null as string | null,
  category: "",
  is_active: true,
  includes: [""] as string[],
  itinerary: [{ time: "", activity: "", detail: "" }] as { time: string; activity: string; detail: string }[],
  cancellation_cutoff_hours: null as number | null,
  deposit_pct: null as number | null,
  no_show_grace_mins: null as number | null,
};

type GymTrainer = {
  id: string; gym_id: string; full_name: string; email: string; phone: string | null; status: string;
};

const EMPTY_EDIT_FORM = { full_name: "", email: "", phone: "", gym_id: "" };

function TrainersSection({ gym, gyms }: { gym: Gym; gyms: Gym[] }) {
  const [trainers, setTrainers] = useState<GymTrainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<null | "invite" | "manual">(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => { loadTrainers(); }, [gym.id]);

  async function loadTrainers() {
    setLoading(true);
    const { data } = await supabase
      .from("gym_trainers")
      .select("id, gym_id, full_name, email, phone, status")
      .eq("gym_id", gym.id)
      .order("created_at", { ascending: false });
    setTrainers(data ?? []);
    setLoading(false);
  }

  function resetAddForm() {
    setName(""); setEmail(""); setPhone(""); setPassword(""); setAddMode(null); setError("");
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: partnerRow } = await supabase.auth.getUser();
    const { data: partner } = await supabase
      .from("partners").select("id").eq("user_id", partnerRow.user?.id).maybeSingle();

    const { data: newTrainer, error: insertError } = await supabase
      .from("gym_trainers")
      .insert({
        gym_id: gym.id, full_name: name.trim(), email: email.trim().toLowerCase(),
        phone: phone.trim() || null, invited_by: partner?.id ?? null,
      })
      .select("id, invite_token")
      .single();

    if (insertError) {
      setError(insertError.message || "Could not invite this trainer.");
      setSaving(false);
      return;
    }

    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
    await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: "trainer_invite",
        data: {
          trainerName: name.trim(),
          gymName: gym.name,
          signupUrl: `${window.location.origin}/trainer-signup?token=${newTrainer.invite_token}`,
        },
      }),
    }).catch(() => {});

    setSaving(false);
    resetAddForm();
    loadTrainers();
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/partner/create-trainer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      body: JSON.stringify({ gymId: gym.id, fullName: name, email, phone, password }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error || "Could not add this trainer.");
      setSaving(false);
      return;
    }

    setSaving(false);
    resetAddForm();
    loadTrainers();
  }

  function openEdit(t: GymTrainer) {
    setEditingId(t.id);
    setEditForm({ full_name: t.full_name, email: t.email, phone: t.phone ?? "", gym_id: t.gym_id });
    setEditError("");
    setAddMode(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    setEditError("");

    const { error: updateError } = await supabase
      .from("gym_trainers")
      .update({
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim() || null,
        gym_id: editForm.gym_id,
      })
      .eq("id", editingId);

    setEditSaving(false);
    if (updateError) { setEditError(updateError.message || "Could not save changes."); return; }

    setEditingId(null);
    loadTrainers();
  }

  async function toggleStatus(trainer: GymTrainer) {
    const next = trainer.status === "suspended" ? "active" : "suspended";
    setTrainers(prev => prev.map(t => t.id === trainer.id ? { ...t, status: next } : t));
    await supabase.from("gym_trainers").update({ status: next }).eq("id", trainer.id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Trainers</h2>
          <p className="text-sm text-gray-500 mt-1">Add your employed trainers to log in and manage their assigned classes.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingId(null); setAddMode(m => m === "manual" ? null : "manual"); }}
            className="border border-gray-200 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-50 transition"
          >
            {addMode === "manual" ? "Cancel" : "+ Add manually"}
          </button>
          <button
            onClick={() => { setEditingId(null); setAddMode(m => m === "invite" ? null : "invite"); }}
            className="bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-900 transition"
          >
            {addMode === "invite" ? "Cancel" : "+ Invite by email"}
          </button>
        </div>
      </div>

      {addMode === "invite" && (
        <form onSubmit={handleInvite} className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-4">
          <p className="text-xs text-gray-500 -mt-1">They'll get an email with a link to set their own password.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Doe" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone (optional)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+254 7XX XXX XXX" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="trainer@email.com" className={inp} />
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
          <button type="submit" disabled={saving}
            className="bg-[#050040] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40">
            {saving ? "Sending invite…" : "Send invite"}
          </button>
        </form>
      )}

      {addMode === "manual" && (
        <form onSubmit={handleManualAdd} className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-4">
          <p className="text-xs text-gray-500 -mt-1">Sets up their login right away — good for when they're on-site or don't have email handy.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Doe" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone (optional)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+254 7XX XXX XXX" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="trainer@email.com" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters" className={inp} />
            </div>
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
          <button type="submit" disabled={saving}
            className="bg-[#050040] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40">
            {saving ? "Adding…" : "Add trainer"}
          </button>
        </form>
      )}

      {editingId && (
        <form onSubmit={saveEdit} className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Edit trainer</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name</label>
              <input type="text" required value={editForm.full_name}
                onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone</label>
              <input type="tel" value={editForm.phone}
                onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input type="email" required value={editForm.email}
                onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} className={inp} />
            </div>
            {gyms.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Venue</label>
                <select value={editForm.gym_id} onChange={e => setEditForm(p => ({ ...p, gym_id: e.target.value }))} className={inp}>
                  {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {editError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{editError}</div>}
          <div className="flex gap-3">
            <button type="submit" disabled={editSaving}
              className="bg-[#050040] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40">
              {editSaving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditingId(null)}
              className="text-sm text-gray-500 hover:text-gray-800 transition font-medium">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : trainers.length === 0 ? (
        <p className="text-sm text-gray-500">No trainers yet — add your first one above.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
          {trainers.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{t.full_name}</p>
                <p className="text-xs text-gray-500">{t.email}{t.phone ? ` · ${t.phone}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  t.status === "active" ? "bg-green-100 text-green-700"
                  : t.status === "invited" ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500"
                }`}>
                  {t.status}
                </span>
                <button onClick={() => openEdit(t)} className="text-xs text-gray-400 hover:text-gray-700 transition">
                  Edit
                </button>
                {t.status !== "invited" && (
                  <button onClick={() => toggleStatus(t)} className="text-xs text-gray-400 hover:text-gray-700 transition">
                    {t.status === "suspended" ? "Reactivate" : "Suspend"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperiencesSection({ gym }: { gym: Gym; onRefresh: () => void }) {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ ...EXP_EMPTY });
  const [isRecurring,  setIsRecurring]  = useState(false);
  const [recurDays,    setRecurDays]    = useState<number[]>([]);
  const [recurEndDate, setRecurEndDate] = useState("");
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[] | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [filter,      setFilter]      = useState<"upcoming" | "past" | "all">("upcoming");
  const fileRef = useRef<HTMLInputElement>(null);
  const t = todayStr();

  useEffect(() => { loadExperiences(); }, [gym.id]);

  async function loadExperiences() {
    setLoading(true);
    const { data } = await supabase
      .from("experiences")
      .select("*")
      .eq("gym_id", gym.id)
      .order("date", { ascending: false });
    setExperiences((data || []) as Experience[]);
    setLoading(false);
  }

  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const resetRecurring = () => { setIsRecurring(false); setRecurDays([]); setRecurEndDate(""); };
  const toggleRecurDay = (d: number) => setRecurDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);

  function openNew() {
    setForm({ ...EXP_EMPTY, includes: [""], itinerary: [{ time: "", activity: "", detail: "" }] });
    setEditId(null);
    setEditGroupIds(null);
    resetRecurring();
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(e: Experience) {
    setForm({
      name: e.name,
      tagline: e.tagline ?? "",
      description: e.description ?? "",
      date: e.date,
      start_time: e.start_time,
      end_time: e.end_time ?? "",
      meeting_point: e.meeting_point ?? "",
      transport_info: e.transport_info ?? "",
      price_kes: e.price_kes,
      max_capacity: e.max_capacity,
      image_url: e.image_url,
      category: e.category ?? "",
      is_active: e.is_active,
      includes: e.includes.length ? e.includes : [""],
      itinerary: e.itinerary.length ? e.itinerary : [{ time: "", activity: "", detail: "" }],
      cancellation_cutoff_hours: e.cancellation_cutoff_hours ?? null,
      deposit_pct: e.deposit_pct ?? null,
      no_show_grace_mins: e.no_show_grace_mins ?? null,
    });
    setEditId(e.id);
    setEditGroupIds(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Experiences have no linking column between recurring occurrences —
  // grouped client-side the same way the sessions section already does,
  // by name + start_time + category.
  function openEditGroup(rep: Experience, all: Experience[]) {
    setForm({
      name: rep.name,
      tagline: rep.tagline ?? "",
      description: rep.description ?? "",
      date: rep.date,
      start_time: rep.start_time,
      end_time: rep.end_time ?? "",
      meeting_point: rep.meeting_point ?? "",
      transport_info: rep.transport_info ?? "",
      price_kes: rep.price_kes,
      max_capacity: rep.max_capacity,
      image_url: rep.image_url,
      category: rep.category ?? "",
      is_active: rep.is_active,
      includes: rep.includes.length ? rep.includes : [""],
      itinerary: rep.itinerary.length ? rep.itinerary : [{ time: "", activity: "", detail: "" }],
      cancellation_cutoff_hours: rep.cancellation_cutoff_hours ?? null,
      deposit_pct: rep.deposit_pct ?? null,
      no_show_grace_mins: rep.no_show_grace_mins ?? null,
    });
    setEditId(null);
    setEditGroupIds(all.map(x => x.id));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePhotoUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, "fitpass-images", `experiences/exp-${gym.id}`);
      setF("image_url", url);
    } catch (err: any) { alert("Upload failed: " + err.message); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.name || !form.date || !form.start_time) {
      alert("Please fill in name, date, and start time.");
      return;
    }
    if (!editId && isRecurring) {
      if (recurDays.length === 0) { alert("Select at least one day for recurring experiences."); return; }
      if (!recurEndDate) { alert("Please set an end date for recurring experiences."); return; }
      if (recurEndDate <= form.date) { alert("End date must be after the start date."); return; }
    }
    setSaving(true);
    const cleanIncludes = form.includes.map(s => s.trim()).filter(Boolean);
    const cleanItinerary = form.itinerary.filter(r => r.time.trim() || r.activity.trim());
    const base = {
      gym_id: gym.id,
      name: form.name.trim(),
      tagline: form.tagline?.trim() || null,
      description: form.description?.trim() || null,
      start_time: form.start_time,
      end_time: (form.end_time as string)?.trim() || null,
      meeting_point: form.meeting_point?.trim() || null,
      transport_info: form.transport_info?.trim() || null,
      price_kes: Number(form.price_kes) || 0,
      max_capacity: Number(form.max_capacity) || 20,
      spots_left: Number(form.max_capacity) || 20,
      includes: cleanIncludes,
      itinerary: cleanItinerary,
      image_url: form.image_url || null,
      category: form.category?.trim() || null,
      is_active: form.is_active,
      cancellation_cutoff_hours: form.cancellation_cutoff_hours ?? null,
      deposit_pct: form.deposit_pct ?? null,
      no_show_grace_mins: form.no_show_grace_mins ?? null,
    };

    if (editGroupIds) {
      // date and is_active always stay per-occurrence, same convention the
      // sessions section's "edit series" action uses.
      const { spots_left: _s, is_active: _a, ...seriesPayload } = base;
      await supabase.from("experiences").update(seriesPayload).in("id", editGroupIds);
    } else if (editId) {
      const { spots_left: _s, ...updatePayload } = { ...base, date: form.date };
      await supabase.from("experiences").update(updatePayload).eq("id", editId);
    } else if (isRecurring) {
      const dates = generateRecurringDates(form.date, recurEndDate, recurDays);
      await supabase.from("experiences").insert(dates.map(date => ({ ...base, date })));
    } else {
      await supabase.from("experiences").insert({ ...base, date: form.date });
    }
    setSaving(false);
    setShowForm(false);
    setEditGroupIds(null);
    resetRecurring();
    await loadExperiences();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this experience?")) return;
    await supabase.from("experiences").delete().eq("id", id);
    await loadExperiences();
  }

  async function handleDeleteSeries(ids: string[], name: string) {
    if (!confirm(`Delete all ${ids.length} occurrences of "${name}"?`)) return;
    await supabase.from("experiences").delete().in("id", ids);
    await loadExperiences();
  }

  async function toggleActive(e: Experience) {
    await supabase.from("experiences").update({ is_active: !e.is_active }).eq("id", e.id);
    await loadExperiences();
  }

  function addInclude() { setF("includes", [...form.includes, ""]); }
  function removeInclude(i: number) { setF("includes", form.includes.filter((_, idx) => idx !== i)); }
  function setInclude(i: number, v: string) {
    const next = [...form.includes]; next[i] = v; setF("includes", next);
  }

  function addItinerary() { setF("itinerary", [...form.itinerary, { time: "", activity: "", detail: "" }]); }
  function removeItinerary(i: number) { setF("itinerary", form.itinerary.filter((_, idx) => idx !== i)); }
  function setItinerary(i: number, k: string, v: string) {
    const next = form.itinerary.map((r, idx) => idx === i ? { ...r, [k]: v } : r);
    setF("itinerary", next);
  }

  const filtered = experiences.filter(e =>
    filter === "upcoming" ? e.date >= t :
    filter === "past"     ? e.date < t  : true
  );

  // Experiences have no linking column between recurring occurrences —
  // grouped the same way the sessions section already does, by
  // name + start_time + category, so the "Edit series" button can find
  // every sibling for a given card.
  const seriesGroups = new Map<string, Experience[]>();
  for (const e of experiences) {
    const key = `${e.name}||${e.start_time}||${e.category ?? ""}`;
    if (!seriesGroups.has(key)) seriesGroups.set(key, []);
    seriesGroups.get(key)!.push(e);
  }
  const seriesFor = (e: Experience) => seriesGroups.get(`${e.name}||${e.start_time}||${e.category ?? ""}`) ?? [e];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Experiences</h1>
          <p className="text-sm text-gray-400 mt-0.5">Full-day retreats, hikes, and multi-activity events</p>
        </div>
        {!showForm && (
          <button onClick={openNew}
            className="flex items-center gap-2 bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-900 transition">
            <Ic.Plus className="w-4 h-4" /> New Experience
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">
                {editGroupIds ? "Edit Recurring Series" : editId ? "Edit Experience" : "New Experience"}
              </h2>
              {editGroupIds && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Changes apply to all {editGroupIds.length} occurrences. Date and visibility always stay per-occurrence.
                </p>
              )}
            </div>
            <button onClick={() => { setShowForm(false); setEditGroupIds(null); resetRecurring(); }} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
          </div>

          {/* Cover image */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cover Photo</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            {form.image_url ? (
              <div className="relative w-full aspect-[16/7] rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => fileRef.current?.click()}>
                <img src={form.image_url} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Change photo</span>
                </div>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition">
                {uploading
                  ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <>
                      <Ic.Upload className="w-6 h-6" />
                      <span className="text-sm">Upload cover photo</span>
                      <span className="text-xs text-gray-300">16:9 recommended</span>
                    </>
                }
              </button>
            )}
          </div>

          {/* Name + tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name *</label>
              <input className={inp} placeholder="e.g. MT Longonot Hike & Yoga Retreat" value={form.name}
                onChange={e => setF("name", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tagline</label>
              <input className={inp} placeholder='e.g. "The Journey Inward"' value={form.tagline ?? ""}
                onChange={e => setF("tagline", e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea className={inp + " resize-none"} rows={3} placeholder="What is this experience about?"
              value={form.description ?? ""} onChange={e => setF("description", e.target.value)} />
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {!editGroupIds && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {isRecurring ? "Start Date *" : "Date *"}
                </label>
                <input type="date" className={inp} value={form.date} onChange={e => setF("date", e.target.value)} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Time *</label>
              <input type="time" className={inp} value={form.start_time} onChange={e => setF("start_time", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">End Time</label>
              <input type="time" className={inp} value={form.end_time ?? ""} onChange={e => setF("end_time", e.target.value)} />
            </div>
          </div>

          {/* Recurring toggle — only on new experiences */}
          {!editId && !editGroupIds && (
            <div>
              <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                <div
                  onClick={() => { setIsRecurring(p => !p); setRecurDays([]); setRecurEndDate(""); }}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${isRecurring ? "bg-[#050040]" : "bg-gray-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? "translate-x-5" : "translate-x-0"}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">Recurring experience</span>
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
                      {generateRecurringDates(form.date, recurEndDate, recurDays).length} experiences will be created
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price + capacity + category */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price (KES) *</label>
              <input type="number" className={inp} placeholder="0" value={form.price_kes}
                onChange={e => setF("price_kes", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Max Capacity</label>
              <input type="number" className={inp} placeholder="20" value={form.max_capacity}
                onChange={e => setF("max_capacity", Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
              <input className={inp} placeholder="e.g. Hiking, Wellness, Yoga" value={form.category ?? ""}
                onChange={e => setF("category", e.target.value)} />
            </div>
          </div>

          {/* Meeting point + transport */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meeting Point</label>
              <input className={inp} placeholder="e.g. Shell CBD, Kenyatta Ave" value={form.meeting_point ?? ""}
                onChange={e => setF("meeting_point", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Transport Info</label>
              <input className={inp} placeholder="e.g. 26-seater bus, departure 5:30 AM" value={form.transport_info ?? ""}
                onChange={e => setF("transport_info", e.target.value)} />
            </div>
          </div>

          {/* Cancellation policy */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Cancellation Policy</p>
              <p className="text-xs text-gray-400 mb-4">Leave at "Venue default" to inherit your venue policy. Override only for this experience.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Free cancellation window</label>
              <div className="flex flex-wrap gap-2">
                {CUTOFF_OPTIONS.map(h => {
                  const label  = h === null ? "Venue default" : h === 0 ? "None" : `${h}h`;
                  const active = form.cancellation_cutoff_hours === (h ?? null);
                  return (
                    <button key={String(h)} type="button"
                      onClick={() => {
                        setF("cancellation_cutoff_hours", h ?? null);
                        if (h === 0) setF("deposit_pct", null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            {form.cancellation_cutoff_hours !== 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Deposit required</label>
              <div className="flex flex-wrap gap-2">
                {DEPOSIT_OPTIONS.map(pct => {
                  const label  = pct === null ? "Venue default" : `${pct}%`;
                  const active = form.deposit_pct === (pct ?? null);
                  return (
                    <button key={String(pct)} type="button"
                      onClick={() => setF("deposit_pct", pct ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">No-show grace period</label>
              <div className="flex flex-wrap gap-2">
                {GRACE_OPTIONS.map(m => {
                  const label  = m === null ? "Venue default" : m === 0 ? "Immediate" : `${m} min`;
                  const active = form.no_show_grace_mins === (m ?? null);
                  return (
                    <button key={String(m)} type="button"
                      onClick={() => setF("no_show_grace_mins", m ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Includes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What&apos;s Included</label>
            <div className="space-y-2">
              {form.includes.map((inc, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inp + " flex-1"} placeholder="e.g. Return Transport" value={inc}
                    onChange={e => setInclude(i, e.target.value)} />
                  {form.includes.length > 1 && (
                    <button onClick={() => removeInclude(i)}
                      className="text-gray-400 hover:text-red-500 transition px-2">
                      <Ic.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addInclude}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#050040] hover:opacity-70 transition mt-1">
                <Ic.Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
          </div>

          {/* Itinerary */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Itinerary</label>
            <div className="space-y-2">
              {form.itinerary.map((row, i) => (
                <div key={i} className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center">
                  <input className={inp} placeholder="5:30 AM" value={row.time}
                    onChange={e => setItinerary(i, "time", e.target.value)} />
                  <input className={inp} placeholder="Activity" value={row.activity}
                    onChange={e => setItinerary(i, "activity", e.target.value)} />
                  <input className={inp} placeholder="Details (optional)" value={row.detail}
                    onChange={e => setItinerary(i, "detail", e.target.value)} />
                  {form.itinerary.length > 1 && (
                    <button onClick={() => removeItinerary(i)}
                      className="text-gray-400 hover:text-red-500 transition">
                      <Ic.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addItinerary}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#050040] hover:opacity-70 transition mt-1">
                <Ic.Plus className="w-3.5 h-3.5" /> Add step
              </button>
            </div>
          </div>

          {/* Active toggle */}
          {!editGroupIds && (
            <div className="flex items-center gap-3">
              <button onClick={() => setF("is_active", !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-[#050040]" : "bg-gray-200"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-gray-600">Visible to members</span>
            </div>
          )}

          {/* Save */}
          <div className="flex justify-end pt-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#050040] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-900 transition disabled:opacity-50">
              {saving ? "Saving…" : editGroupIds ? `Update all ${editGroupIds.length} occurrences` : editId ? "Save Changes" : isRecurring ? "Create Recurring Experiences" : "Create Experience"}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {!showForm && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(["upcoming", "past", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filter === f ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-sm text-gray-400">
              {filter === "upcoming" ? "No upcoming experiences. Create one above!" : "No experiences found."}
            </div>
          ) : filtered.map(e => (
            <div key={e.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex gap-4 p-4">
                {e.image_url ? (
                  <img src={e.image_url} className="w-24 h-20 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-24 h-20 bg-gradient-to-br from-[#050040] to-indigo-400 rounded-xl flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{e.name}</p>
                        {seriesFor(e).length > 1 && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-medium">
                            Recurring ×{seriesFor(e).length}
                          </span>
                        )}
                      </div>
                      {e.tagline && <p className="text-xs text-gray-400 italic mt-0.5">{e.tagline}</p>}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      e.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {e.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <span className="text-xs text-gray-500">{fmtDate(e.date)}</span>
                    <span className="text-xs text-gray-500">{e.start_time.slice(0, 5)}{e.end_time ? ` – ${e.end_time.slice(0, 5)}` : ""}</span>
                    <span className="text-xs font-semibold text-gray-900">{fmtKes(Number(e.price_kes))}</span>
                    <span className="text-xs text-gray-500">{e.spots_left}/{e.max_capacity} spots</span>
                    {e.meeting_point && <span className="text-xs text-gray-400 truncate max-w-[180px]">{e.meeting_point}</span>}
                  </div>
                  {e.includes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {e.includes.slice(0, 4).map((inc, i) => (
                        <span key={i} className="bg-indigo-50 text-indigo-600 text-[10px] font-medium px-2 py-0.5 rounded-full">{inc}</span>
                      ))}
                      {e.includes.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{e.includes.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between">
                <button onClick={() => toggleActive(e)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {e.is_active ? "Hide" : "Make active"}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => openEdit(e)}
                    className="text-xs font-semibold text-[#050040] hover:opacity-70 transition">Edit</button>
                  {seriesFor(e).length > 1 && (
                    <button onClick={() => openEditGroup(e, seriesFor(e))}
                      className="text-xs font-semibold text-[#050040] hover:opacity-70 transition">Edit series</button>
                  )}
                  <button onClick={() => handleDelete(e.id)}
                    className="text-xs font-semibold text-red-500 hover:opacity-70 transition">Delete</button>
                  {seriesFor(e).length > 1 && (
                    <button onClick={() => handleDeleteSeries(seriesFor(e).map(x => x.id), e.name)}
                      className="text-xs font-semibold text-red-500 hover:opacity-70 transition">Delete series</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Programmes ───────────────────────────────────────────────────────────────

type Programme = {
  id: string;
  gym_id: string;
  instructor_id: string | null;
  intro_session_id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  max_participants: number;
  programme_weeks: number;
  programme_price_kes: number;
  deposit_pct: number;
  instalment_frequency_weeks: number;
  image_url: string | null;
  slug: string | null;
  is_active: boolean;
  is_draft: boolean;
  cancellation_cutoff_hours: number | null;
  no_show_grace_mins: number | null;
  created_at: string;
};

type ProgSessionOption = { id: string; name: string; time: string; category: string | null; recurring?: boolean };
type ProgTrainerOption = { id: string; full_name: string };

const PROG_EMPTY = {
  title: "",
  description: "",
  category: "",
  duration_minutes: "60",
  max_participants: "20",
  programme_weeks: "12",
  programme_price_kes: "",
  deposit_pct: "30",
  instalment_frequency_weeks: "4",
  intro_session_id: "",
  instructor_id: "",
  image_url: "",
  is_active: true,
  is_draft: false,
  cancellation_cutoff_hours: null as number | null,
  no_show_grace_mins: null as number | null,
};

const PROG_BOOKING_BASE = "https://activecitypass.com/gym-programmes/";

function ProgrammesSection({ gym }: { gym: Gym }) {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [sessionOptions, setSessionOptions] = useState<ProgSessionOption[]>([]);
  const [trainerOptions, setTrainerOptions] = useState<ProgTrainerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...PROG_EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [gym.id]);

  async function load() {
    setLoading(true);
    const [{ data: progs }, { data: sessions }, { data: trainers }] = await Promise.all([
      supabase.from("gym_programmes").select("*").eq("gym_id", gym.id).order("created_at", { ascending: false }),
      supabase.from("sessions").select("id, name, time, category, recurring").eq("gym_id", gym.id).order("name"),
      supabase.from("gym_trainers").select("id, full_name").eq("gym_id", gym.id).eq("status", "active"),
    ]);
    setProgrammes((progs as any) || []);
    setSessionOptions((sessions as any) || []);
    setTrainerOptions((trainers as any) || []);
    setLoading(false);
  }

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setForm({ ...PROG_EMPTY });
    setEditId(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(p: Programme) {
    setForm({
      title: p.title, description: p.description ?? "", category: p.category ?? "",
      duration_minutes: String(p.duration_minutes), max_participants: String(p.max_participants),
      programme_weeks: String(p.programme_weeks), programme_price_kes: String(p.programme_price_kes),
      deposit_pct: String(p.deposit_pct), instalment_frequency_weeks: String(p.instalment_frequency_weeks),
      intro_session_id: p.intro_session_id, instructor_id: p.instructor_id ?? "", image_url: p.image_url ?? "",
      is_active: p.is_active, is_draft: p.is_draft,
      cancellation_cutoff_hours: p.cancellation_cutoff_hours ?? null,
      no_show_grace_mins: p.no_show_grace_mins ?? null,
    });
    setEditId(p.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePhotoUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, "fitpass-images", `gym-programmes/prog-${gym.id}`);
      setF("image_url", url);
    } catch (err: any) { alert("Upload failed: " + err.message); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!form.title.trim()) { alert("Please enter a title."); return; }
    if (!form.intro_session_id) { alert("Please choose an intro session — an existing class customers book as a trial before committing to the programme."); return; }
    if (!form.programme_weeks || !form.programme_price_kes) { alert("Please set the programme length and price."); return; }
    setSaving(true);

    const payload: any = {
      gym_id: gym.id,
      instructor_id: form.instructor_id || null,
      intro_session_id: form.intro_session_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      max_participants: parseInt(form.max_participants) || 20,
      programme_weeks: parseInt(form.programme_weeks),
      programme_price_kes: parseFloat(form.programme_price_kes),
      deposit_pct: parseInt(form.deposit_pct) || 30,
      instalment_frequency_weeks: parseInt(form.instalment_frequency_weeks) || 4,
      image_url: form.image_url || null,
      is_active: form.is_active,
      is_draft: form.is_draft,
      cancellation_cutoff_hours: form.cancellation_cutoff_hours,
      no_show_grace_mins: form.no_show_grace_mins,
    };

    try {
      if (editId) {
        const { error } = await supabase.from("gym_programmes").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gym_programmes").insert(payload);
        if (error) throw error;
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      alert(e.message || "Failed to save programme");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Programme) {
    setProgrammes(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    const { error } = await supabase.from("gym_programmes").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) {
      setProgrammes(prev => prev.map(x => x.id === p.id ? { ...x, is_active: p.is_active } : x));
      alert("Could not update programme visibility");
    }
  }

  async function handleDelete(p: Programme) {
    if (!confirm(`Delete "${p.title}"? Existing enrollments are kept but the programme will no longer be bookable.`)) return;
    const { error } = await supabase.from("gym_programmes").delete().eq("id", p.id);
    if (error) { alert("Could not delete programme"); return; }
    setProgrammes(prev => prev.filter(x => x.id !== p.id));
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(PROG_BOOKING_BASE + slug);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Multi-week courses with deposits and instalments</p>
        </div>
        {!showForm && (
          <button onClick={openNew}
            className="flex items-center gap-2 bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-900 transition">
            <Ic.Plus className="w-4 h-4" /> New Programme
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900 text-lg">{editId ? "Edit Programme" : "New Programme"}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
          </div>

          {/* Cover image */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Programme Photo</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            {form.image_url ? (
              <div className="relative w-full aspect-[16/7] rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => fileRef.current?.click()}>
                <img src={form.image_url} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Change photo</span>
                </div>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition">
                {uploading
                  ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <>
                      <Ic.Upload className="w-6 h-6" />
                      <span className="text-sm">Upload programme photo</span>
                      <span className="text-xs text-gray-300">16:9 recommended</span>
                    </>
                }
              </button>
            )}
          </div>

          {/* Title + category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title *</label>
              <input className={inp} placeholder="e.g. Martial Arts Fundamentals" value={form.title}
                onChange={e => setF("title", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
              <input className={inp} placeholder="e.g. Martial Arts" value={form.category}
                onChange={e => setF("category", e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea className={inp + " resize-none"} rows={3} placeholder="Describe what the programme covers…"
              value={form.description} onChange={e => setF("description", e.target.value)} />
          </div>

          {/* Intro session */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Intro Session *</label>
            <p className="text-xs text-gray-400 mb-2">An existing class at this venue customers book as a trial before committing to the full programme.</p>
            {sessionOptions.length === 0 ? (
              <p className="text-xs text-gray-400">No sessions found for this venue — create one first from the Sessions tab.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sessionOptions.map(s => (
                  <button key={s.id} type="button" onClick={() => setF("intro_session_id", s.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      form.intro_session_id === s.id ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>
                    {s.name}{s.recurring ? " (recurring)" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Instructor */}
          {trainerOptions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Instructor (optional)</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setF("instructor_id", "")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                    !form.instructor_id ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}>Unassigned</button>
                {trainerOptions.map(t => (
                  <button key={t.id} type="button" onClick={() => setF("instructor_id", t.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                      form.instructor_id === t.id ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>{t.full_name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Weeks + duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Programme weeks *</label>
              <input type="number" className={inp} placeholder="12" value={form.programme_weeks}
                onChange={e => setF("programme_weeks", e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Session duration (min)</label>
              <input type="number" className={inp} placeholder="60" value={form.duration_minutes}
                onChange={e => setF("duration_minutes", e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
          </div>

          {/* Price + capacity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full programme price (KES) *</label>
              <input type="number" className={inp} placeholder="e.g. 24000" value={form.programme_price_kes}
                onChange={e => setF("programme_price_kes", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Max participants</label>
              <input type="number" className={inp} placeholder="20" value={form.max_participants}
                onChange={e => setF("max_participants", e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
          </div>

          {/* Deposit + instalment */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Deposit %</label>
              <input type="number" className={inp} placeholder="30" value={form.deposit_pct}
                onChange={e => setF("deposit_pct", e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Instalment every X weeks</label>
              <input type="number" className={inp} placeholder="4" value={form.instalment_frequency_weeks}
                onChange={e => setF("instalment_frequency_weeks", e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
          </div>

          {/* Visibility */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visibility</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-medium">Show to customers</p>
                <p className="text-xs text-gray-400">Toggle off to hide this programme without deleting it</p>
              </div>
              <button onClick={() => setF("is_active", !form.is_active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.is_active ? "bg-[#050040]" : "bg-gray-200"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-medium">Draft</p>
                <p className="text-xs text-gray-400">Keep as draft while you finish setting it up — hidden from customers even if active</p>
              </div>
              <button onClick={() => setF("is_draft", !form.is_draft)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${form.is_draft ? "bg-[#050040]" : "bg-gray-200"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_draft ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Cancellation policy */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Cancellation Policy</p>
              <p className="text-xs text-gray-400 mb-4">Leave at "Venue default" to inherit your venue policy. Override only for this programme.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Free cancellation window</label>
              <div className="flex flex-wrap gap-2">
                {CUTOFF_OPTIONS.map(h => {
                  const label = h === null ? "Venue default" : h === 0 ? "None" : `${h}h`;
                  const active = form.cancellation_cutoff_hours === (h ?? null);
                  return (
                    <button key={String(h)} type="button" onClick={() => setF("cancellation_cutoff_hours", h ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">No-show grace period</label>
              <div className="flex flex-wrap gap-2">
                {GRACE_OPTIONS.map(m => {
                  const label = m === null ? "Venue default" : m === 0 ? "Immediate" : `${m} min`;
                  const active = form.no_show_grace_mins === (m ?? null);
                  return (
                    <button key={String(m)} type="button" onClick={() => setF("no_show_grace_mins", m ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#050040] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-900 transition disabled:opacity-50">
              {saving ? "Saving…" : editId ? "Save Changes" : "Create Programme"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="space-y-3">
          {programmes.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
              <p className="text-sm text-gray-400 mb-4">No programmes yet. Create a multi-week programme — e.g. a 12-week martial arts course — with a deposit and instalment schedule.</p>
              <button onClick={openNew}
                className="bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-900 transition">
                Create first programme
              </button>
            </div>
          ) : programmes.map(p => (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex gap-4 p-4">
                {p.image_url ? (
                  <img src={p.image_url} className="w-24 h-20 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-24 h-20 bg-gradient-to-br from-[#050040] to-indigo-400 rounded-xl flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-medium">
                          {p.programme_weeks}W Programme
                        </span>
                        {p.is_draft && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-medium">Draft</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      p.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {p.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <span className="text-xs font-semibold text-gray-900">{fmtKes(Number(p.programme_price_kes))}</span>
                    <span className="text-xs text-gray-500">{p.deposit_pct}% deposit</span>
                    <span className="text-xs text-gray-500">every {p.instalment_frequency_weeks}w</span>
                  </div>
                  {p.slug && (
                    <button onClick={() => copyLink(p.slug!)}
                      className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:underline">
                      <Ic.Share className="w-3 h-3" />
                      <span className="truncate max-w-[220px]">activecitypass.com/gym-programmes/{p.slug}</span>
                      {copied === p.slug && <span className="text-green-600 font-semibold">Copied!</span>}
                    </button>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between">
                <button onClick={() => toggleActive(p)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {p.is_active ? "Hide" : "Make active"}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => openEdit(p)}
                    className="text-xs font-semibold text-[#050040] hover:opacity-70 transition">Edit</button>
                  <button onClick={() => handleDelete(p)}
                    className="text-xs font-semibold text-red-500 hover:opacity-70 transition">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
