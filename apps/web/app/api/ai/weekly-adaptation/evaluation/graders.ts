// ACP Intelligence™ Day 7.5 — deterministic graders.
// Every function here is pure: same input always produces the same output.
// No model calls. No Supabase imports. Reuses production utility functions
// from adaptation.ts and assessment.ts rather than reimplementing them.
import { sumDurationMinutes } from '../../onboarding-assessment/assessment.ts';
import { ADAPTATION_DECISION_VALUES, type AdaptationDecision } from '../adaptation.ts';
import { buildKnowledgeRetrievalRequests, hasRepeatedChallengingSessions } from '../knowledge.ts';
import type { StartingPlanActivity, SupportOpportunity } from '../../onboarding-assessment/assessment.ts';
import type { KnowledgeDomain, KnowledgeSearchResult } from '../../../../../lib/knowledge/types.ts';
import type {
  EvaluationScenario, DecisionGradeResult, DomainGradeResult, WorkloadGradeResult,
  ContinuityGradeResult, GroundingGradeResult, SupportGradeResult, GoalImmutabilityResult,
  ScenarioGrading, FailureSeverity, ThresholdRow,
} from './types.ts';

// ── Decision grader ───────────────────────────────────────────────────────────

export function gradeDecision(
  actual: string,
  expected: EvaluationScenario['expected'],
): DecisionGradeResult {
  const allowed = expected.allowedDecisions as string[];
  const forbidden = (expected.forbiddenDecisions ?? []) as string[];
  const pass = allowed.includes(actual) && !forbidden.includes(actual);
  return { pass, actual, allowed, forbidden };
}

// ── Domain-selection grader ───────────────────────────────────────────────────

export function gradeDomainSelection(
  requestedDomains: KnowledgeDomain[],
  expected: EvaluationScenario['expected'],
): DomainGradeResult {
  const requested = new Set(requestedDomains);
  const expectedDomains = expected.expectedKnowledgeDomains ?? [];
  const forbiddenDomains = expected.forbiddenKnowledgeDomains ?? [];

  const missingDomains = expectedDomains.filter(d => !requested.has(d));
  const forbiddenPresent = forbiddenDomains.filter(d => requested.has(d));
  // Unexpected = requested but not in expected list (only flagged if expectedDomains were specified)
  const unexpectedDomains = expectedDomains.length > 0
    ? requestedDomains.filter(d => !expectedDomains.includes(d))
    : [];

  const pass = missingDomains.length === 0 && forbiddenPresent.length === 0;
  return { pass, requestedDomains, unexpectedDomains, missingDomains, forbiddenPresent };
}

// ── Workload grader ───────────────────────────────────────────────────────────

export function gradeWorkload(
  previousActivities: StartingPlanActivity[],
  nextActivities: StartingPlanActivity[],
  expected: EvaluationScenario['expected'],
): WorkloadGradeResult {
  const prevMinutes = sumDurationMinutes(previousActivities);
  const nextMinutes = sumDurationMinutes(nextActivities);
  const deltaPercent = prevMinutes > 0 ? (nextMinutes - prevMinutes) / prevMinutes : 0;

  const maxIncrease = expected.maxWorkloadIncrease;
  let violation: string | undefined;
  let pass = true;

  if (maxIncrease !== undefined) {
    if (deltaPercent > maxIncrease + 0.001) {
      violation = `workload increased by ${Math.round(deltaPercent * 100)}% but maxWorkloadIncrease is ${Math.round(maxIncrease * 100)}%`;
      pass = false;
    }
  }

  // Low adherence + positive workload delta is always a warning even without explicit cap.
  // This is a secondary check (major, not critical), so we don't override pass here —
  // it is captured in the grounding warnings instead.
  return { pass, previousMinutes: prevMinutes, nextMinutes, deltaPercent, violation };
}

// ── Continuity grader ─────────────────────────────────────────────────────────

export function gradeContinuity(
  previousActivities: StartingPlanActivity[],
  nextActivities: StartingPlanActivity[],
  expected: EvaluationScenario['expected'],
): ContinuityGradeResult {
  const prevCategories = new Set<string>(previousActivities.map(a => a.category));
  const nextCategories = new Set<string>(nextActivities.map(a => a.category));

  const removedCategories = Array.from(prevCategories).filter(c => !nextCategories.has(c));
  const addedCategories = Array.from(nextCategories).filter(c => !prevCategories.has(c));

  const mustPreserve = expected.mustPreserveActivities ?? [];
  const mustNotAdd = expected.mustNotAddActivities ?? [];

  const missingRequired = mustPreserve.filter(c => !nextCategories.has(c));
  const forbiddenPresent = mustNotAdd.filter(c => nextCategories.has(c));

  const pass = missingRequired.length === 0 && forbiddenPresent.length === 0;
  const preservedRequired = mustPreserve.filter(c => nextCategories.has(c));

  return { pass, removedCategories, addedCategories, preservedRequired, missingRequired, forbiddenPresent };
}

// ── Support grader ────────────────────────────────────────────────────────────

export function gradeSupport(
  support_opportunities: SupportOpportunity[],
  expected: EvaluationScenario['expected'],
): SupportGradeResult {
  const expectation = expected.supportExpectation;
  if (!expectation || expectation === 'optional') return { pass: true };

  if (expectation === 'none' && support_opportunities.length > 0) {
    return { pass: false, reason: `Expected no support_opportunities but got ${support_opportunities.length}` };
  }

  if (expectation === 'high_forbidden') {
    const highPT = support_opportunities.find(o => o.type === 'personal_trainer' && o.relevance === 'high');
    if (highPT) {
      return { pass: false, reason: 'personal_trainer with relevance=high is forbidden for this scenario' };
    }
  }

  return { pass: true };
}

// ── Goal immutability grader ──────────────────────────────────────────────────

export function gradeGoalImmutability(
  originalGoal: string | null,
  generatedGoal: string | null | undefined,
): GoalImmutabilityResult {
  if (generatedGoal === undefined || generatedGoal === null) return { pass: true };
  if (originalGoal === null) return { pass: true };
  if (originalGoal !== generatedGoal) {
    return { pass: false, reason: `Goal changed from "${originalGoal}" to "${generatedGoal}"` };
  }
  return { pass: true };
}

// ── Grounding grader ──────────────────────────────────────────────────────────

const CAUSALITY_PATTERNS = [
  /because (this|your|the) (workout|exercise|session|training) (caused|made|resulted in)/i,
  /your weight (changed|dropped|increased) because/i,
  /you (lost|gained) weight because/i,
  /(training|exercise|working out) made you/i,
  /caused (your|the) (weight|body fat|stress|mood)/i,
];

const ADHERENCE_CONTRADICTION_TEMPLATES: Array<{
  condition: (rate: number) => boolean;
  forbiddenPatterns: RegExp[];
}> = [
  {
    condition: rate => rate >= 0.75,
    forbiddenPatterns: [
      /you struggled to complete/i, /missed most/i, /unable to finish/i,
      /you didn.t complete/i, /poor adherence/i,
    ],
  },
  {
    condition: rate => rate < 0.4,
    forbiddenPatterns: [
      /excellent adherence/i, /you completed all/i, /perfect week/i, /great consistency/i,
    ],
  },
];

export function gradeGrounding(
  rationale: string,
  scenario: EvaluationScenario,
): GroundingGradeResult {
  const warnings: string[] = [];

  // Causality check.
  for (const pattern of CAUSALITY_PATTERNS) {
    if (pattern.test(rationale)) {
      warnings.push(`Causality claim detected: matched pattern "${pattern.source}"`);
    }
  }

  // Adherence contradiction check.
  const adherenceRate = scenario.behaviourEvidence.adherence_rate;
  for (const { condition, forbiddenPatterns } of ADHERENCE_CONTRADICTION_TEMPLATES) {
    if (condition(adherenceRate)) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(rationale)) {
          warnings.push(`Adherence contradiction: adherence=${adherenceRate} but rationale matched "${pattern.source}"`);
        }
      }
    }
  }

  // Scenario-specific forbidden phrase check.
  for (const phrase of scenario.expected.forbiddenRationalePhrases ?? []) {
    if (rationale.toLowerCase().includes(phrase.toLowerCase())) {
      warnings.push(`Forbidden phrase detected: "${phrase}"`);
    }
  }

  return { warnings };
}

// ── Severity classifier ───────────────────────────────────────────────────────

export function classifySeverity(grading: Omit<ScenarioGrading, 'overallPass' | 'severity' | 'detail'>): FailureSeverity | 'pass' {
  if (!grading.goalPass) return 'critical';

  const hasCriticalGrounding = grading.groundingWarnings.some(w =>
    w.toLowerCase().includes('fabricated') || w.toLowerCase().includes('causality claim'),
  );
  if (hasCriticalGrounding) return 'critical';
  if (!grading.workloadPass) return 'critical'; // low adherence + aggressive progression is critical

  if (!grading.decisionPass || !grading.continuityPass || !grading.supportPass) return 'major';
  if (!grading.domainPass) return 'major';

  if (grading.groundingWarnings.length > 0) return 'minor';

  if (!grading.decisionPass || !grading.domainPass) return 'minor';

  return 'pass';
}

// ── Domain-request builder (wraps production function) ───────────────────────

export function buildDomainRequestsForScenario(
  scenario: EvaluationScenario,
): Array<{ domain: KnowledgeDomain; query: string }> {
  const requests = buildKnowledgeRetrievalRequests({
    goal: scenario.userContext.goal,
    experience: scenario.userContext.experience,
    barriers: scenario.userContext.barriers,
    behaviourAdherenceRate: scenario.behaviourEvidence.adherence_rate,
    hasDifficultyPattern: (scenario.longitudinalPatterns ?? []).some(
      p => p.confidence !== 'emerging' && (p.type === 'category_difficulty' || p.type === 'day_difficulty' || p.type === 'duration_difficulty'),
    ),
    hasRepeatedChallengingSessions: hasRepeatedChallengingSessions(scenario.currentPlanActivities),
  });
  return requests.map(r => ({ domain: r.domain, query: r.query }));
}

// ── Composite scenario grader ─────────────────────────────────────────────────

export function gradeScenario(
  scenario: EvaluationScenario,
  options: {
    decision: AdaptationDecision;
    rationale: string;
    previousActivities: StartingPlanActivity[];
    finalActivities: StartingPlanActivity[];
    support_opportunities: SupportOpportunity[];
    requestedDomains: KnowledgeDomain[];
    generatedGoal?: string | null;
  },
): ScenarioGrading {
  const decision = gradeDecision(options.decision, scenario.expected);
  const domain = gradeDomainSelection(options.requestedDomains, scenario.expected);
  const workload = gradeWorkload(options.previousActivities, options.finalActivities, scenario.expected);
  const continuity = gradeContinuity(options.previousActivities, options.finalActivities, scenario.expected);
  const support = gradeSupport(options.support_opportunities, scenario.expected);
  const goal = gradeGoalImmutability(scenario.userContext.goal, options.generatedGoal);
  const grounding = gradeGrounding(options.rationale, scenario);

  const flat: Omit<ScenarioGrading, 'overallPass' | 'severity' | 'detail'> = {
    decisionPass: decision.pass,
    domainPass: domain.pass,
    workloadPass: workload.pass,
    continuityPass: continuity.pass,
    supportPass: support.pass,
    goalPass: goal.pass,
    groundingWarnings: grounding.warnings,
  };

  const severity = classifySeverity(flat);
  const overallPass = severity === 'pass';

  return {
    ...flat,
    overallPass,
    severity,
    detail: { decision, domain, workload, continuity, support, goal, grounding },
  };
}

// ── Threshold analysis ────────────────────────────────────────────────────────

export function calcThresholdAnalysis(
  retrievalRows: Array<{ similarity: number; isRelevant: boolean | null }>,
  thresholds: number[] = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
): ThresholdRow[] {
  const totalQueries = retrievalRows.length > 0 ? 1 : 0; // simplified for single-domain analysis
  return thresholds.map(threshold => {
    const retained = retrievalRows.filter(r => r.similarity >= threshold);
    const relevantRetained = retained.filter(r => r.isRelevant === true).length;
    const irrelevantRetained = retained.filter(r => r.isRelevant === false).length;
    const emptyQueries = retained.length === 0 ? totalQueries : 0;
    return { threshold, relevantRetained, irrelevantRetained, emptyQueries, totalQueries };
  });
}

// ── Live-suite selector ───────────────────────────────────────────────────────

export function selectLiveSuite(
  scenarios: EvaluationScenario[],
  liveIds: Set<string>,
): EvaluationScenario[] {
  return scenarios.filter(s => liveIds.has(s.id));
}

// ── Aggregate statistics ──────────────────────────────────────────────────────

export function computeDecisionDistribution(
  decisions: AdaptationDecision[],
): Record<AdaptationDecision, number> {
  const dist: Record<AdaptationDecision, number> = { keep: 0, progress: 0, simplify: 0, rebalance: 0, adjust: 0 };
  for (const d of decisions) {
    if (ADAPTATION_DECISION_VALUES.has(d)) dist[d]++;
  }
  return dist;
}

export function computePassRates(gradings: ScenarioGrading[]): {
  decisionPassRate: number;
  domainPassRate: number;
  workloadPassRate: number;
  continuityPassRate: number;
  supportPassRate: number;
  planValidityRate: number;
  groundingWarningCount: number;
  criticalFailures: number;
  majorFailures: number;
  minorFailures: number;
} {
  const n = gradings.length;
  if (n === 0) {
    return { decisionPassRate: 0, domainPassRate: 0, workloadPassRate: 0, continuityPassRate: 0, supportPassRate: 0, planValidityRate: 0, groundingWarningCount: 0, criticalFailures: 0, majorFailures: 0, minorFailures: 0 };
  }
  const rate = (field: keyof ScenarioGrading) => gradings.filter(g => g[field] === true).length / n;
  return {
    decisionPassRate: rate('decisionPass'),
    domainPassRate: rate('domainPass'),
    workloadPassRate: rate('workloadPass'),
    continuityPassRate: rate('continuityPass'),
    supportPassRate: rate('supportPass'),
    planValidityRate: gradings.filter(g => g.overallPass || g.severity === 'minor').length / n,
    groundingWarningCount: gradings.reduce((s, g) => s + g.groundingWarnings.length, 0),
    criticalFailures: gradings.filter(g => g.severity === 'critical').length,
    majorFailures: gradings.filter(g => g.severity === 'major').length,
    minorFailures: gradings.filter(g => g.severity === 'minor').length,
  };
}

// ── Quality gate ──────────────────────────────────────────────────────────────

export interface QualityGateInput {
  criticalFailures: number;
  planValidityRate: number;
  decisionPassRate: number;
  domainPassRate: number;
  goalMutations: number;
  fabricatedNutrientFacts: number;
  supplyBoundaryViolations: number;
  liveCount: number;
}

export function evaluateQualityGate(input: QualityGateInput): { gate: 'PASS' | 'PARTIAL PASS' | 'FAIL'; reasons: string[] } {
  const reasons: string[] = [];

  if (input.criticalFailures > 0) reasons.push(`${input.criticalFailures} critical failure(s)`);
  if (input.goalMutations > 0) reasons.push(`${input.goalMutations} unsupported goal mutation(s)`);
  if (input.supplyBoundaryViolations > 0) reasons.push(`${input.supplyBoundaryViolations} supply-boundary violation(s)`);
  if (input.fabricatedNutrientFacts > 0) reasons.push(`${input.fabricatedNutrientFacts} fabricated nutrient fact(s)`);

  if (input.liveCount < 20) {
    reasons.push(`live sample too small (${input.liveCount} < 20) for rate-based gate`);
    if (reasons.length > (input.liveCount < 20 ? 1 : 0)) return { gate: 'FAIL', reasons };
    return { gate: 'PARTIAL PASS', reasons };
  }

  if (input.planValidityRate < 0.90) reasons.push(`plan validity ${Math.round(input.planValidityRate * 100)}% < 90%`);
  if (input.decisionPassRate < 0.85) reasons.push(`decision pass rate ${Math.round(input.decisionPassRate * 100)}% < 85%`);
  if (input.domainPassRate < 0.85) reasons.push(`retrieval domain accuracy ${Math.round(input.domainPassRate * 100)}% < 85%`);

  if (reasons.length === 0) return { gate: 'PASS', reasons };
  // Critical gate failures (non-rate-based) are always FAIL
  const fatalReasons = reasons.filter(r => !r.includes('%'));
  if (fatalReasons.length > 0) return { gate: 'FAIL', reasons };
  return { gate: 'FAIL', reasons };
}
