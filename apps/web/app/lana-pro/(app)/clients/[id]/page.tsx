// LANA PRO — client detail. /lana-pro/clients/<client_user_id>
//
// ONE intelligence architecture: FACT (Client Progress) → EVIDENCE (Workout
// Feedback) → SIGNAL (Lana Signals, internal) → INSIGHT (Lana Insights). The
// header carries only factual context (goal, relationship length, next
// session, status). No legacy "Lana Intelligence" block, no talking points,
// no legacy suggested actions.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { resolveWorkspaceIdentity } from "../../../_shared/identity";
import { proContextFor } from "../../../_shared/pro-context";
import { buildClientProgress, weekBounds, type ClientProgressV1 } from "@/lib/lana-pro-progress/progress";
import { getSharedLanaPlanWeek } from "@/lib/lana-pro-progress/shared-lana-plan";
import { addDays } from "@/lib/lana-pro-intelligence/signals";
import { deriveWorkoutFeedbackSignals } from "@/lib/lana-pro-signals/derive";
import { deriveAdherenceSignals } from "@/lib/lana-pro-signals/adherence";
import { derivePTInsights } from "@/lib/lana-pro-insights/derive";
import type { PTInsight } from "@/lib/lana-pro-insights/types";
import { deriveSuggestedCoachingActions } from "@/lib/lana-pro-coaching-actions/derive";
import type { SuggestedCoachingAction } from "@/lib/lana-pro-coaching-actions/types";

export const dynamic = "force-dynamic";

export default async function LanaProClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");

  const todayStr = new Date().toISOString().slice(0, 10);

  const pro = proContextFor(identity);
  if (!pro || pro.workspace === "business") redirect("/lana-pro/clients");

  // ── the client's Lana-generated plan (planned + authoritative completion),
  //    over this week + the 3 elapsed weeks adherence compares. ONE RPC — it
  //    enforces relationship + share_progress internally. ──
  const { weekStart, weekEnd } = weekBounds(todayStr);
  const sharedLanaFrom = addDays(weekStart, -21); // baseline start of the adherence window
  const sharedLana = await getSharedLanaPlanWeek(
    supabase as unknown as Parameters<typeof getSharedLanaPlanWeek>[0],
    [clientId],
    sharedLanaFrom,
    weekEnd,
  );
  // an RPC failure is NOT proof the client has no plan — the UI must not print
  // "No workouts scheduled" in that case (§15/§21).
  const sharedLanaLoadFailed = !sharedLana.ok;

  // ── L1 FACT — the single consent-aware aggregation (relationship resolved
  //    first; factual header context + full progress). ──
  const progress = await buildClientProgress(
    supabase as unknown as Parameters<typeof buildClientProgress>[0],
    {
      workspace: pro.workspace === "employed" ? "employed" : "independent",
      professionalId: pro.professionalId,
      clientUserId: clientId,
      todayLocalDate: todayStr,
    },
    sharedLana.occurrences.map((o) => ({
      date: o.date,
      title: o.title,
      category: o.category,
      durationMinutes: o.durationMinutes,
      completed: o.completed,
    })),
  );

  if (progress.state === "no_relationship") {
    return (
      <Wrap>
        <Link href="/lana-pro/clients" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
          ← Clients
        </Link>
        <p className="text-sm text-gray-500">This client isn&apos;t in your roster.</p>
      </Wrap>
    );
  }

  const name = progress.client.name;
  const firstName = name.split(" ")[0];

  // ── L3 SIGNALS → L4 PT INSIGHTS — pure, computed on read from the SAME
  //    consent-gated evidence Client Progress already loaded. Zero DB, zero
  //    LLM, no writes, no programme mutation. Empty when not consented
  //    (progress.workoutFeedback is [] in that case).
  const signals = deriveWorkoutFeedbackSignals(progress.workoutFeedback, clientId);
  // structured L3 — adherence comes from planned/completed facts, not comments
  const adherenceSignals = deriveAdherenceSignals(progress.adherence, clientId);
  const insights = derivePTInsights({
    clientId,
    clientName: progress.client.name,
    feedback: progress.workoutFeedback,
    signals,
    adherenceSignals,
  });
  // ── L5 SUGGESTED COACHING ACTIONS — pure map from L4 insights. No DB, no
  //    LLM, no writes. insights === [] (e.g. not consented) → actions === [].
  const actions = deriveSuggestedCoachingActions({
    clientId,
    clientName: progress.client.name,
    insights,
  });

  return (
    <Wrap>
      <Link href="/lana-pro/clients" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
        ← Clients
      </Link>

      {/* ── CLIENT HEADER — factual context only ── */}
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{name}</h1>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {progress.client.goalLabel && <Meta k="Goal" v={progress.client.goalLabel} />}
        {progress.client.relationshipWeeks != null && (
          <Meta k="Working together" v={`${progress.client.relationshipWeeks} ${progress.client.relationshipWeeks === 1 ? "week" : "weeks"}`} />
        )}
        {progress.nextSession && (
          <Meta k="Next session" v={nextSessionLabel(progress.nextSession, todayStr)} />
        )}
        <Meta
          k="Status"
          v={
            progress.client.relationshipStatus === "inactive"
              ? "Inactive"
              : progress.state === "ok"
                ? "Active · sharing progress"
                : "Active · progress not shared"
          }
        />
      </dl>

      {/* ── CLIENT PROGRESS (L1 — facts) ── */}
      <ClientProgress
        data={progress}
        todayStr={todayStr}
        firstName={firstName}
        sharedLanaLoadFailed={sharedLanaLoadFailed}
      />

      {/* ── LANA INSIGHTS (L4 — what Lana noticed) ── */}
      <LanaInsights insights={insights} todayStr={todayStr} />

      {/* ── SUGGESTED ACTIONS (L5 — what you may want to review) ── */}
      <SuggestedActions actions={actions} />
    </Wrap>
  );
}

// ── Suggested Actions (L5) — "what you may want to review" ───────────────
// Advisory only. One card per qualifying L4 insight. Names the decision
// point; never prescribes load / sets / reps / a swap, never diagnoses.
// "Based on: <insight>" keeps the chain visible (§20). No Review / Discuss /
// Dismiss buttons in V1 — those need an L6 destination / state model that
// doesn't exist yet (§15-18). Empty → the section is hidden entirely (§22).
function SuggestedActions({ actions }: { actions: SuggestedCoachingAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Suggested actions</h2>
      <p className="text-[11px] text-gray-400 mt-1 mb-3">What you may want to review</p>
      <ul className="space-y-3">
        {actions.map((a) => (
          <li key={a.id} className="rounded-2xl border border-gray-100 bg-white p-5">
            <p className="text-sm font-semibold text-gray-900">{a.title}</p>
            {/* advisory suggestion — plain text, deliberately NOT in quotes */}
            <p className="text-sm text-gray-700 mt-1.5 max-w-prose">{a.statement}</p>
            <p className="text-[11px] text-gray-400 mt-2">Based on: {a.createdFrom}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Lana Insights (L4) — "what has Lana noticed?" ────────────────────────
// Patterns only. "LANA OBSERVED" — a deterministic statement, never quoted,
// never a recommendation. The client's verbatim words appear ONLY under
// "CLIENT SAID", in quotes, in the drill-down. No signal labels / provenance
// fields are shown (§16). Empty → the section is hidden entirely (§19).
function LanaInsights({ insights, todayStr }: { insights: PTInsight[]; todayStr: string }) {
  if (insights.length === 0) return null;
  const dateLabel = (d: string) => (d === todayStr ? "Today" : d);
  return (
    <section className="mt-8">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mb-3">Lana Insights</h2>
      <ul className="space-y-3">
        {insights.map((i) => (
          <li key={i.id} className="rounded-2xl border border-gray-100 bg-white p-5">
            <p className="text-sm font-semibold text-gray-900">{i.title}</p>
            {/* LANA OBSERVED — plain text, deliberately NOT in quotation marks */}
            <p className="text-sm text-gray-700 mt-1.5 max-w-prose">{i.statement}</p>
            <p className="text-[11px] text-gray-400 mt-2">
              {i.family === "progression" || i.family === "adherence"
                ? `Based on ${i.window.sessionCount} scheduled ${i.window.sessionCount === 1 ? "session" : "sessions"}`
                : i.evidence[0]
                  ? `${dateLabel(i.evidence[0].date)} · ${i.evidence[0].workoutTitle}`
                  : null}
            </p>

            {i.evidence.length > 0 && (
              <details className="mt-3 group">
                <summary className="text-xs font-semibold text-[#050040] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  See evidence
                </summary>
                <div className="mt-2.5 border-l-2 border-gray-100 pl-4 space-y-2.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Client said</p>
                  {i.evidence.map((e) => (
                    <div key={e.feedbackId}>
                      {/* verbatim client words — the ONLY quoted text */}
                      <p className="text-sm text-gray-900">&ldquo;{e.comment}&rdquo;</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {dateLabel(e.date)} · {e.workoutTitle}
                        {e.exerciseName ? ` · ${e.exerciseName}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* adherence — the factual dated-occurrence history (no comments) */}
            {i.occurrences && i.occurrences.length > 0 && (
              <details className="mt-3 group">
                <summary className="text-xs font-semibold text-[#050040] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  Why Lana noticed this
                </summary>
                <div className="mt-2.5 border-l-2 border-gray-100 pl-4 space-y-3">
                  {(["recent", "baseline"] as const).map((period) => {
                    const rows = i.occurrences!.filter((o) => o.period === period);
                    if (rows.length === 0) return null;
                    return (
                      <div key={period}>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          {period === "recent" ? "Most recent completed week" : "Previous two weeks"}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {rows.map((o, idx) => (
                            <li key={idx} className="text-sm text-gray-700">
                              <span className={o.status === "completed" ? "text-green-600" : "text-gray-400"}>
                                {o.status === "completed" ? "✓" : "○"}
                              </span>{" "}
                              {dateLabel(o.date)} · {o.workoutTitle}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
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

function nextSessionLabel(next: { atIso: string; serviceName?: string | null }, todayStr: string): string {
  const day = next.atIso.slice(0, 10);
  const time = next.atIso.slice(11, 16);
  const when = day === todayStr ? "Today" : day;
  return `${when}${time && time !== "00:00" ? ` · ${time}` : ""}`;
}

// ── Client Progress V1 (FACTUAL — no insights, no coaching, no narrative) ──

function ClientProgress({
  data,
  todayStr,
  firstName,
  sharedLanaLoadFailed = false,
}: {
  data: ClientProgressV1;
  todayStr: string;
  firstName: string;
  /** the shared Lana-plan RPC errored — an empty week is NOT a fact here */
  sharedLanaLoadFailed?: boolean;
}) {
  if (data.state === "no_relationship") return null;

  const { goal, bodyProgress, trainingProgress: tp, recentActivity, lastActive } = data;
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mt-9 mb-3">{children}</h2>
  );
  const kg = (n: number | null | undefined) => (n == null ? "—" : `${n} kg`);
  const signed = (n: number | null | undefined) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n} kg`;

  if (data.state === "not_shared") {
    return (
      <section>
        <H>Progress</H>
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">Progress isn&apos;t shared</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-prose">
            {firstName} hasn&apos;t shared their Lana progress with you, so goal, weight and completion
            data isn&apos;t available. You&apos;ve scheduled{" "}
            <span className="font-medium text-gray-900">
              {tp.planned} {tp.planned === 1 ? "session" : "sessions"}
            </span>{" "}
            for them this week.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <H>Progress snapshot</H>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Current weight" value={kg(goal?.currentWeightKg)} sub={goal?.currentWeightSource === "profile" ? "from profile" : goal?.currentWeightSource === "measurement" ? "latest weigh-in" : undefined} />
        <Stat label="Since start" value={signed(goal?.changeSinceStartKg)} sub={goal?.startingWeightKg != null ? `from ${goal.startingWeightKg} kg` : undefined} />
        <Stat label="To goal" value={goal?.goalWeightKg != null ? signed(goal?.toGoalKg) : "—"} sub={goal?.goalWeightKg != null ? `goal ${goal.goalWeightKg} kg` : "no goal weight"} />
        <Stat
          label="Training adherence"
          value={tp.adherencePct != null ? `${tp.adherencePct}%` : "—"}
          sub={tp.completed != null ? `${tp.completed}/${tp.planned} this week` : `${tp.planned} planned`}
        />
      </dl>
      {goal?.targetDate && (
        <p className="text-xs text-gray-400 mt-2">Target date: {goal.targetDate}</p>
      )}

      {/* ── TRENDS ── */}
      <H>Weight trend</H>
      {bodyProgress?.hasHistory ? (
        <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
          {bodyProgress.points
            .slice()
            .reverse()
            .map((p, i) => (
              <li key={i} className="px-5 py-2.5 flex justify-between text-sm">
                <span className="text-gray-500">{p.date === todayStr ? "Today" : p.date}</span>
                <span className="font-medium text-gray-900">{p.weightKg} kg</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">
          No weight history yet — needs at least two logged weigh-ins to show a trend.
        </p>
      )}

      {/* ── TRAINING THIS WEEK ── */}
      <H>Training this week</H>
      {tp.planned === 0 ? (
        sharedLanaLoadFailed ? (
          <p className="text-sm text-amber-600">
            Couldn&apos;t load this client&apos;s Lana plan just now — refresh to try again.
          </p>
        ) : (
          <p className="text-sm text-gray-400">No workouts scheduled for this week.</p>
        )
      ) : (
        <>
          <p className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">{tp.completed}</span> completed
            {" · "}
            <span className="font-medium text-gray-900">{tp.missed}</span> missed
            {" · "}
            <span className="font-medium text-gray-900">{tp.upcoming}</span> upcoming
            <span className="text-gray-400"> · of {tp.planned} planned</span>
          </p>
          <ul className="mt-3 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {tp.sessions.map((s, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-4">
                <span className="text-xs font-semibold text-gray-400 w-16 flex-shrink-0">
                  {s.date === todayStr ? "Today" : s.date.slice(5)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{s.workoutTitle}</span>
                  <span className="block text-[11px] text-gray-400">
                    {s.source === "lana_plan" ? "Lana plan" : "Trainer plan"}
                  </span>
                </span>
                <span
                  className={
                    s.status === "completed"
                      ? "text-xs font-semibold text-green-600"
                      : s.status === "missed"
                        ? "text-xs font-semibold text-red-500"
                        : "text-xs font-semibold text-gray-400"
                  }
                >
                  {s.status === "completed"
                    ? "Completed"
                    : s.status === "missed"
                      ? "Missed"
                      : s.date === todayStr
                        ? "Today"
                        : "Upcoming"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── WORKOUT FEEDBACK (verbatim — no Lana interpretation) ── */}
      <H>Workout feedback</H>
      {data.workoutFeedback.length === 0 ? (
        <p className="text-sm text-gray-400">No workout feedback yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.workoutFeedback.map((f) => (
            <li key={f.id} className="rounded-2xl border border-gray-100 bg-white p-4">
              <p className="text-xs font-semibold text-gray-400">
                {f.scheduledDate === todayStr ? "Today" : f.scheduledDate} · {f.workoutTitle}
                {f.scope === "exercise" && (f.exerciseName ?? f.exerciseId) ? (
                  <> · {f.exerciseName ?? "an exercise"}</>
                ) : null}
              </p>
              {/* the client's exact words — shown prominently, never rewritten */}
              <p className="text-sm text-gray-900 mt-1.5">&ldquo;{f.comment}&rdquo;</p>
              {(f.completionContext.status !== "completed" ||
                f.completionContext.completionPercentage != null ||
                f.completionContext.perceivedDifficulty) && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {[
                    f.completionContext.status !== "completed" ? f.completionContext.status.replace(/_/g, " ") : null,
                    f.completionContext.completionPercentage != null
                      ? `${Math.round(f.completionContext.completionPercentage)}% of sets logged`
                      : null,
                    f.completionContext.perceivedDifficulty ? `felt ${f.completionContext.perceivedDifficulty.replace(/_/g, " ")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── RECENT ACTIVITY ── */}
      <H>Recent activity</H>
      {recentActivity.length === 0 ? (
        <p className="text-sm text-gray-400">No recent activity yet.</p>
      ) : (
        <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
          {recentActivity.map((e, i) => (
            <li key={i} className="px-5 py-3 flex items-start gap-4">
              <span className="text-xs font-semibold text-gray-400 w-16 flex-shrink-0 mt-0.5">
                {e.date === todayStr ? "Today" : e.date.slice(5)}
              </span>
              <p className="text-sm font-medium text-gray-900 min-w-0 flex-1">{e.label}</p>
            </li>
          ))}
        </ul>
      )}

      {lastActive && (
        <p className="text-xs text-gray-400 mt-3">
          Last active: {lastActive.date === todayStr ? "today" : lastActive.date} ({lastActive.source})
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3.5 py-3">
      <dt className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{value}</dd>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="p-6 md:p-10 max-w-2xl mx-auto">{children}</div>;
}
