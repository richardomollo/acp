// LANA PRO — PT INTELLIGENCE, LEVEL 3: the canonical deterministic
// workout-comment classifier.
//
// ZERO LLM. A pure function of one string. It maps a client's verbatim
// workout comment to at most ONE LanaSignalType, or null when nothing is
// clearly supported (§6 — never fabricate a signal, never over-specify).
//
// ── ONE ruleset, two implementations ──────────────────────────────────────
// The consumer app has a sibling classifier — apps/mobile/lib/
// workout-session-summary.ts `classifyExerciseNote` — used for the immediate
// post-session recap. The monorepo has no live shared-package mechanism
// (packages/* is not in the workspace), so the two cannot import a common
// file today. They are kept as ONE ruleset by making the regexes below the
// spec and covering the mapping with tests. Physically sharing this (a
// `packages/lana-workout-feedback` domain module both apps consume) is a
// tracked infra follow-up — see the architecture report §R/§W.
//
// Rule order is deliberate and SAFETY-FIRST: pain / discomfort win over
// everything else, even if the same comment also says "too heavy".

import type { LanaSignalType } from './types.ts';

/** Bump when the rules change; historical signals keep the version that made
 *  them so a later re-classification is distinguishable (§22). */
export const CLASSIFIER_VERSION = 'workout-feedback-v1';

export interface CommentClassification {
  type: LanaSignalType;
  /** the rule key that fired — surfaced as `LanaSignal.matchedRule` for the
   *  "why?" drill-down (§7) */
  matchedRule: string;
}

// Ordered rules. First match wins.
const RULES: { key: string; re: RegExp; type: LanaSignalType }[] = [
  // ── 1. PAIN — the most conservative, evidence-preserving path (§15) ──
  {
    key: 'pain_sharp',
    re: /\b(sharp|shooting|stabbing)\s+(pain|ache)\b|\bsharp\s+pain\b|\bacute\s+pain\b/i,
    type: 'pain_reported',
  },
  // ── 2. DISCOMFORT — hurt / ache / sore / generic pain / tweak / pinch ──
  {
    key: 'discomfort',
    re: /\b(hurts?|hurting|painful|\bpain\b|ache[sd]?|aching|sore(ness)?|tweak\w*|pulled|pinch\w*|twinge|strain\w*|numb\b|dizz\w*)\b/i,
    type: 'discomfort_reported',
  },
  // ── 3. TIME CONSTRAINT — "only had 30 minutes", "ran out of time" ──
  {
    key: 'time_constraint',
    re: /\b(only had|ran out of time|short on time|no time|not much time|out of time|rushed|had to rush|pressed for time|(\d+)\s*min(ute)?s?\b.*\b(only|left|had))\b|\bonly\s+\d+\s*min/i,
    type: 'time_constraint',
  },
  // ── 4. INCOMPLETE VOLUME — "couldn't finish", "skipped the last two" ──
  {
    key: 'incomplete_volume',
    re: /\b(could ?n'?t finish|couldn ?not finish|didn'?t finish|did not finish|couldn'?t complete|skipped (the )?(last|final|a few|two|three)|had to stop|cut it short|missed (the )?(last|final)|didn'?t get through)\b/i,
    type: 'incomplete_volume',
  },
  // ── 5. PROGRESSION — explicit "too light" / "go heavier" / "more reps" ──
  {
    key: 'progression_candidate',
    re: /\b(too light|go(ing)? heavier|heavier next|add(ing)? (weight|load|reps)|more weight|increase (the )?(weight|load)|could (have )?done more|ready (to|for) more|bump (the )?weight|level up)\b/i,
    type: 'progression_candidate',
  },
  // ── 6. PERCEIVED DIFFICULTY (from free text) ──
  {
    key: 'too_hard',
    re: /\b(too hard|too heavy|struggled|failed the|couldn'?t keep up|brutal|killed me|way too much|really hard|way too heavy)\b/i,
    type: 'perceived_difficulty_high',
  },
  {
    key: 'too_easy',
    re: /\b(too easy|felt easy|no challenge|not challenging|barely felt|way too easy|piece of cake|felt light|felt good and easy)\b/i,
    type: 'perceived_difficulty_low',
  },
  // ── 7. EXERCISE RESPONSE / PREFERENCE ──
  {
    key: 'dislike',
    re: /\b(hate[sd]?|dislike[sd]?|can'?t stand|can not stand|not a fan|loathe|despise)\b/i,
    type: 'exercise_dislike',
  },
  {
    key: 'preference',
    re: /\b(love[sd]?|really enjoy(ed)?|favou?rite|felt great|felt really good|felt strong|nailed (it|these)|these are great)\b/i,
    type: 'exercise_preference',
  },
  {
    key: 'positive_response',
    re: /\b(went well|good session|felt solid|happy with (this|that|these)|moving well)\b/i,
    type: 'positive_response',
  },
  {
    key: 'negative_response',
    re: /\b(off day|not feeling it|rough session|bad session|felt flat|no energy|drained)\b/i,
    type: 'negative_response',
  },
  // ── 8. TECHNIQUE / FIT ──
  {
    key: 'technique_or_fit',
    re: /\bcould ?n'?t\s+(\w+\s+){0,2}feel\b|\bdidn'?t\s+(\w+\s+){0,2}feel it\b|\bform (was )?off\b|\blost balance\b|\bgrip (gave|failed)\b|\brange of motion\b|\bfelt it in the wrong\b|\bawkward (position|angle)\b|\bdidn'?t feel right\b|\bno mind[- ]muscle\b/i,
    type: 'technique_or_fit_issue',
  },
];

/**
 * Classify one verbatim workout comment. Returns `null` when the comment does
 * not clearly match a rule — the caller must NOT invent a signal in that case
 * (the raw comment still stands on its own as Level-2 evidence).
 */
export function classifyWorkoutComment(text: string): CommentClassification | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.re.test(t)) return { type: rule.type, matchedRule: rule.key };
  }
  return null;
}

/** The structured perceived-difficulty self-report → a signal type. */
export function signalForPerceivedDifficulty(
  value: 'easy' | 'about_right' | 'difficult' | null | undefined,
): LanaSignalType | null {
  if (value === 'easy') return 'perceived_difficulty_low';
  if (value === 'difficult') return 'perceived_difficulty_high';
  return null; // 'about_right' / unknown → no signal
}

/** Completion percentage below this (and known) → an incomplete-volume signal. */
export const INCOMPLETE_VOLUME_PCT = 70;
