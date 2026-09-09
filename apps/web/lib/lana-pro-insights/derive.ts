// LANA PRO — PT INTELLIGENCE, LEVEL 4: derive PT Insights (V1).
//
// PURE. No DB read/write, no LLM, no network, mutates nothing. Operates ONLY
// on data Client Progress already loaded (L1/L2) + the L3 signals derived from
// it. Deterministic: same inputs → identical output, identical ids.
//
// Two families only:
//   • discomfort  — immediate; ONE pain/discomfort report is enough (§4).
//   • progression — longitudinal; ≥2 supporting signals across ≥2 distinct
//                   qualifying sessions, safely groupable to one subject (§7-10).
//
// This is "LANA OBSERVED" — a pattern statement. It is NOT a recommendation
// (no load/volume/programme advice) and NOT a diagnosis (§4/§9/§22).

import type { WorkoutFeedbackItem } from '../lana-pro-progress/progress.ts';
import type { LanaSignal } from '../lana-pro-signals/types.ts';
import type { AdherenceSignal } from '../lana-pro-signals/adherence.ts';
import type {
  PTInsight,
  PTInsightEvidence,
  PTInsightStrength,
  PTInsightSubject,
} from './types.ts';
import { INCOMPLETE_VOLUME_PCT } from '../lana-pro-signals/classifier.ts';

export interface DerivePTInsightsInput {
  clientId: string;
  clientName: string;
  /** progress.workoutFeedback — verbatim L2 evidence, already consent-gated */
  feedback: readonly WorkoutFeedbackItem[];
  /** deriveWorkoutFeedbackSignals(feedback, clientId) — L3 */
  signals: readonly LanaSignal[];
  /** deriveAdherenceSignals(progress.adherence, clientId) — L3 (structured,
   *  NOT from comments). Optional; defaults to none. */
  adherenceSignals?: readonly AdherenceSignal[];
}

const DISCOMFORT_TYPES = new Set(['pain_reported', 'discomfort_reported']);
const PROGRESSION_TYPES = new Set(['progression_candidate', 'perceived_difficulty_low']);

/** the workout_history row id behind a feedback / signal source id */
function histIdOf(sourceId: string): string {
  return sourceId.split(':')[0];
}

/**
 * PT-facing label for a raw `workouts.category` value. Deterministic
 * formatting of the STORED value only — never a new taxonomy, never inferred:
 * `upper_body` → "upper-body", `full_body` → "full-body", `push` → "push".
 * Used lowercase mid-sentence in the progression statement.
 */
export function workoutCategoryLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function firstName(name: string): string {
  return (name || 'The client').trim().split(/\s+/)[0] || 'The client';
}

function evidenceOf(fb: WorkoutFeedbackItem): PTInsightEvidence {
  return {
    feedbackId: fb.id,
    comment: fb.comment, // verbatim — never rewritten
    workoutTitle: fb.workoutTitle,
    ...(fb.exerciseName ? { exerciseName: fb.exerciseName } : {}),
    date: fb.scheduledDate,
  };
}

function progressionStrength(sessionCount: number): PTInsightStrength {
  if (sessionCount >= 4) return 'strong';
  if (sessionCount === 3) return 'consistent';
  return 'emerging'; // 2
}

/** A session "successfully / meaningfully completed" — reuses the SINGLE
 *  existing completion threshold (classifier.INCOMPLETE_VOLUME_PCT); no new,
 *  contradictory definition (§8). */
function sessionMeaningfullyCompleted(items: WorkoutFeedbackItem[]): boolean {
  return items.some((it) => {
    const c = it.completionContext;
    return c.status === 'completed' && (c.completionPercentage == null || c.completionPercentage >= INCOMPLETE_VOLUME_PCT);
  });
}

export function derivePTInsights(input: DerivePTInsightsInput): PTInsight[] {
  const { clientId, clientName, feedback, signals } = input;
  const adherenceSignals = input.adherenceSignals ?? [];
  const name = firstName(clientName);

  const fbById = new Map<string, WorkoutFeedbackItem>(feedback.map((f) => [f.id, f]));
  const fbByHist = new Map<string, WorkoutFeedbackItem[]>();
  for (const f of feedback) {
    const h = histIdOf(f.id);
    (fbByHist.get(h) ?? fbByHist.set(h, []).get(h)!).push(f);
  }

  const out: PTInsight[] = [];

  // ═══ DISCOMFORT ═══ (safety-first: one report is enough) ═══════════════════
  const discomfortSignals = signals.filter((s) => DISCOMFORT_TYPES.has(s.type));
  const discomfortHistIds = new Set(discomfortSignals.map((s) => histIdOf(s.sourceId)));

  // group by the most reliable subject: exercise id, else the workout
  const dGroups = new Map<string, LanaSignal[]>();
  for (const s of discomfortSignals) {
    const key = s.subjectType === 'exercise' && s.subjectId ? `exercise:${s.subjectId}` : `workout:${s.workoutId}`;
    (dGroups.get(key) ?? dGroups.set(key, []).get(key)!).push(s);
  }

  for (const [subjectKey, group] of dGroups) {
    const sorted = [...group].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const primary = sorted[0];
    const primaryFb = fbById.get(primary.sourceId) ?? fbByHist.get(histIdOf(primary.sourceId))?.[0];
    if (!primaryFb) continue;

    const hasPain = group.some((s) => s.type === 'pain_reported');
    const word = hasPain ? 'pain' : 'discomfort';

    const isExercise = subjectKey.startsWith('exercise:');
    const subject: PTInsightSubject = isExercise
      ? { kind: 'exercise', id: primary.subjectId, label: primaryFb.exerciseName ?? null }
      : { kind: 'workout', id: primary.workoutId, label: primaryFb.workoutTitle };

    // Pronoun-neutral: never infers he/she/they from a name (§7).
    const statement = subject.label && isExercise
      ? `${name} reported ${word} during ${subject.label} in the most recent workout.`
      : `${name} reported ${word} in the most recent workout.`;

    const evItems = sorted
      .map((s) => fbById.get(s.sourceId) ?? fbByHist.get(histIdOf(s.sourceId))?.[0])
      .filter((f): f is WorkoutFeedbackItem => !!f);
    const seenEv = new Set<string>();
    const evidence = evItems.filter((f) => (seenEv.has(f.id) ? false : (seenEv.add(f.id), true))).map(evidenceOf);

    const histIds = [...new Set(group.map((s) => histIdOf(s.sourceId)))].sort();
    const dates = evidence.map((e) => e.date).sort();

    out.push({
      id: `discomfort:${subjectKey}:${histIds.join('+')}`,
      clientId,
      family: 'discomfort',
      subject,
      window: { kind: 'session', sessionCount: histIds.length, from: dates[0] ?? primaryFb.scheduledDate, to: dates[dates.length - 1] ?? primaryFb.scheduledDate },
      evidenceIds: evidence.map((e) => e.feedbackId),
      signalIds: group.map((s) => s.id),
      progressRefs: histIds.map((h) => `workout_history:${h}`),
      strength: null,
      descriptor: word, // 'pain' | 'discomfort' — exposed for L5 (§8)
      title: 'Discomfort reported',
      statement,
      observedAt: primary.observedAt,
      evidence,
    });
  }

  // ═══ PROGRESSION ═══ (longitudinal; §6 — exclude any session that also
  //    produced a pain/discomfort signal) ═════════════════════════════════════
  const progSignals = signals.filter(
    (s) => PROGRESSION_TYPES.has(s.type) && !discomfortHistIds.has(histIdOf(s.sourceId)),
  );
  const incompleteHistIds = new Set(
    signals.filter((s) => s.type === 'incomplete_volume').map((s) => histIdOf(s.sourceId)),
  );

  // qualifying sessions: a progression signal, no incomplete_volume, meaningfully completed
  const bySession = new Map<string, LanaSignal[]>();
  for (const s of progSignals) {
    const h = histIdOf(s.sourceId);
    (bySession.get(h) ?? bySession.set(h, []).get(h)!).push(s);
  }
  const qualifying: { histId: string; sigs: LanaSignal[]; items: WorkoutFeedbackItem[] }[] = [];
  for (const [histId, sigs] of bySession) {
    if (incompleteHistIds.has(histId)) continue;
    const items = fbByHist.get(histId) ?? [];
    if (!sessionMeaningfullyCompleted(items)) continue;
    qualifying.push({ histId, sigs, items });
  }

  const qualifyingSignalCount = qualifying.reduce((n, q) => n + q.sigs.length, 0);
  if (qualifying.length >= 2 && qualifyingSignalCount >= 2) {
    // ── safe subject grouping (§10) ──
    const allSigs = qualifying.flatMap((q) => q.sigs);
    const allExercise = allSigs.every((s) => s.subjectType === 'exercise' && s.subjectId);
    const exIds = new Set(allSigs.map((s) => s.subjectId));
    const titlesNorm = new Set(qualifying.map((q) => (q.items[0]?.workoutTitle ?? '').trim().toLowerCase()).filter(Boolean));

    // grouping priority (§10): exercise → canonical workout category →
    // exact normalized workout title → otherwise no insight.
    const categories = new Set(
      qualifying.map((q) => q.items[0]?.workoutCategory?.trim()).filter((c): c is string => !!c),
    );
    const everySessionHasCategory = qualifying.every((q) => !!q.items[0]?.workoutCategory?.trim());

    let subject: PTInsightSubject | null = null;
    if (allExercise && exIds.size === 1) {
      const exId = [...exIds][0]!;
      const label = qualifying.flatMap((q) => q.items).find((it) => it.exerciseId === exId)?.exerciseName ?? null;
      subject = { kind: 'exercise', id: exId, label };
    } else if (everySessionHasCategory && categories.size === 1) {
      const raw = [...categories][0]!;
      subject = { kind: 'category', id: raw, label: workoutCategoryLabel(raw) };
    } else if (titlesNorm.size === 1) {
      const workoutIds = new Set(qualifying.map((q) => q.items[0]?.workoutId).filter(Boolean));
      const label = qualifying.map((q) => q.items[0]?.workoutTitle).find(Boolean) ?? null;
      subject = { kind: 'workout', ...(workoutIds.size === 1 ? { id: [...workoutIds][0] as string } : {}), label };
    }
    // else: evidence spans unrelated subjects → NO insight (§10)

    if (subject && subject.label) {
      const sortedSessions = [...qualifying].sort(
        (a, b) => (a.items[0]?.scheduledDate ?? '').localeCompare(b.items[0]?.scheduledDate ?? ''),
      );
      const commentEvidence = sortedSessions
        .flatMap((q) => q.sigs)
        .filter((s) => s.sourceType === 'workout_feedback_comment')
        .map((s) => fbById.get(s.sourceId))
        .filter((f): f is WorkoutFeedbackItem => !!f);
      const seen = new Set<string>();
      const evidence = commentEvidence
        .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
        .map(evidenceOf);

      const histIds = sortedSessions.map((q) => q.histId).sort();
      const dates = sortedSessions.map((q) => q.items[0]?.scheduledDate ?? '').filter(Boolean);
      const newestObservedAt = allSigs
        .map((s) => s.observedAt)
        .sort((a, b) => b.localeCompare(a))[0];

      out.push({
        id: `progression:${subject.kind}:${subject.id ?? subject.label}:${histIds.join('+')}`,
        clientId,
        family: 'progression',
        subject,
        window: {
          kind: 'recent_sessions',
          sessionCount: qualifying.length,
          from: dates[0] ?? '',
          to: dates[dates.length - 1] ?? '',
        },
        evidenceIds: evidence.map((e) => e.feedbackId),
        signalIds: allSigs.map((s) => s.id),
        progressRefs: histIds.map((h) => `workout_history:${h}`),
        strength: progressionStrength(qualifying.length),
        title: 'Progression worth reviewing',
        statement: `${name} has consistently completed recent ${subject.label} sessions and repeatedly indicated that the prescribed work feels manageable.`,
        observedAt: newestObservedAt,
        evidence,
      });
    }
  }

  // ═══ ADHERENCE ═══ (structured L3 → L4; §18/§19 — describe the pattern,
  //    never a cause) ═════════════════════════════════════════════════════════
  for (const sig of adherenceSignals) {
    if (sig.type !== 'adherence_drop') continue;
    const r = sig.recent;
    const b = sig.baseline;
    const sess = (n: number) => (n === 1 ? 'session' : 'sessions');
    out.push({
      id: `adherence:${sig.id}`,
      clientId,
      family: 'adherence',
      subject: { kind: 'overall', label: null },
      window: { kind: 'recent_sessions', sessionCount: r.scheduled + b.scheduled, from: b.start, to: r.end },
      evidenceIds: [],
      signalIds: [sig.id],
      progressRefs: sig.occurrenceRefs.filter((x) => x.startsWith('workout_history:')),
      strength: null,
      title: 'Training consistency has dropped',
      // factual comparison only — no "motivation" / "disengaged" / "struggling"
      statement: `${name} completed ${r.completed} of ${r.scheduled} scheduled ${sess(r.scheduled)} in the most recent completed week, compared with ${b.completed} of ${b.scheduled} across the previous two weeks.`,
      observedAt: sig.observedAt,
      evidence: [],
      occurrences: sig.occurrences.map((o) => ({
        date: o.date,
        workoutTitle: o.workoutTitle,
        status: o.status,
        period: o.period,
      })),
    });
  }

  // discomfort (safety) first, then adherence, then progression; newest first
  // within a family. Adherence & progression are both "review" downstream — the
  // family rank IS the deterministic tie-break, no severity invented (§25).
  const familyRank: Record<string, number> = { discomfort: 0, adherence: 1, progression: 2 };
  out.sort((a, b) =>
    familyRank[a.family] !== familyRank[b.family]
      ? familyRank[a.family] - familyRank[b.family]
      : b.observedAt.localeCompare(a.observedAt),
  );
  return out;
}
