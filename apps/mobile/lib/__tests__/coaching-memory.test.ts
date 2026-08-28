import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOverallProgress, selectTopInsights, formatEvidenceLine, pickHomeInsight,
  selectOutcomeInsights, pickOutcomeInsight, formatOutcomeEvidenceLine,
  type CoachingMemoryRow,
} from '../coaching-memory.ts';

function row(overrides: Partial<CoachingMemoryRow> = {}): CoachingMemoryRow {
  return { memory_type: 'category_success', subject: 'strength', confidence: 'strong', evidence: { planned: 8, completed: 7, rate: 0.875, weeks: 4 }, user_message: 'Strength has been one of your most consistent activities.', ...overrides };
}

describe('formatOverallProgress', () => {
  test('reshapes the overall_summary row for display', () => {
    const rows: CoachingMemoryRow[] = [row({
      memory_type: 'overall_summary', subject: 'overall', confidence: 'strong', user_message: null,
      evidence: {
        window: { weeks_used: 4 },
        overall: { planned_sessions: 15, completed_sessions: 12, completion_rate: 0.8 },
        trend: { direction: 'improving', evidence: 'Completion rose from 50% to 80%.' },
      },
    })];
    const result = formatOverallProgress(rows);
    assert.deepEqual(result, {
      weeksUsed: 4, planned: 15, completed: 12, completionRate: 0.8,
      trendDirection: 'improving', trendEvidence: 'Completion rose from 50% to 80%.',
    });
  });

  test('returns null when no overall_summary row exists (no history yet)', () => {
    assert.equal(formatOverallProgress([]), null);
  });
});

describe('selectTopInsights', () => {
  test('excludes emerging confidence entirely', () => {
    const rows: CoachingMemoryRow[] = [row({ confidence: 'emerging' })];
    assert.deepEqual(selectTopInsights(rows), []);
  });

  test('excludes overall_summary and persistence-fact rows', () => {
    const rows: CoachingMemoryRow[] = [
      row({ memory_type: 'overall_summary', subject: 'overall' }),
      row({ memory_type: 'nutrition_focus_persistence', subject: 'protein_consistency' }),
      row({ memory_type: 'support_opportunity_persistence', subject: 'personal_trainer' }),
    ];
    assert.deepEqual(selectTopInsights(rows), []);
  });

  test('strong beats moderate regardless of type', () => {
    const moderateSuccess = row({ confidence: 'moderate', subject: 'cardio' });
    const strongDifficulty = row({ memory_type: 'category_difficulty', confidence: 'strong', subject: 'sport' });
    const result = selectTopInsights([moderateSuccess, strongDifficulty]);
    assert.equal(result[0].subject, 'sport');
  });

  test('at equal confidence, a success pattern ranks ahead of a difficulty pattern', () => {
    const success = row({ confidence: 'strong', subject: 'strength' });
    const difficulty = row({ memory_type: 'category_difficulty', confidence: 'strong', subject: 'cardio' });
    const result = selectTopInsights([difficulty, success]);
    assert.equal(result[0].subject, 'strength');
  });

  test('caps at max (default 3)', () => {
    const rows: CoachingMemoryRow[] = [
      row({ subject: 'strength' }), row({ subject: 'cardio', memory_type: 'category_difficulty' }),
      row({ subject: 'saturday', memory_type: 'day_difficulty' }), row({ subject: 'short', memory_type: 'duration_success' }),
    ];
    assert.equal(selectTopInsights(rows).length, 3);
  });
});

describe('formatEvidenceLine', () => {
  test('builds a compact factual line from planned/completed', () => {
    assert.equal(formatEvidenceLine(row()), '7 of 8 planned sessions completed');
  });

  test('returns null when evidence has no planned/completed fields (e.g. a persistence fact)', () => {
    assert.equal(formatEvidenceLine(row({ evidence: { weeks: 3 } })), null);
  });
});

describe('pickHomeInsight', () => {
  test('prefers an improving overall trend over a specific pattern', () => {
    const rows: CoachingMemoryRow[] = [
      row({
        memory_type: 'overall_summary', subject: 'overall', user_message: null,
        evidence: { window: { weeks_used: 4 }, overall: { planned_sessions: 10, completed_sessions: 8, completion_rate: 0.8 }, trend: { direction: 'improving', evidence: 'x' } },
      }),
      row({ memory_type: 'duration_success', subject: 'short' }),
    ];
    const insight = pickHomeInsight(rows);
    assert.equal(insight?.headline, "You're building consistency");
    assert.equal(insight?.body, '8 of your last 10 planned activities completed.');
  });

  test('falls back to the strongest success pattern when the trend is not improving', () => {
    const rows: CoachingMemoryRow[] = [
      row({
        memory_type: 'overall_summary', subject: 'overall', user_message: null,
        evidence: { window: { weeks_used: 4 }, overall: { planned_sessions: 10, completed_sessions: 8, completion_rate: 0.8 }, trend: { direction: 'stable', evidence: 'x' } },
      }),
      row({ memory_type: 'duration_success', subject: 'short', user_message: 'Shorter sessions have been easier to maintain.' }),
    ];
    const insight = pickHomeInsight(rows);
    assert.equal(insight?.headline, 'Shorter sessions have been easier to maintain.');
  });

  test('never surfaces a difficulty pattern on Home', () => {
    const rows: CoachingMemoryRow[] = [row({ memory_type: 'day_difficulty', subject: 'saturday', confidence: 'strong', user_message: 'Saturday sessions have been harder to fit into your routine.' })];
    assert.equal(pickHomeInsight(rows), null);
  });

  test('returns null with no evidence at all', () => {
    assert.equal(pickHomeInsight([]), null);
  });
});

describe('Outcome Intelligence (Day 6.5) — outcome memory selection', () => {
  function outcomeRow(overrides: Partial<CoachingMemoryRow> = {}): CoachingMemoryRow {
    return {
      memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong',
      evidence: { first: 103, latest: 100, change: -3, observations: 4, direction: 'outcome_progressing' },
      user_message: 'Your weight has been moving toward your goal over your recent check-ins.',
      ...overrides,
    };
  }

  test('pickOutcomeInsight returns the strongest positive-direction row', () => {
    const insight = pickOutcomeInsight([outcomeRow()]);
    assert.equal(insight?.headline, 'Your weight has been moving toward your goal over your recent check-ins.');
    assert.equal(insight?.body, '103 → 100 over 4 check-ins');
  });

  test('pickOutcomeInsight never surfaces a flat/away-from-target direction', () => {
    const stable = outcomeRow({ evidence: { first: 80, latest: 80, change: 0, observations: 4, direction: 'outcome_stable' } });
    const away = outcomeRow({ subject: 'waist', evidence: { first: 90, latest: 95, change: 5, observations: 4, direction: 'outcome_away_from_target' } });
    assert.equal(pickOutcomeInsight([stable, away]), null);
  });

  test('pickOutcomeInsight ignores emerging confidence', () => {
    assert.equal(pickOutcomeInsight([outcomeRow({ confidence: 'emerging' })]), null);
  });

  test('selectOutcomeInsights includes flat/away rows too (My Plan shows any direction)', () => {
    const stable = outcomeRow({ evidence: { first: 80, latest: 80, change: 0, observations: 4, direction: 'outcome_stable' } });
    const rows = selectOutcomeInsights([stable]);
    assert.equal(rows.length, 1);
  });

  test('formatOutcomeEvidenceLine is null without a real first/latest pair', () => {
    assert.equal(formatOutcomeEvidenceLine(outcomeRow({ evidence: { direction: 'outcome_stable' } })), null);
  });
});
