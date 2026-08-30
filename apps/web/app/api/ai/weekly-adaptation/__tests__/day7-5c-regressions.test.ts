// ACP Intelligence™ Day 7.5C — canonical regression group for the three
// Day 7.5B baseline failures (A1, D1, H1). These lock in that:
//   - the benchmark EXPECTATIONS for A1/D1/H1 never silently drift, and
//   - the three targeted corrections (deterministic support suppression,
//     adherence/executability precedence, recovery precedence + corpus)
//     stay in place.
// It does NOT call the model — Day 7.5D runs the live re-evaluation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EVALUATION_SCENARIOS } from '../evaluation/scenarios.ts';
import { CORPUS_MAP } from '../evaluation/corpus-map.ts';
import { enforceAdaptationSupportLogic, WEEKLY_ADAPTATION_SYSTEM_PROMPT, type AIAssessment } from '../adaptation.ts';

const byId = (id: string) => {
  const s = EVALUATION_SCENARIOS.find(x => x.id === id);
  if (!s) throw new Error(`scenario ${id} missing`);
  return s;
};

describe('Day 7.5C — canonical baseline-failure expectations do not drift', () => {
  test('A1 still expects: no support opportunity, KEEP-family decision, no workload increase', () => {
    const a1 = byId('A1');
    assert.equal(a1.expected.supportExpectation, 'none');
    assert.deepEqual(a1.expected.allowedDecisions, ['keep', 'progress']);
    assert.ok(a1.expected.forbiddenDecisions?.includes('simplify'));
    assert.ok(a1.expected.forbiddenDecisions?.includes('rebalance'));
    assert.equal(a1.userContext.barriers.length, 0);
  });

  test('D1 still expects: keep | simplify only, progress forbidden, no workload increase', () => {
    const d1 = byId('D1');
    assert.deepEqual(d1.expected.allowedDecisions, ['keep', 'simplify']);
    assert.ok(d1.expected.forbiddenDecisions?.includes('progress'));
    assert.ok(!d1.expected.allowedDecisions.includes('rebalance')); // rebalance is not permitted for D1
    assert.equal(d1.expected.maxWorkloadIncrease, 0);
  });

  test('H1 still expects: keep | rebalance only, simplify forbidden, recovery domain', () => {
    const h1 = byId('H1');
    assert.deepEqual(h1.expected.allowedDecisions, ['keep', 'rebalance']);
    assert.ok(h1.expected.forbiddenDecisions?.includes('simplify'));
    assert.ok(!h1.expected.allowedDecisions.includes('progress')); // progress is not permitted for H1
    assert.ok(h1.expected.expectedKnowledgeDomains?.includes('recovery'));
  });
});

describe('Day 7.5C — Correction A protects A1 deterministically (GUARDRAIL improvement)', () => {
  function draftWith(support: AIAssessment['support_opportunities']): AIAssessment {
    return {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'beginner', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: support,
      starting_plan: { title: 'x', rationale: 'x', activities: [{ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x' }] },
      weekly_focus: { title: 'x', description: 'x' }, next_steps: ['x'], nutrition_focus: null, review: null,
    };
  }

  test('the raw model support for A1 is suppressed to an empty list post-guardrail', () => {
    const a1 = byId('A1');
    const rawModelSupport: AIAssessment['support_opportunities'] = [
      { type: 'personal_trainer', relevance: 'high', reason: 'A beginner building muscle could use guidance.' },
      { type: 'nutrition', relevance: 'medium', reason: 'Nutrition could help the goal.' },
    ];
    const result = enforceAdaptationSupportLogic(draftWith(rawModelSupport), {
      strengthExperience: a1.userContext.experience,
      barriers: a1.userContext.barriers,
    });
    assert.deepEqual(result.support_opportunities, []);
  });
});

describe('Day 7.5C — Correction B/C prompt language is present (PROMPT improvement)', () => {
  const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();

  test('D1 lever: positive outcome + low adherence does not license progress or restructure', () => {
    assert.ok(lower.includes('adherence / executability precedence'));
    assert.ok(lower.includes('do not progress'));
    assert.ok(lower.includes('do not restructure (rebalance)'));
  });

  test('H1 lever: recovery precedence over adherence-driven progression', () => {
    assert.ok(lower.includes('recovery precedence'));
    assert.ok(lower.includes('high adherence is not, by itself, evidence for progression'));
  });
});

describe('Day 7.5C — Correction C/D corpus coverage (RAG improvement)', () => {
  test('a recovery-domain document now states completion is not readiness (for H1)', () => {
    const doc = CORPUS_MAP.find(d => d.documentKey === 'recovery-spacing-before-progression');
    assert.ok(doc, 'Recovery Spacing Before Progression document is mapped');
    assert.equal(doc!.domain, 'recovery');
    assert.ok(doc!.relevantScenarioIds.includes('H1'));
  });

  test('training-domain documents now cover the previously-empty goal/experience combinations', () => {
    const keys = new Set(CORPUS_MAP.filter(d => d.domain === 'training').map(d => d.documentKey));
    for (const key of [
      'intermediate-strength-progression',
      'experienced-strength-progression',
      'general-fitness-progression',
      'exercise-planning-weight-loss',
      'running-cardio-progression',
      'training-for-stress-reduction',
      'managing-inconsistent-adherence',
    ]) {
      assert.ok(keys.has(key), `training corpus missing ${key}`);
    }
  });

  test('D1 (intermediate lose_weight, moderate adherence) now has a relevant training document', () => {
    const relevant = CORPUS_MAP.filter(d => d.relevantScenarioIds.includes('D1') && d.domain === 'training');
    assert.ok(relevant.length > 0, 'no training document is mapped as relevant to D1');
  });
});
