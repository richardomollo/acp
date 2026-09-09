// LANA PRO — PT INTELLIGENCE, LEVEL 5: derive Suggested Coaching Actions (V1).
//
// PURE. No DB read/write, no LLM, no network, no navigation, mutates nothing.
// Operates ONLY on the L4 PTInsight[] that `derivePTInsights` already produced
// from consent-gated evidence. Deterministic: same insights → identical
// output, identical ids.
//
// One qualifying insight → at most ONE action (§12). No action without an
// insight (§21). Never prescriptive (§5) — this maps a pattern to a review
// prompt and stops. The PT makes the coaching decision (§42).

import type { PTInsight } from '../lana-pro-insights/types.ts';
import type {
  SuggestedCoachingAction,
  SuggestedCoachingActionFamily,
} from './types.ts';

export interface DeriveSuggestedCoachingActionsInput {
  clientId: string;
  clientName: string;
  /** derivePTInsights(...) output — already consent-gated, already deduped */
  insights: readonly PTInsight[];
}

/** First name for possessive phrasing; mirrors the L4 helper exactly so the
 *  two layers speak about the client identically. */
function firstName(name: string): string {
  return (name || 'The client').trim().split(/\s+/)[0] || 'The client';
}

// safety-relevant review first; execution (adherence) before performance
// optimisation (progression). Deterministic family rank — no severity (§25).
const FAMILY_RANK: Record<SuggestedCoachingActionFamily, number> = {
  discomfort_review: 0,
  adherence_review: 1,
  progression_review: 2,
};

/** L4 `discomfort` → one advisory human-review prompt. Never infers injury,
 *  diagnosis, severity, cause, treatment, referral or contraindication (§7). */
function discomfortAction(
  insight: PTInsight,
  clientId: string,
  first: string,
): SuggestedCoachingAction {
  // 'pain' iff a pain_reported signal backs the insight, else 'discomfort' —
  // the factual wording L4 already chose (§8). Never becomes "injury".
  const word = insight.descriptor === 'pain' ? 'pain' : 'discomfort';

  // Pronoun-neutral phrasing — no he/she/they inferred from the name (§7).
  const statement =
    insight.subject.kind === 'exercise' && insight.subject.label
      ? `Check in with ${first} about the reported ${word} during ${insight.subject.label} before the next relevant training session.`
      : `Review this feedback with ${first} before the next relevant training session.`;

  return {
    id: `discomfort_review:${insight.id}`,
    clientId,
    insightId: insight.id,
    family: 'discomfort_review',
    priority: 'attention',
    title: 'Review client feedback',
    statement,
    createdFrom: insight.title,
    evidenceIds: [...insight.evidenceIds],
  };
}

/** L4 `adherence` → one advisory check-in prompt. Lana knows consistency
 *  changed, NOT why — so the wording stays at "the recent change in training
 *  consistency" and never prescribes a fix (fewer sessions, weekends, shorter
 *  workouts, reminders, "needs motivation") — §22/§23/§24. */
function adherenceAction(
  insight: PTInsight,
  clientId: string,
  first: string,
): SuggestedCoachingAction {
  return {
    id: `adherence_review:${insight.id}`,
    clientId,
    insightId: insight.id,
    family: 'adherence_review',
    priority: 'review',
    title: 'Check in on training consistency',
    statement: `Consider checking in with ${first} about the recent change in training consistency.`,
    createdFrom: insight.title,
    evidenceIds: [...insight.evidenceIds],
  };
}

/** L4 `progression` → one advisory review prompt. Names the block/exercise to
 *  look at; never prescribes load, sets, reps, volume, frequency or an
 *  exercise swap (§9). "Consider reviewing …" is the ceiling for V1. */
function progressionAction(
  insight: PTInsight,
  clientId: string,
  first: string,
): SuggestedCoachingAction {
  const label = insight.subject.label;
  let statement: string;
  switch (insight.subject.kind) {
    case 'category':
      // label is the human category, e.g. "upper-body"
      statement = `Consider reviewing whether progression is appropriate for ${first}'s next ${label} training block.`;
      break;
    case 'exercise':
      statement = `Consider reviewing whether progression is appropriate for ${first}'s ${label}.`;
      break;
    case 'workout':
      statement = `Consider reviewing progression for ${first}'s ${label} sessions.`;
      break;
    default:
      // 'overall' / no reliable label — stay general, still advisory
      statement = `Consider reviewing whether progression is appropriate for ${first}'s next training block.`;
  }

  return {
    id: `progression_review:${insight.id}`,
    clientId,
    insightId: insight.id,
    family: 'progression_review',
    priority: 'review',
    title: 'Review progression',
    statement,
    createdFrom: insight.title,
    evidenceIds: [...insight.evidenceIds],
  };
}

export function deriveSuggestedCoachingActions(
  input: DeriveSuggestedCoachingActionsInput,
): SuggestedCoachingAction[] {
  const { clientId, clientName, insights } = input;
  const first = firstName(clientName);

  const out: SuggestedCoachingAction[] = [];
  const seen = new Set<string>(); // deterministic-id de-dupe (§13)

  for (const insight of insights) {
    let action: SuggestedCoachingAction | null = null;
    if (insight.family === 'discomfort') action = discomfortAction(insight, clientId, first);
    else if (insight.family === 'adherence') action = adherenceAction(insight, clientId, first);
    else if (insight.family === 'progression') action = progressionAction(insight, clientId, first);
    // any other family: no L5 action in V1
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }

  // Ordering (§14/§25): discomfort_review → adherence_review → progression_review.
  // Within a family the L4 input order (newest-first) is preserved — Array.sort
  // is stable, and we invent NO severity ranking.
  out.sort((a, b) => FAMILY_RANK[a.family] - FAMILY_RANK[b.family]);
  return out;
}
