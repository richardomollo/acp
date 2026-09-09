// LANA PRO — PT INTELLIGENCE, LEVEL 3: derive signals from Level-2 evidence.
//
// PURE. No DB, no LLM, no network. Input is the exact `WorkoutFeedbackItem[]`
// the Client Progress service already produced (Level 2); output is a list of
// traceable `LanaSignal`s. Computed on read — nothing is persisted (§H).
//
// Guarantees (proven by tests, §25):
//   • the raw comment is never mutated — `sourceEvidence` === the item's
//     `comment`, byte-for-byte;
//   • a comment that matches no rule produces NO signal (no fabrication);
//   • the same evidence + classifier always yields the same signals with the
//     same ids (deterministic, idempotent);
//   • every signal carries sourceType + sourceId + observedAt +
//     classifierVersion, so the PT can always reach the raw words.

import type { WorkoutFeedbackItem } from '../lana-pro-progress/progress.ts';
import type { LanaSignal, LanaSignalType, SignalSourceType } from './types.ts';
import {
  classifyWorkoutComment,
  signalForPerceivedDifficulty,
  INCOMPLETE_VOLUME_PCT,
  CLASSIFIER_VERSION,
} from './classifier.ts';

function signalId(sourceId: string, sourceType: SignalSourceType, type: LanaSignalType): string {
  return `${sourceId}#${sourceType}#${type}`;
}

/**
 * Level 2 → Level 3. One `WorkoutFeedbackItem` can yield:
 *   • 0 or 1 comment-derived signal (from `classifyWorkoutComment`);
 *   • 0 or 1 perceived-difficulty signal (from `completionContext`);
 *   • 0 or 1 incomplete-volume signal (from `completionContext`).
 * A comment-derived signal for a given (subject, type) wins over a structured
 * one for the same (subject, type) — it carries the richer evidence.
 */
export function deriveWorkoutFeedbackSignals(
  items: readonly WorkoutFeedbackItem[],
  clientId: string,
): LanaSignal[] {
  const out: LanaSignal[] = [];
  // De-dup is PER SESSION (workout_history row), not per workout template — two
  // different sessions of the same routine that each say "too light" are two
  // signals (they are the longitudinal evidence L4 progression needs).
  const seen = new Set<string>(); // `${histId}|${subjectId ?? 'session'}|${type}`
  const histIdOf = (id: string) => id.split(':')[0];

  // ── first pass: comment-derived signals (richest evidence) ──
  for (const item of items) {
    const c = classifyWorkoutComment(item.comment);
    if (!c) continue;
    const subjectId = item.scope === 'exercise' ? item.exerciseId : undefined;
    const dedupeKey = `${histIdOf(item.id)}|${subjectId ?? 'session'}|${c.type}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      id: signalId(item.id, 'workout_feedback_comment', c.type),
      clientId,
      type: c.type,
      subjectType: item.scope,
      ...(subjectId ? { subjectId } : {}),
      workoutId: item.workoutId,
      sourceType: 'workout_feedback_comment',
      sourceId: item.id,
      sourceEvidence: item.comment, // verbatim — never rewritten
      observedAt: item.submittedAt,
      strength: 'matched_rule',
      matchedRule: c.matchedRule,
      classifierVersion: CLASSIFIER_VERSION,
    });
  }

  // ── second pass: structured self-report + computed threshold (per session).
  //    De-duplicated against the comment pass by (workout, session subject, type).
  const bySession = new Map<string, WorkoutFeedbackItem>();
  for (const item of items) {
    // one representative item per workout_history row (they share id prefix)
    const histId = item.id.split(':')[0];
    if (!bySession.has(histId)) bySession.set(histId, item);
  }
  for (const item of bySession.values()) {
    const ctx = item.completionContext;
    const histId = histIdOf(item.id);

    const pdType = signalForPerceivedDifficulty(ctx.perceivedDifficulty);
    if (pdType) {
      const key = `${histId}|session|${pdType}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: signalId(histId, 'perceived_difficulty', pdType),
          clientId,
          type: pdType,
          subjectType: 'session',
          workoutId: item.workoutId,
          sourceType: 'perceived_difficulty',
          sourceId: histId,
          sourceEvidence: `perceived_difficulty=${ctx.perceivedDifficulty}`,
          observedAt: item.submittedAt,
          strength: 'explicit_self_report',
          classifierVersion: CLASSIFIER_VERSION,
        });
      }
    }

    if (ctx.completionPercentage != null && ctx.completionPercentage < INCOMPLETE_VOLUME_PCT) {
      const key = `${histId}|session|incomplete_volume`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          id: signalId(histId, 'completion_percentage', 'incomplete_volume'),
          clientId,
          type: 'incomplete_volume',
          subjectType: 'session',
          workoutId: item.workoutId,
          sourceType: 'completion_percentage',
          sourceId: histId,
          sourceEvidence: `completion_percentage=${Math.round(ctx.completionPercentage)}`,
          observedAt: item.submittedAt,
          strength: 'computed_threshold',
          classifierVersion: CLASSIFIER_VERSION,
        });
      }
    }
  }

  // newest first, then a stable type tiebreak
  out.sort((a, b) => (a.observedAt === b.observedAt ? a.type.localeCompare(b.type) : b.observedAt.localeCompare(a.observedAt)));
  return out;
}
