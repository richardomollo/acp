// LANA PRO — Phase 6 (Step 1): deterministic intelligence signals (PURE).
//
// The NET-NEW deterministic signals the client brief needs that are NOT already
// produced by `session-brief.ts` (weight trend, activity count, nutrition,
// check-in frequency, previous session, open actions, goal) — those are reused
// via `buildProfessionalSessionBrief`, never re-implemented here.
//
// Every signal:
//   • is a pure function of already-fetched primitives,
//   • returns a typed item or null (null = "no truthful signal"),
//   • classifies itself as FACT or OBSERVATION,
//   • passes `assertBriefSafe` on every rendered string (§16),
//   • carries internal-only provenance (never rendered),
//   • carries the newest evidence date it is based on, when one exists.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import { assertBriefSafe } from '../lana-pro-delivery/copy-safety.ts';
import type { BriefProvenance } from '../lana-pro-delivery/session-brief.ts';
import { NEW_CLIENT_DAYS, NEW_MEASUREMENT_DAYS } from '../lana-pro-delivery/session-attention.ts';

export type SignalTag = 'fact' | 'observation';

export interface SignalItem {
  tag: SignalTag;
  /** stable machine key for grouping / testing */
  kind: string;
  /** rendered to the professional — always copy-safe */
  text: string;
  /** internal only — never rendered */
  provenance: BriefProvenance;
  /** ISO date (YYYY-MM-DD) of the newest evidence behind this signal, if any */
  evidenceDate?: string | null;
}

const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || 'your client';
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function fact(kind: string, text: string, provenance: BriefProvenance, evidenceDate?: string | null): SignalItem {
  assertBriefSafe(text, `signal:${kind}`);
  return { tag: 'fact', kind, text, provenance, evidenceDate: evidenceDate ?? null };
}
function observation(kind: string, text: string, provenance: BriefProvenance, evidenceDate?: string | null): SignalItem {
  assertBriefSafe(text, `signal:${kind}`);
  return { tag: 'observation', kind, text, provenance, evidenceDate: evidenceDate ?? null };
}

// ── relationship (FACTS — professional-owned, never consent-gated) ────────

/** Whole weeks since the relationship was created. Null when unknown or <1wk. */
export function relationshipWeeks(createdAtIso: string | null, todayLocalDate: string): number | null {
  if (!createdAtIso) return null;
  const created = Date.parse(createdAtIso);
  const today = Date.parse(`${todayLocalDate}T00:00:00Z`);
  if (!Number.isFinite(created) || !Number.isFinite(today)) return null;
  const weeks = Math.floor((today - created) / (7 * 864e5));
  return weeks >= 1 ? weeks : null;
}

export function relationshipLengthFact(createdAtIso: string | null, todayLocalDate: string): SignalItem | null {
  const w = relationshipWeeks(createdAtIso, todayLocalDate);
  if (w == null) return null;
  return fact('relationship_length', `Working together for ${w} ${plural(w, 'week')}.`, {
    source: 'principle',
    detail: 'relationship_weeks',
    values: { weeks: w },
  });
}

export function daysBetween(fromIso: string | null, todayLocalDate: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso.length <= 10 ? `${fromIso}T00:00:00Z` : fromIso);
  const today = Date.parse(`${todayLocalDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(today)) return null;
  return Math.floor((today - from) / 864e5);
}

export function newClientFact(createdAtIso: string | null, todayLocalDate: string): SignalItem | null {
  const days = daysBetween(createdAtIso, todayLocalDate);
  if (days == null || days < 0 || days > NEW_CLIENT_DAYS) return null;
  const text =
    days === 0 ? 'New client — connected today.' : `New client — connected ${days} ${plural(days, 'day')} ago.`;
  return fact('new_client', text, { source: 'principle', detail: 'relationship_age_days', values: { days } });
}

export function sessionsCompletedFact(completedCount: number): SignalItem | null {
  if (!Number.isFinite(completedCount) || completedCount <= 0) return null;
  return fact(
    'sessions_completed',
    `You have completed ${completedCount} ${plural(completedCount, 'session')} together.`,
    { source: 'previous_session', detail: 'completed_count', values: { count: completedCount } },
  );
}

export function nextSessionFact(
  next: { atIso: string; serviceName: string } | null,
  todayLocalDate: string,
): SignalItem | null {
  if (!next?.atIso) return null;
  const day = next.atIso.slice(0, 10);
  const when =
    day === todayLocalDate ? 'today' : day === addDays(todayLocalDate, 1) ? 'tomorrow' : `on ${day}`;
  const svc = (next.serviceName || 'a session').trim();
  return fact('next_session', `Your next session together is ${when} — ${svc}.`, {
    source: 'previous_session',
    detail: 'next_booking',
  });
}

export function followUpDueFact(followUpDueOn: string | null, todayLocalDate: string): SignalItem | null {
  if (!followUpDueOn || followUpDueOn > todayLocalDate) return null;
  return fact('follow_up_due', 'A follow-up from your last session is due.', {
    source: 'previous_session',
    detail: 'follow_up_at',
  }, followUpDueOn);
}

// ── profile (FACTS — consent-gated; the aggregator only passes data when
//    share_progress is true) ────────────────────────────────────────────────

export function experienceFact(level: string | null | undefined): SignalItem | null {
  const v = (level ?? '').trim();
  if (!v) return null;
  return fact('experience', `Experience level: ${v}.`, { source: 'profile_goal', detail: 'experience_level' });
}

export function preferenceFacts(args: {
  preferredActivities?: string[] | null;
  preferredTrainingDays?: string[] | null;
}): SignalItem[] {
  const out: SignalItem[] = [];
  const acts = (args.preferredActivities ?? []).map((s) => (s ?? '').trim()).filter(Boolean);
  const days = (args.preferredTrainingDays ?? []).map((s) => (s ?? '').trim()).filter(Boolean);
  if (acts.length > 0) {
    out.push(
      fact('preference', `Prefers ${listPhrase(acts.slice(0, 4))}.`, {
        source: 'profile_goal',
        detail: 'preferred_activities',
      }),
    );
  }
  if (days.length > 0) {
    out.push(
      fact('preference', `Usually trains ${days.length} ${plural(days.length, 'day')} a week (${listPhrase(days.slice(0, 7))}).`, {
        source: 'profile_goal',
        detail: 'preferred_training_days',
      }),
    );
  }
  return out;
}

export function secondaryGoalsFact(goals: string[] | null | undefined, primary: string | null): SignalItem | null {
  const extras = (goals ?? [])
    .map((g) => (g ?? '').trim())
    .filter((g) => g && g.toLowerCase() !== (primary ?? '').trim().toLowerCase());
  if (extras.length === 0) return null;
  return fact('goal', `Also working towards ${listPhrase(extras.slice(0, 3))}.`, {
    source: 'profile_goal',
    detail: 'secondary_goals',
  });
}

// ── behavioural (OBSERVATIONS — consent-gated) ──────────────────────────────

/**
 * Assigned-workout adherence. Denominator = workouts THIS professional assigned
 * inside the window; numerator = how many of those have a completion. Distinct
 * from session-brief's "planned workouts this week" (Lana-plan) which the
 * inspection found is not professionally visible.
 */
export function assignedWorkoutAdherence(args: {
  completed: number;
  assigned: number;
  windowDays: number;
  clientName: string;
}): SignalItem | null {
  const { completed, assigned, windowDays } = args;
  if (!Number.isFinite(assigned) || assigned <= 0 || !Number.isFinite(windowDays) || windowDays <= 0) return null;
  const c = Math.max(0, Math.min(completed, assigned));
  const window = windowDays <= 7 ? 'this week' : `in the last ${windowDays} days`;
  return observation(
    'workout_adherence',
    `Completed ${c} of ${assigned} ${plural(assigned, 'workout')} you assigned ${window}.`,
    { source: 'workout_adherence', detail: 'assigned_window', values: { completed: c, assigned, windowDays } },
  );
}

/** Activity this week against a trailing multi-week mean. Only speaks when the
 *  difference is at least one whole session either way. */
export function activityVsRecentPattern(args: {
  thisWeek: number;
  recentWeeklyMean: number;
  weeksObserved: number;
}): SignalItem | null {
  const { thisWeek, recentWeeklyMean, weeksObserved } = args;
  if (!Number.isFinite(weeksObserved) || weeksObserved < 2) return null;
  if (!Number.isFinite(thisWeek) || !Number.isFinite(recentWeeklyMean) || recentWeeklyMean <= 0) return null;
  if (thisWeek + 1 <= Math.floor(recentWeeklyMean)) {
    return observation('activity_pattern', 'Activity this week is lower than the recent pattern.', {
      source: 'activity',
      detail: 'vs_mean',
      values: { thisWeek, mean: Number(recentWeeklyMean.toFixed(1)), weeks: weeksObserved },
    });
  }
  if (thisWeek >= Math.ceil(recentWeeklyMean) + 1) {
    return observation('activity_pattern', 'Activity this week is higher than the recent pattern.', {
      source: 'activity',
      detail: 'vs_mean',
      values: { thisWeek, mean: Number(recentWeeklyMean.toFixed(1)), weeks: weeksObserved },
    });
  }
  return null;
}

export function measurementRecency(args: {
  daysSinceLastMeasurement: number | null | undefined;
  todayLocalDate: string;
}): SignalItem | null {
  const d = args.daysSinceLastMeasurement;
  if (d == null || !Number.isFinite(d)) return null;
  if (d <= NEW_MEASUREMENT_DAYS) {
    return observation('measurement_recency', `A new measurement was logged ${d === 0 ? 'today' : `${d} ${plural(d, 'day')} ago`}.`, {
      source: 'measurement',
      detail: 'recency_new',
      values: { days: d },
    }, addDays(args.todayLocalDate, -d));
  }
  if (d >= 21) {
    return observation('measurement_recency', 'No measurement update in over three weeks.', {
      source: 'measurement',
      detail: 'recency_stale',
      values: { days: d },
    }, addDays(args.todayLocalDate, -d));
  }
  return null;
}

// ── talking points (soft prompts — never prescriptive) ────────────────────

export function talkingPointsFor(ctx: {
  previousFocus?: string | null;
  /** the professional's OWN observation on the last session (evidence, not
   *  inference). Only 'difficult' yields a prompt — and it is a suggestion to
   *  ask, never a claim about why. */
  lastSessionDifficult?: boolean;
  hasAdherence?: boolean;
  activityBelowPattern?: boolean;
  measurementStale?: boolean;
  nutritionInconsistent?: boolean;
  isNewClient?: boolean;
}): string[] {
  const out: string[] = [];
  if (ctx.isNewClient) out.push('Their goal, and what a realistic starting point looks like.');
  if (ctx.lastSessionDifficult) {
    out.push('Last session was marked difficult — check how things have felt since then before deciding what to change.');
  }
  if (ctx.previousFocus?.trim()) out.push(`How ${ctx.previousFocus.trim()} has felt since last time.`);
  if (ctx.hasAdherence) out.push('How recovery has felt across the sessions completed.');
  if (ctx.activityBelowPattern) out.push('What may have changed this week.');
  if (ctx.measurementStale) out.push('Whether a fresh measurement would be useful.');
  if (ctx.nutritionInconsistent) out.push('Which meal is hardest to keep consistent.');
  const capped = out.slice(0, 3);
  for (const s of capped) assertBriefSafe(s, 'signal:talking_point');
  return capped;
}

// ── small date helpers (UTC-anchored, calendar-day only) ──────────────────

export function addDays(localDate: string, delta: number): string {
  const t = Date.parse(`${localDate}T00:00:00Z`);
  return new Date(t + delta * 864e5).toISOString().slice(0, 10);
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export { firstName as _firstName };
