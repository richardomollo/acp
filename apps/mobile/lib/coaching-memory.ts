// Day 6 — ACP Intelligence™ coaching memory, mobile side. This file NEVER
// aggregates anything itself — all deterministic longitudinal computation
// happens server-side (apps/web/app/api/ai/weekly-adaptation/longitudinal.ts)
// during weekly adaptation, and is persisted to the coaching_memory table.
// My Plan and Home just SELECT the already-computed rows and use the small,
// pure helpers below to select/format what to display — no recomputation,
// no extra historical queries.
export type CoachingConfidence = 'emerging' | 'moderate' | 'strong';

export interface CoachingMemoryRow {
  memory_type: string;
  subject: string;
  confidence: CoachingConfidence;
  evidence: unknown;
  user_message: string | null;
}

export interface OverallProgress {
  weeksUsed: number;
  planned: number;
  completed: number;
  completionRate: number; // 0-1
  trendDirection: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  trendEvidence: string;
}

/** The one 'overall_summary' row, reshaped for display. Null if it doesn't exist yet (no completed week). */
export function formatOverallProgress(rows: CoachingMemoryRow[]): OverallProgress | null {
  const row = rows.find(r => r.memory_type === 'overall_summary');
  if (!row) return null;
  const e = row.evidence as {
    window?: { weeks_used?: number };
    overall?: { planned_sessions?: number; completed_sessions?: number; completion_rate?: number };
    trend?: { direction?: string; evidence?: string };
  };
  return {
    weeksUsed: e.window?.weeks_used ?? 0,
    planned: e.overall?.planned_sessions ?? 0,
    completed: e.overall?.completed_sessions ?? 0,
    completionRate: e.overall?.completion_rate ?? 0,
    trendDirection: (e.trend?.direction as OverallProgress['trendDirection']) ?? 'insufficient_data',
    trendEvidence: e.trend?.evidence ?? '',
  };
}

const SUCCESS_TYPES = new Set(['category_success', 'day_success', 'duration_success']);
const DIFFICULTY_TYPES = new Set(['category_difficulty', 'day_difficulty', 'duration_difficulty']);
const CONFIDENCE_RANK: Record<CoachingConfidence, number> = { strong: 2, moderate: 1, emerging: 0 };

function evidenceRate(row: CoachingMemoryRow): number {
  return (row.evidence as { rate?: number })?.rate ?? 0;
}

/**
 * Up to `max` behavioural pattern rows for "WHAT'S WORKING"/"WHAT ACP IS
 * LEARNING" — moderate+strong confidence only (emerging stays internal,
 * never shown as a fact yet), strongest first, positive patterns ranked
 * ahead of a same-confidence difficulty pattern (section 40's priority:
 * strong positive first, then actionable difficulty). Never includes
 * 'overall_summary' or the persistence-fact rows — those render separately.
 */
export function selectTopInsights(rows: CoachingMemoryRow[], max = 3): CoachingMemoryRow[] {
  return rows
    .filter(r => (SUCCESS_TYPES.has(r.memory_type) || DIFFICULTY_TYPES.has(r.memory_type)) && r.confidence !== 'emerging')
    .sort((a, b) => {
      const confDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (confDiff !== 0) return confDiff;
      const aSuccess = SUCCESS_TYPES.has(a.memory_type) ? 1 : 0;
      const bSuccess = SUCCESS_TYPES.has(b.memory_type) ? 1 : 0;
      if (aSuccess !== bSuccess) return bSuccess - aSuccess;
      // Same confidence tier, same success/difficulty-ness — more extreme evidence first.
      return aSuccess ? evidenceRate(b) - evidenceRate(a) : evidenceRate(a) - evidenceRate(b);
    })
    .slice(0, max);
}

/** A compact, factual "N of M planned sessions completed" line — never invented, always from the row's own evidence. */
export function formatEvidenceLine(row: CoachingMemoryRow): string | null {
  const e = row.evidence as { planned?: number; completed?: number };
  if (typeof e.planned !== 'number' || typeof e.completed !== 'number') return null;
  return `${e.completed} of ${e.planned} planned sessions completed`;
}

export interface HomeCoachingInsight { headline: string; body: string }

/**
 * Home only ever shows ONE, always positively-framed insight (never a
 * difficulty pattern — that stays on My Plan's "WHAT ACP IS LEARNING",
 * where the fuller context belongs). Prefers an improving overall trend,
 * then the strongest success pattern; null if neither is available, which
 * leaves Home's existing insight slot to fall back to its own branches.
 */
// Day 6.5 — Outcome Intelligence. A separate family from the behavioural
// SUCCESS_TYPES/DIFFICULTY_TYPES above: one generic memory_type
// ('outcome_progress') per metric, with the specific read (progressing/
// stable/away/body-composition) carried in evidence.direction rather than
// the type itself (see apps/web .../longitudinal.ts resolveMemorySync).
// Kept in its own functions so outcome evidence is never mixed into
// selectTopInsights/pickHomeInsight's behavioural-only selection.
const OUTCOME_POSITIVE_DIRECTIONS = new Set(['outcome_progressing', 'body_composition_progressing']);

/** A compact, factual "first -> latest over N check-ins" line for an outcome row — never invented, always from its own evidence. */
export function formatOutcomeEvidenceLine(row: CoachingMemoryRow): string | null {
  const e = row.evidence as { first?: number; latest?: number; observations?: number };
  if (typeof e.first !== 'number' || typeof e.latest !== 'number') return null;
  return `${e.first} → ${e.latest} over ${e.observations ?? 0} check-ins`;
}

/** Up to `max` outcome rows (moderate+strong only) for My Plan's separate "Outcome progress" section — any direction, so a flat/away trend is shown just as factually as a positive one. */
export function selectOutcomeInsights(rows: CoachingMemoryRow[], max = 2): CoachingMemoryRow[] {
  return rows
    .filter(r => r.memory_type === 'outcome_progress' && r.confidence !== 'emerging')
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
    .slice(0, max);
}

/** My Goals' single optional outcome insight (section 28) — only ever the strongest POSITIVE outcome direction, moderate+strong only; null otherwise (never a flat/away trend shown here, that's My Plan's job). */
export function pickOutcomeInsight(rows: CoachingMemoryRow[]): HomeCoachingInsight | null {
  const positive = rows
    .filter(r => r.memory_type === 'outcome_progress' && r.confidence !== 'emerging'
      && OUTCOME_POSITIVE_DIRECTIONS.has((r.evidence as { direction?: string })?.direction ?? ''))
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])[0];
  if (positive?.user_message) {
    return { headline: positive.user_message, body: formatOutcomeEvidenceLine(positive) ?? '' };
  }
  return null;
}

export function pickHomeInsight(rows: CoachingMemoryRow[]): HomeCoachingInsight | null {
  const overall = formatOverallProgress(rows);
  if (overall && overall.trendDirection === 'improving' && overall.planned > 0) {
    return {
      headline: "You're building consistency",
      body: `${overall.completed} of your last ${overall.planned} planned activities completed.`,
    };
  }

  const topSuccess = rows
    .filter(r => SUCCESS_TYPES.has(r.memory_type) && r.confidence !== 'emerging')
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])[0];
  if (topSuccess?.user_message) {
    return { headline: topSuccess.user_message, body: formatEvidenceLine(topSuccess) ?? '' };
  }

  return null;
}
