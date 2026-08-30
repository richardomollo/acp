// ACP Intelligence™ Day 7.5 — evaluation grader tests.
// Covers all 15 required areas from the spec (section 93 A–O).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeDecision, gradeDomainSelection, gradeWorkload, gradeContinuity,
  gradeGrounding, gradeSupport, gradeGoalImmutability, gradeScenario,
  buildDomainRequestsForScenario, calcThresholdAnalysis, selectLiveSuite,
  computeDecisionDistribution, computePassRates, evaluateQualityGate,
  classifySeverity,
} from '../graders.ts';
import { EVALUATION_SCENARIOS, LIVE_SUITE_IDS, ABLATION_IDS } from '../scenarios.ts';
import type { EvaluationScenario } from '../types.ts';
import type { StartingPlanActivity, SupportOpportunity } from '../../../onboarding-assessment/assessment.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function act(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return {
    day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60,
    intensity: 'moderate', title: 'S', description: 'S',
    ...overrides,
  };
}

function scenario(overrides: Partial<EvaluationScenario> = {}): EvaluationScenario {
  const base = EVALUATION_SCENARIOS.find(s => s.id === 'A1')!;
  return { ...base, ...overrides, expected: { ...base.expected, ...(overrides.expected ?? {}) } };
}

// ── A. Scenario fixture validity ──────────────────────────────────────────────

describe('A — scenario fixture validity', () => {
  test('all scenario IDs are unique', () => {
    const ids = EVALUATION_SCENARIOS.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('at least 40 scenarios exist', () => {
    assert.ok(EVALUATION_SCENARIOS.length >= 40, `only ${EVALUATION_SCENARIOS.length} scenarios`);
  });

  test('every scenario has at least one allowedDecision', () => {
    for (const s of EVALUATION_SCENARIOS) {
      assert.ok(s.expected.allowedDecisions.length >= 1, `${s.id} has no allowedDecisions`);
    }
  });

  test('every scenario has non-empty userContext goal or null', () => {
    for (const s of EVALUATION_SCENARIOS) {
      assert.ok(s.userContext.goal !== undefined, `${s.id} missing goal field`);
    }
  });

  test('every behaviourEvidence adherence_rate is within [0, 1]', () => {
    for (const s of EVALUATION_SCENARIOS) {
      const r = s.behaviourEvidence.adherence_rate;
      assert.ok(r >= 0 && r <= 1, `${s.id} adherence_rate=${r} out of range`);
    }
  });

  test('all groups A–M have coverage', () => {
    const groups = new Set(EVALUATION_SCENARIOS.map(s => s.group));
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const) {
      assert.ok(groups.has(g), `group ${g} has no scenarios`);
    }
  });

  test('each required group has the minimum scenario count', () => {
    const countByGroup = (g: string) => EVALUATION_SCENARIOS.filter(s => s.group === g).length;
    const minimums: Record<string, number> = { A: 4, B: 4, C: 5, D: 3, E: 4, F: 3, G: 3, H: 3, I: 3, J: 4, K: 2, L: 2, M: 2 };
    for (const [g, min] of Object.entries(minimums)) {
      assert.ok(countByGroup(g) >= min, `group ${g}: ${countByGroup(g)} < ${min}`);
    }
  });
});

// ── B. Domain grader ──────────────────────────────────────────────────────────

describe('B — domain grader', () => {
  test('pass when requested domains include all expected', () => {
    const result = gradeDomainSelection(['training', 'coaching'], {
      allowedDecisions: ['keep'],
      expectedKnowledgeDomains: ['training', 'coaching'],
    });
    assert.equal(result.pass, true);
  });

  test('fail when expected domain is missing', () => {
    const result = gradeDomainSelection(['training'], {
      allowedDecisions: ['keep'],
      expectedKnowledgeDomains: ['training', 'coaching'],
    });
    assert.equal(result.pass, false);
    assert.deepEqual(result.missingDomains, ['coaching']);
  });

  test('fail when a forbidden domain is present', () => {
    const result = gradeDomainSelection(['training', 'nutrition'], {
      allowedDecisions: ['keep'],
      forbiddenKnowledgeDomains: ['nutrition'],
    });
    assert.equal(result.pass, false);
    assert.deepEqual(result.forbiddenPresent, ['nutrition']);
  });

  test('pass with no expected/forbidden domain constraints', () => {
    const result = gradeDomainSelection(['training', 'recovery'], { allowedDecisions: ['keep'] });
    assert.equal(result.pass, true);
  });

  test('no unexpected domains flagged when no expectedKnowledgeDomains specified', () => {
    const result = gradeDomainSelection(['training', 'recovery', 'nutrition'], { allowedDecisions: ['keep'] });
    assert.deepEqual(result.unexpectedDomains, []);
  });
});

// ── C. Decision grader ────────────────────────────────────────────────────────

describe('C — decision grader', () => {
  test('pass when actual is in allowedDecisions', () => {
    const r = gradeDecision('keep', { allowedDecisions: ['keep', 'adjust'] });
    assert.equal(r.pass, true);
  });

  test('fail when actual is not in allowedDecisions', () => {
    const r = gradeDecision('progress', { allowedDecisions: ['keep', 'adjust'] });
    assert.equal(r.pass, false);
  });

  test('fail when actual is in forbiddenDecisions even if in allowedDecisions', () => {
    const r = gradeDecision('progress', { allowedDecisions: ['progress'], forbiddenDecisions: ['progress'] });
    assert.equal(r.pass, false);
  });

  test('pass for each valid decision value when all are allowed', () => {
    for (const d of ['keep', 'progress', 'simplify', 'rebalance', 'adjust'] as const) {
      const r = gradeDecision(d, { allowedDecisions: ['keep', 'progress', 'simplify', 'rebalance', 'adjust'] });
      assert.equal(r.pass, true, `failed for ${d}`);
    }
  });

  test('tolerant — does not require one exact decision when multiple are reasonable', () => {
    const r = gradeDecision('simplify', { allowedDecisions: ['keep', 'simplify', 'rebalance'] });
    assert.equal(r.pass, true);
  });
});

// ── D. Plan delta calculation ─────────────────────────────────────────────────

describe('D — plan delta calculation (workload grader)', () => {
  test('pass when no workload increase occurs', () => {
    const prev = [act({ duration_minutes: 60 }), act({ duration_minutes: 60 })]; // 120 min
    const next = [act({ duration_minutes: 60 }), act({ duration_minutes: 60 })]; // 120 min
    const r = gradeWorkload(prev, next, { allowedDecisions: ['keep'], maxWorkloadIncrease: 0 });
    assert.equal(r.pass, true);
    assert.equal(r.deltaPercent, 0);
  });

  test('fail when workload exceeds maxWorkloadIncrease cap', () => {
    const prev = [act({ duration_minutes: 60 }), act({ duration_minutes: 60 })]; // 120 min
    const next = [act({ duration_minutes: 90 }), act({ duration_minutes: 90 })]; // 180 min (+50%)
    const r = gradeWorkload(prev, next, { allowedDecisions: ['keep'], maxWorkloadIncrease: 0 });
    assert.equal(r.pass, false);
    assert.ok(r.violation !== undefined);
  });

  test('pass when increase is within the explicit cap', () => {
    const prev = [act({ duration_minutes: 60 }), act({ duration_minutes: 60 })]; // 120 min
    const next = [act({ duration_minutes: 75 }), act({ duration_minutes: 75 })]; // 150 min (+25%)
    const r = gradeWorkload(prev, next, { allowedDecisions: ['keep'], maxWorkloadIncrease: 0.3 });
    assert.equal(r.pass, true);
  });

  test('records deltaPercent accurately', () => {
    const prev = [act({ duration_minutes: 100 })];
    const next = [act({ duration_minutes: 150 })];
    const r = gradeWorkload(prev, next, { allowedDecisions: ['keep'] });
    assert.ok(Math.abs(r.deltaPercent - 0.5) < 0.01, `deltaPercent=${r.deltaPercent}`);
  });
});

// ── E. Continuity grader ──────────────────────────────────────────────────────

describe('E — continuity grader', () => {
  test('pass when mustPreserveActivities are all present in next plan', () => {
    const prev = [act({ category: 'strength' }), act({ category: 'cardio' })];
    const next = [act({ category: 'strength' }), act({ category: 'cardio' })];
    const r = gradeContinuity(prev, next, { allowedDecisions: ['keep'], mustPreserveActivities: ['strength', 'cardio'] });
    assert.equal(r.pass, true);
  });

  test('fail when a mustPreserveActivities category is missing from next plan', () => {
    const prev = [act({ category: 'strength' }), act({ category: 'cardio' })];
    const next = [act({ category: 'strength' })];
    const r = gradeContinuity(prev, next, { allowedDecisions: ['simplify'], mustPreserveActivities: ['cardio'] });
    assert.equal(r.pass, false);
    assert.ok(r.missingRequired.includes('cardio'));
  });

  test('fail when a mustNotAddActivities category appears in next plan', () => {
    const prev = [act({ category: 'strength' })];
    const next = [act({ category: 'strength' }), act({ category: 'mobility' })];
    const r = gradeContinuity(prev, next, { allowedDecisions: ['keep'], mustNotAddActivities: ['mobility'] });
    assert.equal(r.pass, false);
    assert.ok(r.forbiddenPresent.includes('mobility'));
  });

  test('records removedCategories and addedCategories', () => {
    const prev = [act({ category: 'strength' }), act({ category: 'cardio' })];
    const next = [act({ category: 'strength' }), act({ category: 'mobility' })];
    const r = gradeContinuity(prev, next, { allowedDecisions: ['rebalance'] });
    assert.ok(r.removedCategories.includes('cardio'));
    assert.ok(r.addedCategories.includes('mobility'));
  });
});

// ── F. Workload grader (covered in D above; this tests low-adherence flag) ────

describe('F — workload under low adherence context', () => {
  test('flags workload increase when adherence is low and maxWorkloadIncrease is 0', () => {
    const prev = [act({ duration_minutes: 60 }), act({ duration_minutes: 60 })];
    const next = [act({ duration_minutes: 80 }), act({ duration_minutes: 80 })];
    const r = gradeWorkload(prev, next, { allowedDecisions: ['simplify'], maxWorkloadIncrease: 0 });
    assert.equal(r.pass, false);
    assert.ok(r.violation?.includes('workload increased'));
  });
});

// ── G. Support grader ─────────────────────────────────────────────────────────

describe('G — support grader', () => {
  const ptHigh: SupportOpportunity = { type: 'personal_trainer', relevance: 'high', reason: 'x' };
  const ptMedium: SupportOpportunity = { type: 'personal_trainer', relevance: 'medium', reason: 'x' };
  const nutritionMedium: SupportOpportunity = { type: 'nutrition', relevance: 'medium', reason: 'x' };

  test('optional expectation always passes', () => {
    const r = gradeSupport([ptHigh], { allowedDecisions: ['keep'], supportExpectation: 'optional' });
    assert.equal(r.pass, true);
  });

  test('none expectation fails when support_opportunities are present', () => {
    const r = gradeSupport([nutritionMedium], { allowedDecisions: ['keep'], supportExpectation: 'none' });
    assert.equal(r.pass, false);
  });

  test('none expectation passes when support_opportunities is empty', () => {
    const r = gradeSupport([], { allowedDecisions: ['keep'], supportExpectation: 'none' });
    assert.equal(r.pass, true);
  });

  test('high_forbidden fails when PT high is present', () => {
    const r = gradeSupport([ptHigh], { allowedDecisions: ['keep'], supportExpectation: 'high_forbidden' });
    assert.equal(r.pass, false);
  });

  test('high_forbidden passes when PT medium is present (not high)', () => {
    const r = gradeSupport([ptMedium], { allowedDecisions: ['keep'], supportExpectation: 'high_forbidden' });
    assert.equal(r.pass, true);
  });

  test('high_forbidden passes when no support_opportunities', () => {
    const r = gradeSupport([], { allowedDecisions: ['keep'], supportExpectation: 'high_forbidden' });
    assert.equal(r.pass, true);
  });
});

// ── H. Goal immutability ──────────────────────────────────────────────────────

describe('H — goal immutability', () => {
  test('pass when goal is unchanged', () => {
    const r = gradeGoalImmutability('build_muscle', 'build_muscle');
    assert.equal(r.pass, true);
  });

  test('fail when goal has changed', () => {
    const r = gradeGoalImmutability('build_muscle', 'lose_weight');
    assert.equal(r.pass, false);
    assert.ok(r.reason?.includes('build_muscle'));
  });

  test('pass when generatedGoal is undefined (not in output schema)', () => {
    const r = gradeGoalImmutability('build_muscle', undefined);
    assert.equal(r.pass, true);
  });

  test('pass when original goal is null (not set)', () => {
    const r = gradeGoalImmutability(null, 'build_muscle');
    assert.equal(r.pass, true);
  });
});

// ── I. Grounding warning — adherence contradiction ────────────────────────────

describe('I — grounding: adherence contradiction', () => {
  test('warns when high-adherence scenario has "missed most" in rationale', () => {
    const s = scenario({ behaviourEvidence: { ...EVALUATION_SCENARIOS[0].behaviourEvidence, adherence_rate: 0.9 } });
    const r = gradeGrounding('You missed most of your sessions this week.', s);
    assert.ok(r.warnings.some(w => w.includes('Adherence contradiction')));
  });

  test('warns when low-adherence scenario has "excellent adherence" in rationale', () => {
    const s = scenario({ behaviourEvidence: { ...EVALUATION_SCENARIOS[0].behaviourEvidence, adherence_rate: 0.25 } });
    const r = gradeGrounding('Excellent adherence this week — you completed all sessions.', s);
    assert.ok(r.warnings.some(w => w.includes('Adherence contradiction')));
  });

  test('no warning when rationale is accurate for the adherence level', () => {
    const s = scenario({ behaviourEvidence: { ...EVALUATION_SCENARIOS[0].behaviourEvidence, adherence_rate: 0.9 } });
    const r = gradeGrounding('Great work this week — you were consistent with your plan.', s);
    assert.equal(r.warnings.filter(w => w.includes('contradiction')).length, 0);
  });
});

// ── J. Grounding warning — causality ─────────────────────────────────────────

describe('J — grounding: causality warning', () => {
  test('warns on causal weight claim', () => {
    const s = scenario();
    const r = gradeGrounding('Your weight dropped because of your strength sessions.', s);
    assert.ok(r.warnings.some(w => w.includes('Causality claim')));
  });

  test('warns on "this workout caused" phrasing', () => {
    const s = scenario();
    const r = gradeGrounding('Because this workout caused your energy to improve', s);
    assert.ok(r.warnings.some(w => w.includes('Causality claim')));
  });

  test('no causality warning for observational language', () => {
    const s = scenario();
    const r = gradeGrounding('Activity consistency has been strong, and weight has also moved toward your goal.', s);
    assert.equal(r.warnings.filter(w => w.includes('Causality')).length, 0);
  });

  test('warns on scenario-specific forbidden phrase', () => {
    const s = scenario({ expected: { ...EVALUATION_SCENARIOS[0].expected, forbiddenRationalePhrases: ['eat exactly'] } });
    const r = gradeGrounding('You should eat exactly 150g of protein per day.', s);
    assert.ok(r.warnings.some(w => w.includes('eat exactly')));
  });
});

// ── K. Guardrail intervention tracking (via gradeScenario) ───────────────────

describe('K — guardrail intervention tracking', () => {
  const s = EVALUATION_SCENARIOS.find(s => s.id === 'A1')!;

  test('gradeScenario records domainPass, decisionPass, workloadPass, continuityPass', () => {
    const result = gradeScenario(s, {
      decision: 'keep',
      rationale: 'Great work keeping consistent this week.',
      previousActivities: s.currentPlanActivities,
      finalActivities: s.currentPlanActivities,
      support_opportunities: [],
      requestedDomains: ['training'],
    });
    assert.equal(result.decisionPass, true);
    assert.equal(result.domainPass, true);
    assert.equal(result.workloadPass, true);
    assert.equal(result.continuityPass, true);
    assert.equal(result.overallPass, true);
  });

  test('gradeScenario marks critical when workload increases on a 0 cap', () => {
    const highWorkload = s.currentPlanActivities.map(a => ({ ...a, duration_minutes: 120 }));
    const result = gradeScenario(s, {
      decision: 'keep',
      rationale: 'Great work.',
      previousActivities: s.currentPlanActivities.map(a => ({ ...a, duration_minutes: 60 })),
      finalActivities: highWorkload,
      support_opportunities: [],
      requestedDomains: ['training'],
    });
    assert.equal(result.workloadPass, false);
    assert.equal(result.severity, 'critical');
  });
});

// ── L. No live call without env flag ─────────────────────────────────────────

describe('L — no live call without ACP_RUN_LIVE_AI_EVAL=1', () => {
  test('env flag is not set in the test environment', () => {
    assert.equal(process.env.ACP_RUN_LIVE_AI_EVAL, undefined);
  });

  test('live suite selection produces a stable subset', () => {
    const live = selectLiveSuite(EVALUATION_SCENARIOS, LIVE_SUITE_IDS);
    assert.ok(live.length >= 16);
    assert.ok(live.length <= 30);
    const ids = live.map(s => s.id);
    assert.ok(ids.every(id => LIVE_SUITE_IDS.has(id)));
  });
});

// ── M. Stable scenario selection ──────────────────────────────────────────────

describe('M — stable scenario selection', () => {
  test('same scenario IDs selected on every call (deterministic)', () => {
    const a = selectLiveSuite(EVALUATION_SCENARIOS, LIVE_SUITE_IDS).map(s => s.id);
    const b = selectLiveSuite(EVALUATION_SCENARIOS, LIVE_SUITE_IDS).map(s => s.id);
    assert.deepEqual(a, b);
  });

  test('ablation IDs are all present in EVALUATION_SCENARIOS', () => {
    for (const id of ABLATION_IDS) {
      assert.ok(EVALUATION_SCENARIOS.some(s => s.id === id), `ablation ID ${id} not found in scenarios`);
    }
  });
});

// ── N. JSON result serialization ──────────────────────────────────────────────

describe('N — JSON serialization', () => {
  test('ScenarioGrading round-trips through JSON without loss', () => {
    const s = EVALUATION_SCENARIOS[0];
    const result = gradeScenario(s, {
      decision: 'keep',
      rationale: 'Good week.',
      previousActivities: s.currentPlanActivities,
      finalActivities: s.currentPlanActivities,
      support_opportunities: [],
      requestedDomains: ['training'],
    });
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.overallPass, result.overallPass);
    assert.equal(parsed.severity, result.severity);
    assert.equal(parsed.decisionPass, result.decisionPass);
  });
});

// ── O. Threshold-analysis calculation ────────────────────────────────────────

describe('O — threshold-analysis calculation', () => {
  test('produces one row per threshold', () => {
    const rows = calcThresholdAnalysis([
      { similarity: 0.45, isRelevant: true },
      { similarity: 0.28, isRelevant: false },
      { similarity: 0.32, isRelevant: true },
    ], [0.25, 0.30, 0.35, 0.40]);
    assert.equal(rows.length, 4);
  });

  test('at threshold 0.3 retains 0.32 but not 0.28', () => {
    const rows = calcThresholdAnalysis([
      { similarity: 0.32, isRelevant: true },
      { similarity: 0.28, isRelevant: false },
    ], [0.3]);
    assert.equal(rows[0].relevantRetained, 1);
    assert.equal(rows[0].irrelevantRetained, 0);
  });

  test('returns empty queries when nothing passes threshold', () => {
    const rows = calcThresholdAnalysis([
      { similarity: 0.2, isRelevant: false },
    ], [0.5]);
    assert.equal(rows[0].emptyQueries, 1);
    assert.equal(rows[0].relevantRetained, 0);
  });
});

// ── Domain-request builder integration ───────────────────────────────────────

describe('domain-request builder (production function)', () => {
  test('C1 scenario (time barrier, low adherence) requests coaching domain', () => {
    const s = EVALUATION_SCENARIOS.find(s => s.id === 'C1')!;
    const requests = buildDomainRequestsForScenario(s);
    assert.ok(requests.some(r => r.domain === 'coaching'));
  });

  test('H1 scenario (repeated challenging sessions) requests recovery domain', () => {
    const s = EVALUATION_SCENARIOS.find(s => s.id === 'H1')!;
    const requests = buildDomainRequestsForScenario(s);
    assert.ok(requests.some(r => r.domain === 'recovery'));
  });

  test('B4 scenario (reduce_stress, no barriers) does NOT request nutrition', () => {
    const s = EVALUATION_SCENARIOS.find(s => s.id === 'B4')!;
    const requests = buildDomainRequestsForScenario(s);
    assert.ok(!requests.some(r => r.domain === 'nutrition'));
  });

  test('I2 scenario (nutrition barrier) requests nutrition domain', () => {
    const s = EVALUATION_SCENARIOS.find(s => s.id === 'I2')!;
    const requests = buildDomainRequestsForScenario(s);
    assert.ok(requests.some(r => r.domain === 'nutrition'));
  });

  test('same scenario always produces the same domain requests (deterministic)', () => {
    const s = EVALUATION_SCENARIOS.find(s => s.id === 'A1')!;
    const a = buildDomainRequestsForScenario(s);
    const b = buildDomainRequestsForScenario(s);
    assert.deepEqual(a, b);
  });
});

// ── Quality gate ──────────────────────────────────────────────────────────────

describe('quality gate', () => {
  test('PASS when all rates meet thresholds', () => {
    const r = evaluateQualityGate({
      criticalFailures: 0, goalMutations: 0, supplyBoundaryViolations: 0,
      fabricatedNutrientFacts: 0, planValidityRate: 0.96, decisionPassRate: 0.92,
      domainPassRate: 0.9, liveCount: 24,
    });
    assert.equal(r.gate, 'PASS');
  });

  test('FAIL when criticalFailures > 0', () => {
    const r = evaluateQualityGate({
      criticalFailures: 1, goalMutations: 0, supplyBoundaryViolations: 0,
      fabricatedNutrientFacts: 0, planValidityRate: 0.97, decisionPassRate: 0.93,
      domainPassRate: 0.92, liveCount: 24,
    });
    assert.equal(r.gate, 'FAIL');
    assert.ok(r.reasons.some(r => r.includes('critical')));
  });

  test('PARTIAL PASS when live sample is too small', () => {
    const r = evaluateQualityGate({
      criticalFailures: 0, goalMutations: 0, supplyBoundaryViolations: 0,
      fabricatedNutrientFacts: 0, planValidityRate: 1, decisionPassRate: 1,
      domainPassRate: 1, liveCount: 5,
    });
    assert.equal(r.gate, 'PARTIAL PASS');
  });

  test('FAIL when decision pass rate is below threshold', () => {
    const r = evaluateQualityGate({
      criticalFailures: 0, goalMutations: 0, supplyBoundaryViolations: 0,
      fabricatedNutrientFacts: 0, planValidityRate: 0.95, decisionPassRate: 0.7,
      domainPassRate: 0.9, liveCount: 24,
    });
    assert.equal(r.gate, 'FAIL');
  });
});

// ── Decision distribution ─────────────────────────────────────────────────────

describe('decision distribution', () => {
  test('counts each decision value correctly', () => {
    const dist = computeDecisionDistribution(['keep', 'keep', 'progress', 'simplify', 'keep']);
    assert.equal(dist.keep, 3);
    assert.equal(dist.progress, 1);
    assert.equal(dist.simplify, 1);
    assert.equal(dist.rebalance, 0);
    assert.equal(dist.adjust, 0);
  });
});

// ── Pass rates ────────────────────────────────────────────────────────────────

describe('computePassRates', () => {
  test('all-pass input produces 1.0 rates and 0 failures', () => {
    const fakeGrading = {
      decisionPass: true, domainPass: true, workloadPass: true, continuityPass: true,
      supportPass: true, goalPass: true, groundingWarnings: [], overallPass: true,
      severity: 'pass' as const,
      detail: {} as any,
    };
    const rates = computePassRates([fakeGrading, fakeGrading]);
    assert.equal(rates.decisionPassRate, 1);
    assert.equal(rates.groundingWarningCount, 0);
    assert.equal(rates.criticalFailures, 0);
  });

  test('handles empty gradings array gracefully', () => {
    const rates = computePassRates([]);
    assert.equal(rates.decisionPassRate, 0);
  });
});

// ── Severity classifier ───────────────────────────────────────────────────────

describe('classifySeverity', () => {
  test('critical when goalPass is false', () => {
    const s = classifySeverity({ decisionPass: true, domainPass: true, workloadPass: true, continuityPass: true, supportPass: true, goalPass: false, groundingWarnings: [] });
    assert.equal(s, 'critical');
  });

  test('critical when workloadPass is false', () => {
    const s = classifySeverity({ decisionPass: true, domainPass: true, workloadPass: false, continuityPass: true, supportPass: true, goalPass: true, groundingWarnings: [] });
    assert.equal(s, 'critical');
  });

  test('major when decisionPass is false', () => {
    const s = classifySeverity({ decisionPass: false, domainPass: true, workloadPass: true, continuityPass: true, supportPass: true, goalPass: true, groundingWarnings: [] });
    assert.equal(s, 'major');
  });

  test('minor when only groundingWarnings present', () => {
    const s = classifySeverity({ decisionPass: true, domainPass: true, workloadPass: true, continuityPass: true, supportPass: true, goalPass: true, groundingWarnings: ['some warning'] });
    assert.equal(s, 'minor');
  });

  test('pass when everything is clean', () => {
    const s = classifySeverity({ decisionPass: true, domainPass: true, workloadPass: true, continuityPass: true, supportPass: true, goalPass: true, groundingWarnings: [] });
    assert.equal(s, 'pass');
  });
});
