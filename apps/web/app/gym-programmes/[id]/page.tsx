import type { Metadata } from "next";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import BookButton from "../../components/BookButton";

const anonSupabase = createAnonClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const col = UUID_RE.test(id) ? "id" : "slug";
  const { data: programme } = await anonSupabase
    .from("gym_programmes")
    .select("title, description, programme_price_kes, programme_weeks, image_url, gyms!gym_id(name)")
    .eq(col, id)
    .single();

  if (!programme) return { title: "Programme | Active CityPass" };

  const gym = Array.isArray(programme.gyms) ? programme.gyms[0] : (programme.gyms as any);
  const title = `${programme.title} — ${programme.programme_weeks}-Week Programme at ${gym?.name ?? "Active CityPass"}`;
  const description = programme.description ??
    `Join ${programme.title}, a ${programme.programme_weeks}-week programme at ${gym?.name ?? "this venue"}. From KES ${Number(programme.programme_price_kes).toLocaleString()}.`;

  return {
    title: `${title} | Active CityPass`,
    description,
    openGraph: {
      title: `${title} | Active CityPass`,
      description,
      url: `https://activecitypass.com/gym-programmes/${id}`,
      ...(programme.image_url ? { images: [{ url: programme.image_url, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Active CityPass`,
      description,
      ...(programme.image_url ? { images: [programme.image_url] } : {}),
    },
  };
}

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

type Props = { params: Promise<{ id: string }> };

export default async function GymProgrammeDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const col = UUID_RE.test(id) ? "id" : "slug";
  const { data: programme, error } = await supabase
    .from("gym_programmes")
    .select(`*, gyms!gym_id (id, name, area, contact_phone, contact_email, image_url), gym_trainers!instructor_id (full_name)`)
    .eq(col, id)
    .eq("is_active", true)
    .eq("is_draft", false)
    .single();

  if (error || !programme) return notFound();

  const gym = Array.isArray(programme.gyms) ? programme.gyms[0] : (programme.gyms as any);
  const instructor = Array.isArray(programme.gym_trainers) ? programme.gym_trainers[0] : (programme.gym_trainers as any);

  // The intro session may be a recurring class — resolve to the soonest
  // upcoming occurrence sharing its gym_id + name + time + category (same
  // grouping key the partner dashboard's "edit series" already uses), so the
  // programme never goes stale once its stored occurrence's date passes.
  const { data: storedIntro } = await supabase
    .from("sessions")
    .select("id, gym_id, name, date, time, duration_minutes, drop_in_price, category, recurring")
    .eq("id", programme.intro_session_id)
    .single();

  let introSession = storedIntro;
  const todayStr = new Date().toISOString().slice(0, 10);
  if (storedIntro?.recurring) {
    const { data: nextOccurrence } = await supabase
      .from("sessions")
      .select("id, gym_id, name, date, time, duration_minutes, drop_in_price, category, recurring")
      .eq("gym_id", storedIntro.gym_id)
      .eq("name", storedIntro.name)
      .eq("time", storedIntro.time)
      .eq("category", storedIntro.category)
      .eq("recurring", true)
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextOccurrence) introSession = nextOccurrence;
  }

  const enrollment = user
    ? (await supabase
        .from("gym_programme_enrollments")
        .select("id, status, trainer_intro_confirmed")
        .eq("programme_id", programme.id)
        .eq("user_id", user.id)
        .maybeSingle()).data
    : null;

  // Instalment schedule preview — same formula as buildInstalmentSchedule in api/gym-programme/route.ts
  const instalmentSchedule: { label: string; amount: number }[] = [];
  const total = Number(programme.programme_price_kes);
  const deposit = Math.round(total * programme.deposit_pct / 100);
  const remaining = total - deposit;
  const numInstalments = Math.max(1, Math.floor(programme.programme_weeks / programme.instalment_frequency_weeks));
  const base = Math.floor(remaining / numInstalments);
  instalmentSchedule.push({ label: "Deposit (due now)", amount: deposit });
  for (let i = 1; i <= numInstalments; i++) {
    instalmentSchedule.push({
      label: `Week ${i * programme.instalment_frequency_weeks}`,
      amount: i === numInstalments ? remaining - base * (numInstalments - 1) : base,
    });
  }

  const VenueCard = () => (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <Link href={`/venues/${gym.id}`} className="flex items-center gap-3 mb-4 group">
        {gym.image_url ? (
          <img src={gym.image_url} alt={gym.name} className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-100" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-[#050040] flex items-center justify-center text-white font-bold text-lg">
            {gym.name?.[0] ?? "?"}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900 group-hover:underline">{gym.name}</p>
          {gym.area && <p className="text-xs text-gray-500">{gym.area}</p>}
        </div>
      </Link>

      {instructor?.full_name && (
        <p className="text-xs text-gray-500 mb-4">Instructor: <span className="font-medium text-gray-700">{instructor.full_name}</span></p>
      )}

      <ProgrammeCTA programme={programme} introSession={introSession} enrollment={enrollment} />

      <Link href={`/venues/${gym.id}`} className="block text-center text-sm text-gray-500 hover:text-gray-800 hover:underline mt-3 transition-colors">
        View venue →
      </Link>
    </div>
  );

  return (
    <div className="w-full px-6 py-12 max-w-7xl mx-auto">
      <Link href={`/venues/${gym.id}`} className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to {gym.name}
      </Link>

      <div className="flex gap-10 items-start">
        <div className="flex-1 min-w-0">
          {programme.image_url && (
            <img src={programme.image_url} alt={programme.title} className="w-full h-64 object-cover rounded-2xl mb-6" />
          )}

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
              {programme.programme_weeks}-Week Programme
            </span>
            {programme.category && (
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{programme.category}</span>
            )}
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{programme.title}</h1>

          <div className="bg-gray-50 rounded-2xl p-5 mb-6 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Programme price</p>
              <p className="text-2xl font-bold text-gray-900">KES {total.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Duration</p>
              <p className="text-lg font-semibold text-gray-900">{programme.programme_weeks} weeks</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Instalments</p>
              <p className="text-lg font-semibold text-gray-900">Every {programme.instalment_frequency_weeks} weeks</p>
            </div>
          </div>

          {programme.description && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-2">About this programme</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{programme.description}</p>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Payment schedule</h2>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {instalmentSchedule.map((row, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className={i === 0 ? "font-medium text-gray-900" : "text-gray-600"}>{row.label}</span>
                  <span className={i === 0 ? "font-bold text-gray-900" : "text-gray-700"}>KES {row.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-1">Starts with an introductory session</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Before committing to the full programme, come try a class. This lets you assess fit before the programme begins.
                </p>
                {introSession && (
                  <p className="text-xs font-semibold text-amber-800 mt-2">
                    Next intro: {fmtDate(introSession.date)} at {fmtTime(introSession.time)}
                    {introSession.drop_in_price ? ` — KES ${Number(introSession.drop_in_price).toLocaleString()}` : " — Free"}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="md:hidden">
            <ProgrammeCTA programme={programme} introSession={introSession} enrollment={enrollment} />
          </div>
        </div>

        <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
          <div className="sticky top-[86px] space-y-4">
            <VenueCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Programme CTA — varies based on enrollment status ─────────────────────────
function ProgrammeCTA({
  programme,
  introSession,
  enrollment,
}: {
  programme: any;
  introSession: any;
  enrollment: { id: string; status: string; trainer_intro_confirmed: boolean } | null;
}) {
  if (!introSession) {
    return (
      <div className="w-full py-3 rounded-full bg-gray-100 text-gray-500 text-sm font-medium text-center">
        No upcoming intro sessions
      </div>
    );
  }

  if (!enrollment) {
    return (
      <BookButton
        type="session"
        itemId={introSession.id}
        price={Number(introSession.drop_in_price) || 0}
        label="Book Introductory Session"
        className="block w-full py-3 rounded-full bg-black text-white text-sm font-semibold text-center hover:bg-gray-800 transition-colors"
      />
    );
  }

  if (enrollment.status === "intro_booked" && !enrollment.trainer_intro_confirmed) {
    return (
      <div className="w-full py-3 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium text-center">
        Intro session booked — awaiting confirmation
      </div>
    );
  }

  if (enrollment.status === "intro_complete" || enrollment.trainer_intro_confirmed) {
    return (
      <Link
        href={`/gym-programmes/${programme.id}/enroll?enrollment_id=${enrollment.id}`}
        className="block w-full py-3 rounded-full bg-black text-white text-sm font-semibold text-center hover:bg-gray-800 transition-colors"
      >
        Join the Programme →
      </Link>
    );
  }

  if (enrollment.status === "programme_active") {
    return (
      <div className="w-full py-3 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-medium text-center">
        Programme active
      </div>
    );
  }

  return (
    <BookButton
      type="session"
      itemId={introSession.id}
      price={Number(introSession.drop_in_price) || 0}
      label="Book Introductory Session"
      className="block w-full py-3 rounded-full bg-black text-white text-sm font-semibold text-center hover:bg-gray-800 transition-colors"
    />
  );
}
