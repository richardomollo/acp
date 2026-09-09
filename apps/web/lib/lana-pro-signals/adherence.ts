// LANA PRO — PT INTELLIGENCE, LEVEL 3: the ADHERENCE signal.
//
//   PLANNED OCCURRENCES + COMPLETION FACTS (L1)  →  L3 ADHERENCE SIGNAL
//
// This is L3 but NOT the comment-classification path (§9). Adherence is
// structured: it comes from `AdherenceFacts` (planned dated occurrences vs
// actual completions), never from free text. It lives in its own module so
// the workout-feedback classifier's closed `LanaSignalType` union stays intact.
//
// The signal states WHAT changed (recent consistency fell relative to a
// baseline). It NEVER states WHY — it does not label the client or guess a
// reason (§17). It is conservative: a real baseline of consistency AND a
// clear, multi-session recent drop are BOTH required (§11).

import type { AdherenceFacts, AdherenceOccurrence } from '../lana-pro-progress/progress.ts';

export const ADHERENCE_DETECTOR_VERSION = 'adherence-v1';

// ── minimum evidence (§14/§15) ──────────────────────────────────────────────
/** enough planned opportunities in the baseline to establish "usually consistent" */
const MIN_BASELINE_SCHEDULED = 4;
/** …and enough of them actually completed (a real baseline, not a plan on paper) */
const MIN_BASELINE_COMPLETED = 3;
/** enough planned opportunities in the recent week to judge it at all */
const MIN_RECENT_SCHEDULED = 2;

// ── the drop rule (§13/§L) — change-detection, not a universal target ───────
/** the baseline period was genuinely consistent … */
const BASELINE_RATE_FLOOR = 0.7;
/** … and the recent completed week clearly fell short … */
const RECENT_RATE_CEIL = 0.4;
/** … by a wide margin (percentage points) … */
const MIN_DROP_PP = 30;
/** … across more than one missed session (never fires on a single miss, §11) */
const MIN_RECENT_MISSED = 2;

export interface AdherencePeriodStat {
  start: string;
  end: string;
  scheduled: number;
  completed: number;
  missed: number;
}

export interface AdherenceSignal {
  /** deterministic — a function of client + the two period bounds, so
   *  re-deriving the same facts never yields a "new" signal. */
  id: string;
  clientId: string;
  type: 'adherence_drop';
  recent: AdherencePeriodStat;
  baseline: AdherencePeriodStat;
  /** baselineRate − recentRate, in percentage points (integer) */
  dropPct: number;
  /** provenance: "workout_history:<id>" per counted completion +
   *  "schedule:<workoutId>@<date>" per planned occurrence */
  occurrenceRefs: string[];
  /** the dated occurrence spine, ascending — hydrates L4's drill-down */
  occurrences: AdherenceOccurrence[];
  /** end of the most recent elapsed week (ISO) — drives ordering */
  observedAt: string;
  detectorVersion: string;
}

function stat(p: AdherenceFacts['recent']): AdherencePeriodStat {
  return { start: p.start, end: p.end, scheduled: p.scheduled, completed: p.completed, missed: p.missed };
}

/**
 * PURE. `AdherenceFacts | null` → 0 or 1 `adherence_drop` signal. Returns []
 * unless every minimum-evidence gate AND the drop rule pass. Deterministic.
 */
export function deriveAdherenceSignals(
  facts: AdherenceFacts | null,
  clientId: string,
): AdherenceSignal[] {
  if (!facts) return [];
  const { recent, baseline } = facts;

  // minimum evidence — no baseline ⇒ no signal (new-client protection, §15)
  if (baseline.scheduled < MIN_BASELINE_SCHEDULED) return [];
  if (baseline.completed < MIN_BASELINE_COMPLETED) return [];
  if (recent.scheduled < MIN_RECENT_SCHEDULED) return [];
  if (baseline.rate == null || recent.rate == null) return [];

  // the drop rule
  if (baseline.rate < BASELINE_RATE_FLOOR) return [];
  if (recent.rate > RECENT_RATE_CEIL) return [];
  if (recent.missed < MIN_RECENT_MISSED) return [];
  const dropPct = Math.round((baseline.rate - recent.rate) * 100);
  if (dropPct < MIN_DROP_PP) return [];

  const occurrenceRefs = [
    ...facts.occurrences
      .filter((o) => o.completionId)
      .map((o) => `workout_history:${o.completionId}`),
    ...facts.occurrences.map((o) => `schedule:${o.workoutId}@${o.date}`),
  ];

  return [
    {
      id: `adherence_drop:${clientId}:${baseline.start}_${recent.end}`,
      clientId,
      type: 'adherence_drop',
      recent: stat(recent),
      baseline: stat(baseline),
      dropPct,
      occurrenceRefs,
      occurrences: facts.occurrences,
      observedAt: `${recent.end}T23:59:59Z`,
      detectorVersion: ADHERENCE_DETECTOR_VERSION,
    },
  ];
}
