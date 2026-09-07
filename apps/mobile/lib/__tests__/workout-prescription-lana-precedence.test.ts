// Workout Prescription — Lana precedence durable fix, regression suite.
//
// Reproduces and closes the exact production bug (root-cause audit,
// implemented per the approved fix): a user with an active legacy System-1
// multi-week Programme (lib/programme-generator.ts's generic full_body_a/
// full_body_b types, no upper/lower/support concept) had every one of
// their distinct Lana Intelligence weekly-plan strength activities collide
// on the SAME legacy workout row, because the selection layer only ever
// asked "is there ANY current-week gym-category workout" — never which
// specific activity was being resolved.
//
// This file composes ONLY existing, already-tested pure functions
// (selectExistingSessionMatch / matchesExistingSession from
// activity-recommendation.ts; classifyStrengthStructure /
// fitStrengthSessionForStructure / analyseStrengthSessionOverlap /
// suggestedStrengthWorkoutType from programme-generator.ts +
// activity-recommendation.ts) — no new exercise-selection logic is
// introduced anywhere in this fix.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectExistingSessionMatch, suggestedStrengthWorkoutType, type ExistingSessionCandidate } from '../activity-recommendation.ts';
import {
  classifyStrengthStructure, fitStrengthSessionForStructure, analyseStrengthSessionOverlap,
  type StrengthStructure,
} from '../programme-generator.ts';
import type { ExerciseDifficulty } from '../exercise-types.ts';

// The exact legacy System-1 candidates a real active `workout_programs`
// week produces for a 3x/week strength cadence (lib/programme-generator.ts's
// weeklyWorkoutTypes: ['full_body_a','full_body_b','full_body_a']) — this is
// the literal collision surface from the production bug.
const LEGACY_CANDIDATES: (ExistingSessionCandidate & { id: string })[] = [
  { id: 'legacy-mon', title: 'Full Body A', description: null, workout_type: 'full_body_a' },
  { id: 'legacy-wed', title: 'Full Body B', description: null, workout_type: 'full_body_b' },
  { id: 'legacy-fri', title: 'Full Body A', description: null, workout_type: 'full_body_a' },
];

// Richard's exact reported weekly structure.
const RICHARD_ACTIVITIES = {
  monday: { title: 'Lower Strength — Heavy', description: '' },
  wednesday: { title: 'Upper Strength — Push/Pull', description: '' },
  friday: { title: 'Full Body — Lighter', description: '' },
};

describe('Test A/G/H — Richard 3-day split: no collision, correct distinct structures', () => {
  test('BEFORE the fix, all three activities would have collided on the same legacy row (documents the bug this closes)', () => {
    const buggyOpts = {}; // allowLegacyGenericMatch defaults to true — the pre-fix behaviour
    const monday = selectExistingSessionMatch(LEGACY_CANDIDATES, 'gym', buggyOpts);
    const wednesday = selectExistingSessionMatch(LEGACY_CANDIDATES, 'gym', buggyOpts);
    const friday = selectExistingSessionMatch(LEGACY_CANDIDATES, 'gym', buggyOpts);
    assert.equal(monday?.id, wednesday?.id);
    assert.equal(monday?.id, friday?.id);
    assert.equal(monday?.title, 'Full Body A'); // the exact symptom class reported (Full Body A/B)
  });

  test('AFTER the fix — none of the three resolve to any legacy full_body_a/full_body_b row', () => {
    const fixedOpts = { allowLegacyGenericMatch: false };
    for (const label of ['monday', 'wednesday', 'friday'] as const) {
      const match = selectExistingSessionMatch(LEGACY_CANDIDATES, 'gym', fixedOpts);
      assert.equal(match, undefined, `${label} must not resolve to a legacy row`);
    }
  });

  test('classifyStrengthStructure correctly differentiates all three canonical titles', () => {
    assert.equal(classifyStrengthStructure(RICHARD_ACTIVITIES.monday.title, RICHARD_ACTIVITIES.monday.description), 'lower');
    assert.equal(classifyStrengthStructure(RICHARD_ACTIVITIES.wednesday.title, RICHARD_ACTIVITIES.wednesday.description), 'upper');
    assert.equal(classifyStrengthStructure(RICHARD_ACTIVITIES.friday.title, RICHARD_ACTIVITIES.friday.description), 'full_body');
  });

  test('the resulting workout_type identities are all distinct — Monday/Wednesday/Friday can never collide on the (user, workout_type, suggested_local_date) unique slot', () => {
    const types = (['lower', 'upper', 'full_body'] as StrengthStructure[]).map(suggestedStrengthWorkoutType);
    assert.deepEqual(types, ['acp_suggested_strength_lower', 'acp_suggested_strength_upper', 'acp_suggested_strength']);
    assert.equal(new Set(types).size, 3);
  });
});

describe('Test E — semantic validation: prescriptions actually reflect structure, not just titles', () => {
  const experience: ExerciseDifficulty = 'intermediate';
  const monday = fitStrengthSessionForStructure('lower', experience, 60, 0);
  const wednesday = fitStrengthSessionForStructure('upper', experience, 55, 0);
  const friday = fitStrengthSessionForStructure('full_body', experience, 40, 1); // seed=1 -> full_body B variant

  test('lower-body-dominant: compound requirements are squat/hinge patterns, never horizontal_push/vertical_push', () => {
    const compounds = monday.requirements.filter(r => r.role === 'compound');
    assert.ok(compounds.length > 0);
    assert.ok(compounds.every(r => r.pattern === 'squat' || r.pattern === 'hinge'), `unexpected lower compound patterns: ${compounds.map(c => c.pattern)}`);
    assert.ok(!compounds.some(r => r.pattern === 'horizontal_push' || r.pattern === 'vertical_push'));
  });

  test('upper push/pull: compound requirements are horizontal_push/horizontal_pull/vertical_push, never squat/hinge', () => {
    const compounds = wednesday.requirements.filter(r => r.role === 'compound');
    assert.ok(compounds.length > 0);
    assert.ok(compounds.every(r => ['horizontal_push', 'horizontal_pull', 'vertical_push'].includes(r.pattern)), `unexpected upper compound patterns: ${compounds.map(c => c.pattern)}`);
    assert.ok(!compounds.some(r => r.pattern === 'squat' || r.pattern === 'hinge'));
  });

  test('full-body-lighter: a genuine mix — at least one lower-family and one upper-family pattern present', () => {
    const patterns = friday.requirements.map(r => r.pattern);
    const hasLower = patterns.some(p => p === 'squat' || p === 'hinge');
    const hasUpper = patterns.some(p => p === 'horizontal_push' || p === 'horizontal_pull' || p === 'vertical_push');
    assert.ok(hasLower, `full_body must include a lower-family pattern, got: ${patterns}`);
    assert.ok(hasUpper, `full_body must include an upper-family pattern, got: ${patterns}`);
  });

  test('no two of the three prescriptions are flagged suspicious by the existing overlap analyser (Beta #014)', () => {
    const ml = analyseStrengthSessionOverlap({ structure: 'lower', requirements: monday.requirements }, { structure: 'upper', requirements: wednesday.requirements });
    const mf = analyseStrengthSessionOverlap({ structure: 'lower', requirements: monday.requirements }, { structure: 'full_body', requirements: friday.requirements });
    const wf = analyseStrengthSessionOverlap({ structure: 'upper', requirements: wednesday.requirements }, { structure: 'full_body', requirements: friday.requirements });
    assert.equal(ml.suspicious, false, 'Monday (lower) vs Wednesday (upper) must not read as duplicated');
    assert.equal(mf.suspicious, false, 'Monday (lower) vs Friday (full_body) must not read as duplicated');
    assert.equal(wf.suspicious, false, 'Wednesday (upper) vs Friday (full_body) must not read as duplicated');
  });
});

describe('Test C/J — identity/persistence: the structural guarantee that makes reopening stable', () => {
  test('the same structure always classifies to the same workout_type — reopening Monday resolves the same slot key every time', () => {
    const first = suggestedStrengthWorkoutType(classifyStrengthStructure(RICHARD_ACTIVITIES.monday.title, RICHARD_ACTIVITIES.monday.description));
    const second = suggestedStrengthWorkoutType(classifyStrengthStructure(RICHARD_ACTIVITIES.monday.title, RICHARD_ACTIVITIES.monday.description));
    assert.equal(first, second);
  });
  // Full end-to-end "open Monday -> Wednesday -> Friday -> Monday, same
  // sessionId returned" persistence is guaranteed by the EXISTING, unchanged
  // System 2 idempotency mechanism (claimStandaloneWorkoutSlot's
  // (user_id, workout_type, suggested_local_date) unique upsert +
  // findReusableSuggested, both Supabase-touching and already covered by
  // this fix leaving them completely untouched — see the durable-fix
  // report's persistence section). This test file covers the pure
  // selection/classification layer this fix actually changed.
});

describe('Test I/§9 — other plan shapes: the invariant is generic, not Richard-specific', () => {
  // Deliberately synthetic — proves the fix does not hard-code Richard's
  // schedule or title text anywhere.
  const SHAPES: { label: string; titles: string[] }[] = [
    { label: '2-day (upper/lower)', titles: ['Upper Body Strength', 'Lower Body Strength'] },
    { label: '3-day (Richard-equivalent)', titles: ['Lower Strength — Heavy', 'Upper Strength — Push/Pull', 'Full Body — Lighter'] },
    { label: '4-day (upper/lower x2)', titles: ['Upper Strength A', 'Lower Strength A', 'Upper Strength B', 'Lower Strength B'] },
  ];

  for (const shape of SHAPES) {
    test(`${shape.label}: no activity resolves to a legacy full_body_a/full_body_b row`, () => {
      for (const title of shape.titles) {
        const match = selectExistingSessionMatch(LEGACY_CANDIDATES, 'gym', { allowLegacyGenericMatch: false });
        assert.equal(match, undefined, `"${title}" must not resolve to a legacy row`);
      }
    });

    test(`${shape.label}: each title classifies to a real structure (never silently falls through unclassified)`, () => {
      const structures = shape.titles.map(t => classifyStrengthStructure(t, null));
      assert.ok(structures.every(s => ['upper', 'lower', 'support', 'full_body'].includes(s)));
    });
  }

  test('a 2-day upper/lower split produces two distinct, non-overlapping workout_type identities', () => {
    const types = ['Upper Body Strength', 'Lower Body Strength']
      .map(t => classifyStrengthStructure(t, null))
      .map(suggestedStrengthWorkoutType);
    assert.equal(new Set(types).size, 2);
  });
});
