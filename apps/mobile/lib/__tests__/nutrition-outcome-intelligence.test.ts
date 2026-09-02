// ACP Intelligence™ — Nutrition N9. Outcome-intelligence PURE layer.
//
// N9 is longitudinal and OBSERVATIONAL: repeated association across weeks,
// never causal attribution. These tests pin the repeated-pattern gates
// (§9/§11/§39), the recency/contradiction rule (§29/§46), and the
// banned-language guard (§2/§50).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNutrientResponses,
  buildOutcomeObservations,
  routineFitObservation,
  trainingNutritionContextObservation,
  findUnsafeOutcomePhrases,
  assertSafeOutcomeObservation,
  mondayOf,
  weekdayName,
  OUTCOME_GATES,
  type EpisodeOutcome,
  type OutcomeWeekEvidence,
} from '../nutrition/nutrition-outcome-intelligence.ts';

// ── fixtures ───────────────────────────────────────────────────────────
const ep = (nutrient: EpisodeOutcome['nutrient'], shownLocalDate: string, direction: EpisodeOutcome['direction']): EpisodeOutcome =>
  ({ nutrient, shownLocalDate, direction });

const wk = (over: Partial<OutcomeWeekEvidence> = {}): OutcomeWeekEvidence => ({
  weekStart: '2026-06-01',
  completedSessions: 3,
  completedOnPreferredDays: 3,
  hasPreferredDays: true,
  proteinState: 'within_range',
  ...over,
});

// ── week bucketing ─────────────────────────────────────────────────────
describe('mondayOf / weekdayName (pure local-date bucketing)', () => {
  test('mondayOf snaps every weekday back to its Monday', () => {
    assert.equal(mondayOf('2026-08-31'), '2026-08-31'); // a Monday
    assert.equal(mondayOf('2026-09-02'), '2026-08-31'); // Wed → Mon
    assert.equal(mondayOf('2026-09-06'), '2026-08-31'); // Sun → same Mon
    assert.equal(mondayOf('2026-09-07'), '2026-09-07'); // next Monday
  });
  test('weekdayName matches fitness_profile.preferred_training_days vocabulary', () => {
    assert.equal(weekdayName('2026-08-31'), 'monday');
    assert.equal(weekdayName('2026-09-06'), 'sunday');
  });
});

// ── B — repeated nutrient coaching response (§39, mandatory) ────────────
describe('aggregateNutrientResponses + the mandatory first observation (§39)', () => {
  test('protein & fibre are aggregated as SEPARATE groups, never merged (§23)', () => {
    const aggs = aggregateNutrientResponses([
      ep('proteinG', '2026-07-01', 'toward_reference'),
      ep('proteinG', '2026-07-20', 'within_reference'),
      ep('fibreG', '2026-07-05', 'no_clear_change'),
    ]);
    assert.equal(aggs.length, 2);
    assert.equal(aggs.find(a => a.nutrient === 'proteinG')!.positive, 2);
    assert.equal(aggs.find(a => a.nutrient === 'fibreG')!.evaluable, 1);
  });

  test('§39 exact example — 3 evaluable protein episodes (toward, within, no_clear_change)', () => {
    const obs = buildOutcomeObservations({
      episodes: [
        ep('proteinG', '2026-07-01', 'toward_reference'),
        ep('proteinG', '2026-07-18', 'within_reference'),
        ep('proteinG', '2026-08-04', 'no_clear_change'),
      ],
      weeks: [],
    });
    assert.equal(obs.length, 1);
    assert.equal(obs[0].type, 'repeated_nutrient_response');
    assert.equal(
      obs[0].body,
      'In 2 of 3 evaluable protein-coaching episodes, subsequent logged protein moved toward or into the reference range.',
    );
    assert.equal(obs[0].confidence, 'emerging'); // small sample stays cautious
  });

  test('a single evaluable episode never surfaces — repetition is required (§9/§43)', () => {
    const obs = buildOutcomeObservations({
      episodes: [ep('proteinG', '2026-07-01', 'toward_reference')],
      weeks: [],
    });
    assert.equal(obs.length, 0);
  });

  test('null-direction (expired / too little after-evidence) episodes are not evaluable', () => {
    const [agg] = aggregateNutrientResponses([
      ep('proteinG', '2026-07-01', 'toward_reference'),
      ep('proteinG', '2026-07-10', null),
      ep('proteinG', '2026-07-20', null),
    ]);
    assert.equal(agg.episodes, 3);
    assert.equal(agg.evaluable, 1);
  });

  test('insufficient_evidence is excluded from evaluable; above_reference counts as non-positive', () => {
    const [agg] = aggregateNutrientResponses([
      ep('fibreG', '2026-07-01', 'insufficient_evidence'),
      ep('fibreG', '2026-07-08', 'above_reference'),
      ep('fibreG', '2026-07-15', 'toward_reference'),
      ep('fibreG', '2026-07-22', 'within_reference'),
    ]);
    assert.equal(agg.evaluable, 3);
    assert.equal(agg.positive, 2);
    assert.equal(agg.noClearChange, 1);
  });

  test('4+ mostly-positive evaluable episodes reach "strong"; 4 mixed reach "moderate"', () => {
    const strong = aggregateNutrientResponses([
      ep('proteinG', '2026-06-01', 'toward_reference'),
      ep('proteinG', '2026-06-20', 'within_reference'),
      ep('proteinG', '2026-07-09', 'within_reference'),
      ep('proteinG', '2026-07-28', 'no_clear_change'),
    ]);
    const obsStrong = buildOutcomeObservations({ episodes: [
      ep('proteinG', '2026-06-01', 'toward_reference'),
      ep('proteinG', '2026-06-20', 'within_reference'),
      ep('proteinG', '2026-07-09', 'within_reference'),
      ep('proteinG', '2026-07-28', 'no_clear_change'),
    ], weeks: [] });
    assert.equal(strong[0].evaluable, 4);
    assert.equal(obsStrong[0].confidence, 'strong'); // positive >= evaluable-1

    const obsModerate = buildOutcomeObservations({ episodes: [
      ep('fibreG', '2026-06-01', 'toward_reference'),
      ep('fibreG', '2026-06-20', 'no_clear_change'),
      ep('fibreG', '2026-07-09', 'within_reference'),
      ep('fibreG', '2026-07-28', 'no_clear_change'),
    ], weeks: [] });
    assert.equal(obsModerate[0].confidence, 'moderate');
  });

  test('recency/contradiction — recent 3 evaluable all non-positive after earlier positives → caps at emerging & reframes (§29/§46)', () => {
    const episodes: EpisodeOutcome[] = [
      ep('proteinG', '2026-05-01', 'toward_reference'),
      ep('proteinG', '2026-05-20', 'within_reference'),
      ep('proteinG', '2026-06-10', 'no_clear_change'),
      ep('proteinG', '2026-07-01', 'no_clear_change'),
      ep('proteinG', '2026-07-22', 'away_from_reference'),
    ];
    const [agg] = aggregateNutrientResponses(episodes);
    assert.equal(agg.recentContradiction, true);
    const obs = buildOutcomeObservations({ episodes, weeks: [] });
    assert.equal(obs[0].confidence, 'emerging');
    assert.match(obs[0].body, /stayed fairly similar across the most recent/);
    assert.doesNotMatch(obs[0].body, /In \d+ of \d+/); // no numerator claim when recent evidence contradicts
  });
});

// ── C — routine fit ───────────────────────────────────────────────────
describe('routineFitObservation (§40/§48)', () => {
  test('needs ≥3 consistent weeks with preferred days on file', () => {
    assert.equal(routineFitObservation([wk(), wk()]), null);
    assert.equal(routineFitObservation([
      wk({ weekStart: '2026-06-01' }), wk({ weekStart: '2026-06-08' }), wk({ weekStart: '2026-06-15' }),
    ])!.type, 'routine_fit');
  });

  test('no observation when consistent weeks do NOT align with preferred days', () => {
    const weeks = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'].map(weekStart =>
      wk({ weekStart, completedOnPreferredDays: 1, completedSessions: 3 }));
    assert.equal(routineFitObservation(weeks), null);
  });

  test('weeks without preferred days on file are excluded entirely (§47)', () => {
    const weeks = ['2026-06-01', '2026-06-08', '2026-06-15'].map(weekStart =>
      wk({ weekStart, hasPreferredDays: false }));
    assert.equal(routineFitObservation(weeks), null);
  });

  test('6+ aligned consistent weeks → strong', () => {
    const weeks = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08']
      .map(weekStart => wk({ weekStart }));
    assert.equal(routineFitObservation(weeks)!.confidence, 'strong');
  });
});

// ── A — training consistency × nutrition context ──────────────────────
describe('trainingNutritionContextObservation (§11A)', () => {
  test('needs a contrast between consistent and less-consistent weeks', () => {
    const allConsistent = ['2026-06-01', '2026-06-08', '2026-06-15'].map(weekStart =>
      wk({ weekStart, completedSessions: 4 }));
    assert.equal(trainingNutritionContextObservation(allConsistent), null);
  });

  test('surfaces when the consistent weeks mostly also had protein at/above reference', () => {
    const weeks: OutcomeWeekEvidence[] = [
      wk({ weekStart: '2026-05-04', completedSessions: 4, proteinState: 'within_range' }),
      wk({ weekStart: '2026-05-11', completedSessions: 4, proteinState: 'meets_or_exceeds_reference' }),
      wk({ weekStart: '2026-05-18', completedSessions: 4, proteinState: 'within_range' }),
      wk({ weekStart: '2026-05-25', completedSessions: 1, proteinState: 'below_range' }),
      wk({ weekStart: '2026-06-01', completedSessions: 0, proteinState: 'below_range' }),
    ];
    const obs = trainingNutritionContextObservation(weeks);
    assert.ok(obs);
    assert.equal(obs!.type, 'training_consistency_nutrition_context');
    assert.match(obs!.body, /tended to include protein/);
  });

  test('weeks with no protein signal are ignored', () => {
    const weeks: OutcomeWeekEvidence[] = [
      wk({ weekStart: '2026-05-04', completedSessions: 4, proteinState: null }),
      wk({ weekStart: '2026-05-11', completedSessions: 4, proteinState: null }),
      wk({ weekStart: '2026-05-18', completedSessions: 1, proteinState: null }),
    ];
    assert.equal(trainingNutritionContextObservation(weeks), null);
  });
});

// ── top-level shape ──────────────────────────────────────────────────
describe('buildOutcomeObservations — small, ordered, capped', () => {
  test('at most 3 observations, nutrient-response first', () => {
    const episodes: EpisodeOutcome[] = [
      ep('proteinG', '2026-06-01', 'toward_reference'),
      ep('proteinG', '2026-06-20', 'within_reference'),
      ep('fibreG', '2026-06-05', 'toward_reference'),
      ep('fibreG', '2026-06-25', 'within_reference'),
    ];
    const weeks = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01']
      .map((weekStart, i) => wk({ weekStart, completedSessions: i < 3 ? 4 : 1, proteinState: i < 3 ? 'within_range' : 'below_range' }));
    const obs = buildOutcomeObservations({ episodes, weeks });
    assert.ok(obs.length <= 3);
    assert.equal(obs[0].type, 'repeated_nutrient_response');
  });

  test('empty input → nothing', () => {
    assert.deepEqual(buildOutcomeObservations({ episodes: [], weeks: [] }), []);
  });
});

// ── safety: banned language (§2/§50) ─────────────────────────────────
describe('findUnsafeOutcomePhrases / assertSafeOutcomeObservation', () => {
  for (const bad of [
    'This caused your protein to rise',
    'The advice led to better logging',
    'Higher protein because of your training',
    'This suggestion works for you',
    'It helped you lose weight',
    'Your diet was unhealthy',
    'You must eat more fibre',
    'This improved your weight over the month',
  ]) {
    test(`flags: "${bad}"`, () => assert.ok(findUnsafeOutcomePhrases(bad).length > 0));
  }

  for (const good of [
    'In 2 of 3 evaluable protein-coaching episodes, subsequent logged protein moved toward or into the reference range.',
    'Your most consistent recent weeks have largely matched your preferred training days.',
    'These two patterns appeared over the same weeks — neither is shown to cause the other.',
    'This counts what was logged after each suggestion — it is a sequence in time, not a measure of cause and effect.',
  ]) {
    test(`allows: "${good.slice(0, 48)}…"`, () => assert.equal(findUnsafeOutcomePhrases(good).length, 0));
  }

  test('every generated observation passes the guard', () => {
    const episodes: EpisodeOutcome[] = [
      ep('proteinG', '2026-05-01', 'toward_reference'),
      ep('proteinG', '2026-05-20', 'within_reference'),
      ep('proteinG', '2026-06-10', 'no_clear_change'),
      ep('proteinG', '2026-07-01', 'away_from_reference'),
      ep('proteinG', '2026-07-22', 'no_clear_change'),
      ep('fibreG', '2026-05-05', 'toward_reference'),
      ep('fibreG', '2026-05-25', 'within_reference'),
      ep('fibreG', '2026-06-14', 'within_reference'),
      ep('fibreG', '2026-07-03', 'within_reference'),
    ];
    const weeks = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08']
      .map((weekStart, i) => wk({ weekStart, completedSessions: i < 4 ? 4 : 1, completedOnPreferredDays: i < 4 ? 3 : 0, proteinState: i < 4 ? 'within_range' : 'below_range' }));
    const obs = buildOutcomeObservations({ episodes, weeks });
    assert.ok(obs.length >= 2);
    for (const o of obs) assert.doesNotThrow(() => assertSafeOutcomeObservation(o));
  });
});

test('OUTCOME_GATES are conservative', () => {
  assert.ok(OUTCOME_GATES.minEpisodes >= 2);
  assert.ok(OUTCOME_GATES.minWeeks >= 3);
  assert.ok(OUTCOME_GATES.weeklyAssociationShare >= 0.5);
});
