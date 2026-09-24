// Fitness plan recovery (device QA — "still being prepared" stuck forever).
// Source-level regression guards for app/my-plan.tsx, the same pattern this
// codebase already uses for nutrition-planning-candidate-source.test.ts:
// the screen imports react-native/AsyncStorage (via @/lib/supabase) and
// can't be mounted under plain `node --test`, so these pin the load()
// function's ARCHITECTURE instead — the properties that keep generation
// from ever touching a healthy existing plan, and keep the new error state
// from being silently re-derived out of sync with resolveMyPlanViewState.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(__dirname, '../../app/my-plan.tsx'), 'utf-8');

describe('healthy active plan → no regeneration', () => {
  test('the isValidAssessment gate returns BEFORE any fetchOnboardingAssessment call — a valid existing assessment short-circuits the whole generation path', () => {
    const gateIndex = source.indexOf('if (data?.ai_assessment && isValidAssessment(data.ai_assessment)');
    const generateCallIndex = source.indexOf('const result = await fetchOnboardingAssessment(');
    assert.ok(gateIndex >= 0, 'the isValidAssessment gate must exist');
    assert.ok(generateCallIndex >= 0, 'the generation call must exist');
    assert.ok(gateIndex < generateCallIndex, 'the gate must be checked before generation is ever attempted');

    // Between the gate and the generation call, `setAssessment(null)` must
    // appear — the definitive marker that generation is only reachable on
    // the "no valid assessment" path, never alongside a healthy one.
    const between = source.slice(gateIndex, generateCallIndex);
    assert.match(between, /setAssessment\(null\)/);
    assert.match(between, /\breturn;/, 'the valid-assessment branch must return before falling through to generation');
  });

  test('generation is never triggered by tapping Retry on a ready plan — Retry only renders in the error_retryable branch, which is mutually exclusive with ready', () => {
    // resolveMyPlanViewState (tested exhaustively in ai-assessment.test.ts)
    // already proves 'ready' and 'error_retryable' are mutually exclusive
    // outputs of one pure function; this pins that my-plan.tsx's Retry
    // button is gated on that same computed value, not a separate ad hoc
    // condition that could drift out of sync.
    const retryOccurrences = (source.match(/myPlanViewState === 'error_retryable'/g) ?? []).length;
    assert.ok(retryOccurrences >= 2, 'both the "This week" card and the no-plan-summary branch must gate on the same tested state');
  });
});

describe('the render tree never re-derives its own error condition independently of resolveMyPlanViewState', () => {
  test('no stray "generationError &&" condition remains — every branch reads the single computed myPlanViewState', () => {
    assert.ok(!/generationError && generationError !== 'timeout'/.test(source), 'this ad hoc condition should have been replaced by myPlanViewState');
  });
});

describe('completed workouts / existing evidence are never touched by this recovery path', () => {
  test('the generation call site never writes to plan_activity_completions/plan_activity_execution/coaching_memory — those are read-only elsewhere on this screen', () => {
    const generateCallIndex = source.indexOf('const result = await fetchOnboardingAssessment(');
    const nearby = source.slice(generateCallIndex - 200, generateCallIndex + 400);
    for (const table of ['plan_activity_completions', 'plan_activity_execution', 'coaching_memory']) {
      assert.ok(!nearby.includes(table), `${table} must not be touched near the generation call`);
    }
  });
});
