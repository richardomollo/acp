// LANA PRO — Phase 4.4 + Phase 6 (Step 3): client detail.
//   /lana-pro/clients/<client_user_id>
//
// Top of the page answers: who is this · what are they trying to achieve ·
// what's been happening · what to pay attention to · what's next — from the
// consent-aware LanaClientBrief. The RECENT ACTIVITY timeline below is composed
// by REFERENCE (no timeline table); consent controls which progress items show.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { resolveWorkspaceIdentity } from "../../../_shared/identity";
import { proContextFor } from "../../../_shared/pro-context";
import { resolveClientBrief } from "@/lib/lana-pro-intelligence/aggregator";
import type { LanaClientBrief } from "@/lib/lana-pro-intelligence/client-brief";

export const dynamic = "force-dynamic";

type TimelineItem = {
  date: string;
  kind: "session" | "measurement" | "booking";
  title: string;
  detail?: string;
  href?: string;
};

export default async function LanaProClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");

  const today = new Date();
  const nowIso = today.toISOString().slice(0, 19);
  const todayStr = nowIso.slice(0, 10);

  // Flavour needs the PT's specialisations (independent only).
  let specialisations: string[] | null = null;
  if (identity.pt) {
    const { data: ptRow } = await supabase
      .from("personal_trainers")
      .select("specialisations")
      .eq("id", identity.pt.id)
      .maybeSingle();
    specialisations = (ptRow?.specialisations as string[] | null) ?? null;
  }

  const pro = proContextFor(identity, specialisations);
  if (!pro || pro.workspace === "business") redirect("/lana-pro/clients");

  const brief = await resolveClientBrief(
    supabase as unknown as Parameters<typeof resolveClientBrief>[0],
    {
      workspace: pro.workspace,
      professionalKind: pro.professionalKind,
      professionalId: pro.professionalId,
      professionalFlavour: pro.professionalFlavour,
      clientUserId: clientId,
      todayLocalDate: todayStr,
      nowIso,
    },
    "detail",
  );

  if (!brief || brief.state === "no_relationship") {
    return (
      <Wrap>
        <Link href="/lana-pro/clients" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
          ← Clients
        </Link>
        <p className="text-sm text-gray-500">This client isn&apos;t in your roster.</p>
      </Wrap>
    );
  }

  const name = brief.clientContext.name;
  const firstName = name.split(" ")[0];
  const consented = brief.clientContext.sharesProgress;
  const isIndependent = pro.professionalKind === "personal_trainer";

  // ── RECENT ACTIVITY timeline (independent PT only; by reference) ──
  const items: TimelineItem[] = isIndependent
    ? await composeTimeline(supabase, identity.pt!.id, clientId, todayStr, consented)
    : [];

  return (
    <Wrap>
      <Link href="/lana-pro/clients" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
        ← Clients
      </Link>

      {/* ── who / goal / relationship / next ── */}
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{name}</h1>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {brief.clientContext.goalLabel && (
          <Meta k="Goal" v={brief.clientContext.goalLabel} />
        )}
        {brief.clientContext.relationshipWeeks != null && (
          <Meta k="Working together" v={`${brief.clientContext.relationshipWeeks} ${brief.clientContext.relationshipWeeks === 1 ? "week" : "weeks"}`} />
        )}
        {brief.clientContext.nextSession && (
          <Meta k="Next session" v={nextSessionLabel(brief.clientContext.nextSession, todayStr)} />
        )}
        <Meta
          k="Status"
          v={
            brief.clientContext.relationship === "active"
              ? consented
                ? "Active · sharing progress"
                : "Active · progress not shared"
              : brief.clientContext.relationship === "pending"
                ? "Invited — not yet accepted"
                : "Inactive"
          }
        />
      </dl>

      {/* ── LANA INTELLIGENCE ── */}
      <Intelligence brief={brief} firstName={firstName} />

      {/* ── RECENT ACTIVITY ── */}
      {isIndependent && (
        <>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mt-10 mb-3">Recent activity</h2>
          {items.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nothing recorded yet. Your first session with {firstName} will appear here.
            </p>
          ) : (
            <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {items.map((it, i) => (
                <li key={i} className="px-5 py-3.5 flex items-start gap-4">
                  <span className="text-xs font-semibold text-gray-400 w-16 flex-shrink-0 mt-0.5">
                    {it.date === todayStr ? "Today" : it.date.slice(5)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{it.title}</p>
                    {it.detail && <p className="text-xs text-gray-500 mt-0.5">{it.detail}</p>}
                  </div>
                  {it.href && (
                    <Link href={it.href} className="text-xs font-semibold text-[#050040] hover:underline flex-shrink-0">
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Wrap>
  );
}

// ── Lana Intelligence block ──────────────────────────────────────────────

function Intelligence({ brief, firstName }: { brief: LanaClientBrief; firstName: string }) {
  const { knownFacts, observations, talkingPoints, suggestedActions, state, dataFreshness } = brief;

  return (
    <section className="mt-8">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mb-3">Lana Intelligence</h2>

      {state === "no_shared_progress" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">Progress isn&apos;t shared</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-prose">
            {firstName} hasn&apos;t chosen to share their Lana progress with you. You can still use
            your session history, bookings and agreed actions to prepare and work together.
          </p>
          {knownFacts.length > 0 && (
            <div className="mt-4">
              <SubLabel>What you have</SubLabel>
              <Lines items={knownFacts.map((f) => f.text)} />
            </div>
          )}
        </div>
      ) : state === "new_client" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">You haven&apos;t worked together yet</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-prose">
            Use the first session to establish a baseline and understand how {firstName} likes to work.
          </p>
          {knownFacts.length > 0 && (
            <div className="mt-4">
              <SubLabel>What Lana knows</SubLabel>
              <Lines items={knownFacts.map((f) => f.text)} />
            </div>
          )}
          {talkingPoints.length > 0 && (
            <div className="mt-4">
              <SubLabel>Worth discussing</SubLabel>
              <Lines items={talkingPoints} />
            </div>
          )}
        </div>
      ) : state === "no_activity_data" ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">Lana is still learning about {firstName}</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-prose">
            As activity and session history build up, useful patterns will appear here.
          </p>
          {knownFacts.length > 0 && (
            <div className="mt-4">
              <SubLabel>What Lana knows</SubLabel>
              <Lines items={knownFacts.map((f) => f.text)} />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-5">
          {knownFacts.length > 0 && (
            <div>
              <SubLabel>What Lana knows</SubLabel>
              <Lines items={knownFacts.map((f) => f.text)} />
            </div>
          )}
          {observations.length > 0 && (
            <div>
              <SubLabel>Recent pattern</SubLabel>
              <Lines items={observations.map((o) => o.text)} />
            </div>
          )}
          {talkingPoints.length > 0 && (
            <div>
              <SubLabel>Worth discussing</SubLabel>
              <Lines items={talkingPoints} />
            </div>
          )}
          {dataFreshness.stale && (
            <p className="text-xs text-gray-400">Based on older activity — check what&apos;s current with {firstName}.</p>
          )}
        </div>
      )}

      {suggestedActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestedActions.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-500 mb-1.5">{children}</p>;
}
function Lines({ items }: { items: string[] }) {
  return (
    <ul className="text-sm text-gray-700 space-y-1">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-gray-400">{k}</dt>
      <dd className="font-medium text-gray-900">{v}</dd>
    </div>
  );
}

function nextSessionLabel(next: { atIso: string; serviceName: string }, todayStr: string): string {
  const day = next.atIso.slice(0, 10);
  const time = next.atIso.slice(11, 16);
  const when = day === todayStr ? "Today" : day;
  return `${when}${time && time !== "00:00" ? ` · ${time}` : ""}`;
}

// ── timeline (unchanged Phase-4.4 behaviour, independent PT) ──────────────

type SB = Awaited<ReturnType<typeof createClient>>;

async function composeTimeline(
  supabase: SB,
  ptId: string,
  clientId: string,
  today: string,
  consented: boolean,
): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];

  const { data: sessions } = await supabase
    .from("professional_session_records")
    .select("booking_id, service_type, focus, completed_at, session_status")
    .eq("personal_trainer_id", ptId)
    .eq("client_user_id", clientId)
    .order("completed_at", { ascending: false })
    .limit(20);
  for (const s of sessions ?? []) {
    if (s.session_status !== "completed" || !s.completed_at) continue;
    items.push({
      date: s.completed_at.slice(0, 10),
      kind: "session",
      title: s.service_type || "Session",
      detail: s.focus || undefined,
      href: `/lana-pro/bookings/appointment/${s.booking_id}/session`,
    });
  }

  const sessionBookingIds = (sessions ?? []).filter((s) => s.session_status === "completed").map((s) => s.booking_id);
  if (sessionBookingIds.length > 0) {
    const { data: recs } = await supabase
      .from("professional_session_records")
      .select("id, booking_id")
      .in("booking_id", sessionBookingIds);
    const { data: taskRows } = await supabase
      .from("client_tasks")
      .select("session_record_id")
      .eq("pt_id", ptId)
      .eq("client_user_id", clientId)
      .not("session_record_id", "is", null);
    const countBySession = new Map<string, number>();
    for (const t of taskRows ?? []) {
      countBySession.set(t.session_record_id as string, (countBySession.get(t.session_record_id as string) ?? 0) + 1);
    }
    const bookingToRec = new Map((recs ?? []).map((r) => [r.booking_id as string, r.id as string]));
    for (const item of items) {
      if (item.kind !== "session" || !item.href) continue;
      const bId = item.href.split("/")[4];
      const recId = bookingToRec.get(bId);
      const n = recId ? countBySession.get(recId) ?? 0 : 0;
      if (n > 0) item.detail = `${item.detail ? item.detail + " · " : ""}${n} action${n === 1 ? "" : "s"} agreed`;
    }
  }

  if (consented) {
    const { data: meas } = await supabase
      .from("client_measurements")
      .select("logged_at")
      .eq("user_id", clientId)
      .order("logged_at", { ascending: false })
      .limit(5);
    for (const m of meas ?? []) {
      if (!m.logged_at) continue;
      items.push({ date: m.logged_at.slice(0, 10), kind: "measurement", title: "Measurement update" });
    }
  }

  const { data: upcoming } = await supabase
    .from("pt_bookings")
    .select("id, scheduled_date, status, pt_offerings(title)")
    .eq("pt_id", ptId)
    .eq("user_id", clientId)
    .gte("scheduled_date", today)
    .in("status", ["pending", "confirmed"])
    .order("scheduled_date", { ascending: true })
    .limit(3);
  for (const b of upcoming ?? []) {
    const off = Array.isArray(b.pt_offerings) ? b.pt_offerings[0] : b.pt_offerings;
    items.push({
      date: b.scheduled_date,
      kind: "booking",
      title: `Upcoming: ${off?.title || "Session"}`,
      href: `/lana-pro/bookings/appointment/${b.id}`,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="p-6 md:p-10 max-w-2xl mx-auto">{children}</div>;
}
