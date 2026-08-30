// ACP Intelligence™ Day 8.4 — Progress & "ACP noticed" explanation.
//
// Pure. Composes the EXISTING coaching_memory / outcome-intelligence
// selectors (lib/coaching-memory.ts) into the section-25 user-facing
// hierarchy. It does NOT compute any trend itself — every number and every
// pattern already came from the server-side longitudinal engine. No causal
// language, no medical inference, no invented trends.

import type { CoachingMemoryRow } from '../coaching-memory.ts';
import {
  formatOverallProgress,
  selectOutcomeInsights,
  selectTopInsights,
  selectExecutionInsights,
  formatOutcomeEvidenceLine,
  formatEvidenceLine,
  pickHomeInsight,
  pickExecutionNoticed,
} from '../coaching-memory.ts';
import type { ProgressExplanation, CoachingEvidence } from './types.ts';

const POSITIVE_OUTCOME_DIRECTIONS = new Set(['outcome_progressing', 'body_composition_progressing']);

export interface ProgressExplanationInput {
  coachingMemory: CoachingMemoryRow[];
  /** Optional current-week completion, when the caller already has it. */
  weeklyProgress?: { completed: number; total: number } | null;
}

export function buildProgressExplanation(input: ProgressExplanationInput): ProgressExplanation {
  const { coachingMemory, weeklyProgress } = input;
  const items: CoachingEvidence[] = [];

  // 1 — goal-relevant outcome evidence (positive first, then any other read).
  const outcomeRows = selectOutcomeInsights(coachingMemory, 2);
  const orderedOutcome = [
    ...outcomeRows.filter(r => POSITIVE_OUTCOME_DIRECTIONS.has((r.evidence as { direction?: string })?.direction ?? '')),
    ...outcomeRows.filter(r => !POSITIVE_OUTCOME_DIRECTIONS.has((r.evidence as { direction?: string })?.direction ?? '')),
  ];
  for (const row of orderedOutcome) {
    if (!row.user_message) continue;
    const line = formatOutcomeEvidenceLine(row);
    items.push({
      text: line ? `${row.user_message} (${line}).` : `${row.user_message}.`,
      provenance: { source: 'outcome', detail: 'measurement_trend' },
    });
  }

  // 2 — behavioural consistency (from the one overall_summary row).
  const overall = formatOverallProgress(coachingMemory);
  if (overall && overall.planned > 0 && overall.trendDirection !== 'insufficient_data') {
    const base = `Across your last ${overall.planned} planned activities, you completed ${overall.completed}.`;
    items.push({
      text: overall.trendDirection === 'improving' ? `${base} Your consistency has been improving.` : base,
      provenance: { source: 'behaviour', detail: 'consistency', values: { planned: overall.planned, completed: overall.completed, trend: overall.trendDirection } },
    });
  }

  // 3 — this week's plan completion.
  if (weeklyProgress && weeklyProgress.total > 0) {
    items.push({
      text: `This week you have completed ${weeklyProgress.completed} of ${weeklyProgress.total} planned activities so far.`,
      provenance: { source: 'behaviour', detail: 'week_progress', values: { completed: weeklyProgress.completed, total: weeklyProgress.total } },
    });
  }

  // 4 — useful coaching patterns (success only; moderate/strong; from memory).
  for (const row of selectTopInsights(coachingMemory, 3).filter(r => r.memory_type.endsWith('_success'))) {
    if (!row.user_message) continue;
    const line = formatEvidenceLine(row);
    items.push({
      text: line ? `${row.user_message} (${line}).` : `${row.user_message}.`,
      provenance: { source: 'memory', detail: 'success_pattern' },
    });
  }

  // 5 — Day 9 repeated execution patterns (difficulty-fit / time-fit).
  for (const row of selectExecutionInsights(coachingMemory, 2)) {
    if (!row.user_message) continue;
    items.push({ text: row.user_message, provenance: { source: 'memory', detail: 'execution_pattern' } });
  }

  // "ACP noticed" prefers an execution pattern (the natural destination for
  // execution memory — section 42), then the behavioural pattern.
  const noticedInsight = pickExecutionNoticed(coachingMemory) ?? pickHomeInsight(coachingMemory);
  const noticed = noticedInsight ? { headline: noticedInsight.headline, body: noticedInsight.body } : null;

  return {
    items,
    noticed,
    insufficientData: items.length === 0 && noticed === null,
  };
}
