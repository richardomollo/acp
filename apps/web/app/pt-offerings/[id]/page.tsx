import type { Metadata } from "next";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import PtOfferingBookButton from "./PtOfferingBookButton";

const anonSupabase = createAnonClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data: offering } = await anonSupabase
    .from("pt_offerings")
    .select("title, description, price_kes, is_programme, programme_price_kes, personal_trainers!pt_id(full_name, professional_name, photo_url)")
    .eq("id", id)
    .single();

  if (!offering) return { title: "PT Session | Lana" };

  const pt = Array.isArray(offering.personal_trainers) ? offering.personal_trainers[0] : offering.personal_trainers as any;
  const name = pt?.professional_name ?? pt?.full_name ?? "Trainer";
  const title = offering.is_programme
    ? `${offering.title} — Programme with ${name}`
    : `${offering.title} with ${name}`;
  const description = offering.description ?? `Book a personal training session with ${name} on Lana in Nairobi.`;

  return {
    title: `${title} | Lana`,
    description,
    openGraph: {
      title: `${title} | Lana`,
      description,
      url: `https://activecitypass.com/pt-offerings/${id}`,
      ...(pt?.photo_url ? { images: [{ url: pt.photo_url, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Lana`,
      description,
      ...(pt?.photo_url ? { images: [pt.photo_url] } : {}),
    },
  };
}

const TYPE_LABELS: Record<string, string> = {
  "1-on-1": "1-on-1", group: "Group", online: "Online",
  outdoor: "Outdoor", "home-visit": "Home Visit", "drop-in": "Drop-in",
};
const TYPE_COLORS: Record<string, string> = {
  "1-on-1": "bg-purple-100 text-purple-700", group: "bg-blue-100 text-blue-700",
  online: "bg-cyan-100 text-cyan-700", outdoor: "bg-green-100 text-green-700",
  "home-visit": "bg-orange-100 text-orange-700", "drop-in": "bg-pink-100 text-pink-700",
};

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

type Props = { params: Promise<{ id: string }> };

export default async function PtOfferingDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: offering, error } = await supabase
    .from("pt_offerings")
    .select(`*, personal_trainers!pt_id (
      id, full_name, professional_name, photo_url, cover_url,
      bio, specialisations, training_locations, session_types,
      service_areas, years_of_experience, is_certified_verified, status
    )`)
    .eq("id", id)
    .eq("is_active", true)
    .eq("is_draft", false)
    .single();

  if (error || !offering) return notFound();

  const pt = Array.isArray(offering.personal_trainers)
    ? offering.personal_trainers[0]
    : (offering.personal_trainers as any);

  if (!pt || pt.status !== "approved") return notFound();

  const [reviewsRes, enrollmentRes] = await Promise.all([
    supabase.from("pt_reviews").select("rating").eq("pt_id", pt.id),
    // Check if logged-in user already has an enrollment for this programme
    user && offering.is_programme
      ? supabase
          .from("pt_programme_enrollments")
          .select("id, status, trainer_intro_confirmed")
          .eq("programme_id", id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reviews = reviewsRes.data ?? [];
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? Math.round((reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / reviewCount) * 10) / 10
    : null;

  const enrollment = (enrollmentRes as any)?.data ?? null;

  const displayName = pt.professional_name ?? pt.full_name;
  const heroImage = offering.image_url ?? pt.photo_url;
  const isProgramme = !!offering.is_programme;

  // Instalment schedule preview
  const instalmentSchedule: { label: string; amount: number }[] = [];
  if (isProgramme && offering.programme_price_kes && offering.programme_weeks && offering.instalment_frequency_weeks) {
    const total = Number(offering.programme_price_kes);
    const depositPct = offering.deposit_pct ?? 30;
    const deposit = Math.round(total * depositPct / 100);
    const remaining = total - deposit;
    const numInstalments = Math.floor(offering.programme_weeks / offering.instalment_frequency_weeks);
    const instalmentAmount = numInstalments > 0 ? Math.round(remaining / numInstalments) : remaining;
    instalmentSchedule.push({ label: "Deposit (due now)", amount: deposit });
    for (let i = 1; i <= numInstalments; i++) {
      instalmentSchedule.push({
        label: `Week ${i * offering.instalment_frequency_weeks}`,
        amount: i === numInstalments ? remaining - instalmentAmount * (numInstalments - 1) : instalmentAmount,
      });
    }
  }

  const TrainerCard = () => (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <Link href={`/trainers/${pt.id}`} className="flex items-center gap-3 mb-4 group">
        {pt.photo_url ? (
          <img src={pt.photo_url} alt={displayName} className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-100" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {getInitials(pt.full_name)}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-gray-900 group-hover:underline">{displayName}</p>
          <p className="text-xs text-gray-500">Personal Trainer</p>
          {avgRating !== null && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-yellow-400 text-xs">★</span>
              <span className="text-xs font-medium text-gray-700">{avgRating.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({reviewCount} review{reviewCount !== 1 ? "s" : ""})</span>
            </div>
          )}
        </div>
      </Link>

      {pt.is_certified_verified && (
        <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium mb-3 bg-blue-50 px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Certified &amp; Verified
        </div>
      )}

      {pt.specialisations?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {pt.specialisations.slice(0, 4).map((s: string) => (
            <span key={s} className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5">{s}</span>
          ))}
        </div>
      )}

      {pt.training_locations?.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-4">
          <svg className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{pt.training_locations.join(" · ")}</span>
        </div>
      )}

      {/* CTA — varies by programme status */}
      <ProgrammeCTA offering={offering} pt={pt} enrollment={enrollment} />

      <Link href={`/trainers/${pt.id}`} className="block text-center text-sm text-gray-500 hover:text-gray-800 hover:underline mt-3 transition-colors">
        View full trainer profile →
      </Link>
    </div>
  );

  return (
    <div className="w-full px-6 py-12 max-w-7xl mx-auto">
      <Link href="/sessions" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to sessions
      </Link>

      <div className="flex gap-10 items-start">
        {/* ── Left ── */}
        <div className="flex-1 min-w-0">

          {heroImage && (
            <img src={heroImage} alt={offering.title} className="w-full h-64 object-cover rounded-2xl mb-6" />
          )}

          {/* Badges */}
          <div className="flex items-center gap-2 mb-2">
            {isProgramme ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                {offering.programme_weeks}-Week Programme
              </span>
            ) : (
              offering.type && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${TYPE_COLORS[offering.type] ?? "bg-gray-100 text-gray-600"}`}>
                  {TYPE_LABELS[offering.type] ?? offering.type}
                </span>
              )
            )}
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Personal Training</span>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{offering.title}</h1>

          {/* ── PROGRAMME VARIANT ── */}
          {isProgramme ? (
            <>
              {/* Price summary */}
              <div className="bg-gray-50 rounded-2xl p-5 mb-6 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Programme price</p>
                  <p className="text-2xl font-bold text-gray-900">
                    KES {Number(offering.programme_price_kes ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                  <p className="text-lg font-semibold text-gray-900">{offering.programme_weeks} weeks</p>
                </div>
                {offering.instalment_frequency_weeks && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Instalments</p>
                    <p className="text-lg font-semibold text-gray-900">Every {offering.instalment_frequency_weeks} weeks</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {offering.description && (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-2">About this programme</h2>
                  <p className="text-sm text-gray-600 leading-relaxed">{offering.description}</p>
                </div>
              )}

              {/* Instalment breakdown */}
              {instalmentSchedule.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Payment schedule</h2>
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {instalmentSchedule.map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                        <span className={i === 0 ? "font-medium text-gray-900" : "text-gray-600"}>{row.label}</span>
                        <span className={i === 0 ? "font-bold text-gray-900" : "text-gray-700"}>
                          KES {row.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Intro session callout */}
              <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800 mb-1">Starts with an introductory session</p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Before committing to the full programme, book an introductory session with {displayName}.
                      This lets you both assess fit and set goals before the programme begins.
                    </p>
                    {offering.intro_price_kes != null && (
                      <p className="text-xs font-semibold text-amber-800 mt-2">
                        Intro session:{" "}
                        {Number(offering.intro_price_kes) === 0
                          ? "Free"
                          : `KES ${Number(offering.intro_price_kes).toLocaleString()}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile CTA */}
              <div className="md:hidden">
                <ProgrammeCTA offering={offering} pt={pt} enrollment={enrollment} />
              </div>
            </>
          ) : (
            /* ── SINGLE SESSION VARIANT ── */
            <>
              <div className="flex flex-wrap gap-6 mb-6">
                <div className="text-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                  <p className="font-medium text-gray-900">{formatDuration(offering.duration_minutes ?? 60)}</p>
                </div>
                {offering.max_participants > 1 && (
                  <div className="text-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Group size</p>
                    <p className="font-medium text-gray-900">Up to {offering.max_participants} people</p>
                  </div>
                )}
                <div className="text-sm">
                  <p className="text-xs text-gray-400 mb-0.5">Price</p>
                  {offering.price_kes && Number(offering.price_kes) > 0 ? (
                    <p className="font-bold text-gray-900 text-base">KES {Number(offering.price_kes).toLocaleString()}</p>
                  ) : (
                    <p className="font-medium text-gray-500">Price on request</p>
                  )}
                </div>
              </div>

              {offering.description && (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-2">About this session</h2>
                  <p className="text-sm text-gray-600 leading-relaxed">{offering.description}</p>
                </div>
              )}

              {offering.location_details && (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-2">Location</h2>
                  <p className="text-sm text-gray-600">{offering.location_details}</p>
                </div>
              )}

              {offering.service_zones?.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-2">Service areas</h2>
                  <div className="flex flex-wrap gap-2">
                    {offering.service_zones.map((zone: string) => (
                      <span key={zone} className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">{zone}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="md:hidden mt-6">
                <PtOfferingBookButton pt={pt} offering={offering} />
              </div>
            </>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
          <div className="sticky top-[86px] space-y-4">
            <TrainerCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Programme CTA — varies based on enrollment status ─────────────────────────
function ProgrammeCTA({
  offering,
  pt,
  enrollment,
}: {
  offering: any;
  pt: any;
  enrollment: { id: string; status: string; trainer_intro_confirmed: boolean } | null;
}) {
  if (!offering.is_programme) {
    return <PtOfferingBookButton pt={pt} offering={offering} />;
  }

  if (!enrollment) {
    return (
      <PtOfferingBookButton
        pt={pt}
        offering={offering}
        label="Book Introductory Session"
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
        href={`/pt-offerings/${offering.id}/enroll?enrollment_id=${enrollment.id}`}
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

  return <PtOfferingBookButton pt={pt} offering={offering} label="Book Introductory Session" />;
}
