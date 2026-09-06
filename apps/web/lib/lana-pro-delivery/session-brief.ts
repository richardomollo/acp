// LANA PRO — Phase 4.4: Professional Session Brief (PURE, deterministic).
//
// ONE intelligence entry point. Composes existing canonical evidence into ≤4
// high-value, evidence-grounded observations for the pre-session screen. No
// LLM, no network, no scores, no diagnosis. Every rendered string carries
// internal provenance and passes `assertBriefSafe` (copy-safety.ts).
//
// Consent (§4): "protected progress evidence" (goal, measurements, workout
// adherence, activity, nutrition, check-ins) is included ONLY when the
// relationship is `active` AND `share_progress = true`. The professional's OWN
// records (previous session focus) and tasks they assigned (open actions) are
// not protected progress and are always available.

import { assertBriefSafe } from './copy-safety.ts';
import type { ProfessionalFlavour } from '../lana-pro-services/service-taxonomy.ts';

// ── provenance (internal only — never rendered) ─────────────────────────

export type BriefEvidenceSource =
  | 'previous_session'
  | 'assigned_task'
  | 'profile_goal'
  | 'measurement'
  | 'workout_adherence'
  | 'activity'
  | 'nutrition_log'
  | 'check_in'
  | 'principle';

export interface BriefProvenance {
  source: BriefEvidenceSource;
  detail: string;
  values?: Record<string, number | string | boolean>;
}

export type BriefObservationKind =
  | 'previous_session'
  | 'open_action'
  | 'goal'
  | 'progress'
  | 'activity'
  | 'nutrition'
  | 'check_in';

export interface BriefObservation {
  text: string;
  kind: BriefObservationKind;
  provenance: BriefProvenance;
}

export type BriefState = 'evidence' | 'no_shared_progress' | 'insufficient_evidence';

export interface ProfessionalSessionBrief {
  state: BriefState;
  observations: BriefObservation[];
  suggestedFocus: string | null;
  /** True when the relationship is active but the client hasn't shared progress. */
  progressWithheld: boolean;
}

// ── input ──────────────────────────────────────────────────────────────

export interface SessionBriefInput {
  clientFirstName: string;
  serviceName: string;
  professionalFlavour: ProfessionalFlavour | null;
  consent: {
    relationshipStatus: 'active' | 'pending' | 'inactive' | 'none';
    shareProgress: boolean;
  };
  /** the professional's most recent completed session record with this client */
  previousSession?: { focus: string | null; completedAtDate: string | null } | null;
  /** open client_tasks (status = 'pending') assigned by this professional */
  openActions?: { title: string }[];
  /** GATED — fitness_profile */
  goal?: { label: string } | null;
  /** GATED — client_measurements, most-recent-first, weight only used here */
  recentWeightsKg?: number[];
  /** GATED — workout_history / plan_activity_completions in a trailing window */
  workoutAdherence?: { completed: number; planned: number; windowDays: number } | null;
  /** GATED — activities/workout_history count in the current local week */
  activityCountThisWeek?: number | null;
  /** GATED — food_log_entries, nutrition flavour only */
  nutrition?: { daysWithAnyLog: number; windowDays: number; breakfastDays?: number } | null;
  /** GATED — daily_checkins count in a trailing window */
  checkInCount?: { count: number; windowDays: number } | null;
}

// ── helpers ────────────────────────────────────────────────────────────

const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || 'your client';

function obs(text: string, kind: BriefObservationKind, provenance: BriefProvenance): BriefObservation {
  assertBriefSafe(text, `brief:${kind}`);
  return { text, kind, provenance };
}

function relativeDay(dateStr: string | null): string {
  if (!dateStr) return 'previously';
  return `on ${dateStr}`;
}

// ── the builder ────────────────────────────────────────────────────────

const MAX_OBSERVATIONS = 4;

/** @param opts.maxObservations override the default cap of 4 — used by the
 *  Phase-6 client brief, which composes a fuller picture than the pre-session
 *  screen. The session workspace keeps the default. */
export function buildProfessionalSessionBrief(
  input: SessionBriefInput,
  opts: { maxObservations?: number } = {},
): ProfessionalSessionBrief {
  const name = firstName(input.clientFirstName);
  const consented =
    input.consent.relationshipStatus === 'active' && input.consent.shareProgress === true;
  const progressWithheld =
    input.consent.relationshipStatus === 'active' && input.consent.shareProgress !== true;

  const out: BriefObservation[] = [];

  // A. Previous session (not protected — professional's own record).
  if (input.previousSession?.focus && input.previousSession.focus.trim()) {
    const f = input.previousSession.focus.trim();
    out.push(
      obs(
        `Last session ${relativeDay(input.previousSession.completedAtDate)} focused on ${f}.`,
        'previous_session',
        { source: 'previous_session', detail: 'focus' },
      ),
    );
  }

  // B. Outstanding agreed actions (not protected — tasks the pro assigned).
  const open = (input.openActions ?? []).filter((a) => a.title && a.title.trim());
  if (open.length === 1) {
    out.push(
      obs(`One action from your previous session is still open: ${open[0].title.trim()}.`, 'open_action', {
        source: 'assigned_task',
        detail: 'open_count',
        values: { count: 1 },
      }),
    );
  } else if (open.length > 1) {
    out.push(
      obs(`${open.length} actions from your previous session are still open.`, 'open_action', {
        source: 'assigned_task',
        detail: 'open_count',
        values: { count: open.length },
      }),
    );
  }

  // C–F require consent.
  if (consented) {
    // C. Goal relevant to today.
    if (input.goal?.label && input.goal.label.trim()) {
      out.push(
        obs(`${name}'s current goal is ${input.goal.label.trim()}.`, 'goal', {
          source: 'profile_goal',
          detail: 'goal',
        }),
      );
    }

    // D. Meaningful progress/change — workout adherence, then weight stability.
    if (
      input.workoutAdherence &&
      input.workoutAdherence.planned > 0 &&
      input.workoutAdherence.windowDays > 0
    ) {
      const { completed, planned } = input.workoutAdherence;
      out.push(
        obs(
          `${name} completed ${completed} of ${planned} planned workout${planned === 1 ? '' : 's'} this week.`,
          'progress',
          { source: 'workout_adherence', detail: 'window', values: { completed, planned } },
        ),
      );
    }
    if (
      Array.isArray(input.recentWeightsKg) &&
      input.recentWeightsKg.length >= 3
    ) {
      const w = input.recentWeightsKg.slice(0, 3);
      const spread = Math.max(...w) - Math.min(...w);
      if (spread <= 1.5) {
        out.push(
          obs(
            `Weight has remained broadly stable across the last three measurements.`,
            'progress',
            { source: 'measurement', detail: 'stable', values: { spreadKg: Number(spread.toFixed(1)) } },
          ),
        );
      } else {
        const dir = w[0] < w[2] ? 'lower' : 'higher';
        out.push(
          obs(
            `Weight at the last measurement was ${dir} than three measurements ago.`,
            'progress',
            { source: 'measurement', detail: 'trend', values: { dir } },
          ),
        );
      }
    }

    // E. Recent activity / nutrition evidence.
    if (typeof input.activityCountThisWeek === 'number') {
      const c = input.activityCountThisWeek;
      out.push(
        obs(
          c === 0
            ? `No completed activity has been logged so far this week.`
            : `${c} activit${c === 1 ? 'y has' : 'ies have'} been logged so far this week.`,
          'activity',
          { source: 'activity', detail: 'week_count', values: { count: c } },
        ),
      );
    }
    if (input.professionalFlavour === 'nutrition' && input.nutrition && input.nutrition.windowDays > 0) {
      const n = input.nutrition;
      if (typeof n.breakfastDays === 'number') {
        out.push(
          obs(
            `Breakfast was logged on ${n.breakfastDays} of the last ${n.windowDays} days.`,
            'nutrition',
            { source: 'nutrition_log', detail: 'breakfast', values: { days: n.breakfastDays, window: n.windowDays } },
          ),
        );
      } else {
        out.push(
          obs(
            `Food was logged on ${n.daysWithAnyLog} of the last ${n.windowDays} days.`,
            'nutrition',
            { source: 'nutrition_log', detail: 'any', values: { days: n.daysWithAnyLog, window: n.windowDays } },
          ),
        );
      }
    }
    if (input.checkInCount && input.checkInCount.windowDays > 0 && input.checkInCount.count > 0) {
      out.push(
        obs(
          `${name} checked in ${input.checkInCount.count} time${input.checkInCount.count === 1 ? '' : 's'} in the last ${input.checkInCount.windowDays} days.`,
          'check_in',
          { source: 'check_in', detail: 'count', values: { count: input.checkInCount.count } },
        ),
      );
    }
  }

  // Priority order + cap.
  const ORDER: BriefObservationKind[] = [
    'previous_session',
    'open_action',
    'goal',
    'progress',
    'activity',
    'nutrition',
    'check_in',
  ];
  out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const observations = out.slice(0, Math.max(1, opts.maxObservations ?? MAX_OBSERVATIONS));

  // F. Suggested focus — a soft prompt, only when we have something to anchor
  // it to. Never prescriptive, never diagnostic.
  let suggestedFocus: string | null = null;
  if (input.previousSession?.focus?.trim()) {
    const f = input.previousSession.focus.trim();
    suggestedFocus = `Consider continuing on ${f} and asking how it felt since last time.`;
  } else if (consented && input.goal?.label?.trim()) {
    suggestedFocus = `Consider a focus that connects today's session to ${input.goal.label.trim()}.`;
  }
  if (suggestedFocus) assertBriefSafe(suggestedFocus, 'brief:suggested_focus');

  const state: BriefState = progressWithheld
    ? 'no_shared_progress'
    : observations.length > 0
      ? 'evidence'
      : 'insufficient_evidence';

  return { state, observations, suggestedFocus, progressWithheld };
}

/** Every rendered string in a brief (for a whole-bundle safety assert in tests). */
export function briefStrings(brief: ProfessionalSessionBrief): string[] {
  return [...brief.observations.map((o) => o.text), ...(brief.suggestedFocus ? [brief.suggestedFocus] : [])];
}
