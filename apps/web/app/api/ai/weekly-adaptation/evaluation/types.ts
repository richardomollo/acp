// ACP Intelligence™ Day 7.5 — evaluation types.
// Pure types only — no imports that pull in runtime dependencies.
import type { AdaptationDecision } from '../adaptation.ts';
import type { KnowledgeDomain, KnowledgeSearchResult } from '../../../../../lib/knowledge/types.ts';
import type { StartingPlanActivity, SupportOpportunity } from '../../onboarding-assessment/assessment.ts';

export interface ScenarioUserContext {
  goal: string | null;
  experience: string | null;
  barriers: string[];
  preferredActivities: string[];
  weeklyMinutesBudget: number;
}

// Matches BehaviourSummary from adaptation.ts — duplicated here to avoid the
// import in a pure-types file, but must stay structurally identical.
export interface ScenarioBehaviourEvidence {
  planned_sessions: number;
  completed_sessions: number;
  planned_minutes: number;
  completed_known_minutes: number;
  has_known_duration: boolean;
  adherence_rate: number;
  completed_by_category: Record<string, number>;
  missed_by_category: Record<string, number>;
  completion_sources: Record<string, number>;
}

export interface ScenarioExpected {
  allowedDecisions: AdaptationDecision[];
  forbiddenDecisions?: AdaptationDecision[];
  expectedKnowledgeDomains?: KnowledgeDomain[];
  forbiddenKnowledgeDomains?: KnowledgeDomain[];
  mustPreserveActivities?: string[];   // category names that must appear in final plan
  mustNotAddActivities?: string[];     // category names that must NOT appear in final plan
  // 0 = no workload increase allowed; absent = default guardrails apply
  maxWorkloadIncrease?: number;
  // none: no support_opportunities; high_forbidden: PT must not be high
  supportExpectation?: 'none' | 'optional' | 'high_forbidden';
  // literal substrings that should trigger a grounding warning if found in rationale
  forbiddenRationalePhrases?: string[];
  notes?: string[];
}

// Day 9 — per-activity execution records for a scenario (already-computed
// user feedback: partial/skip state, difficulty tap). The evaluation runner
// reconciles these into a compact EXECUTION EVIDENCE prompt block.
export interface ScenarioExecutionRecord {
  activityIndex: number;
  executionStatus: 'planned' | 'completed' | 'partial' | 'skipped';
  difficulty?: 'too_easy' | 'about_right' | 'too_hard';
  skipReason?: 'no_time' | 'low_energy' | 'too_difficult' | 'schedule_changed' | 'equipment_unavailable' | 'not_in_mood' | 'other';
}

export interface EvaluationScenario {
  id: string;
  description: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N';
  userContext: ScenarioUserContext;
  currentPlanActivities: StartingPlanActivity[];
  behaviourEvidence: ScenarioBehaviourEvidence;
  outcomePatterns?: { type: string; metric: string; confidence: string; evidence: string }[];
  longitudinalPatterns?: { type: string; subject: string; confidence: string; evidence: string }[];
  /** Day 9 — execution feedback for this week; absent = legacy binary-only week. */
  executionRecords?: ScenarioExecutionRecord[];
  expected: ScenarioExpected;
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface DomainGradeResult {
  pass: boolean;
  requestedDomains: KnowledgeDomain[];
  unexpectedDomains: KnowledgeDomain[];
  missingDomains: KnowledgeDomain[];
  forbiddenPresent: KnowledgeDomain[];
}

export interface DecisionGradeResult {
  pass: boolean;
  actual: string;
  allowed: string[];
  forbidden: string[];
}

export interface WorkloadGradeResult {
  pass: boolean;
  previousMinutes: number;
  nextMinutes: number;
  deltaPercent: number;
  violation?: string;
}

export interface ContinuityGradeResult {
  pass: boolean;
  removedCategories: string[];
  addedCategories: string[];
  preservedRequired: string[];
  missingRequired: string[];
  forbiddenPresent: string[];
}

export interface GroundingGradeResult {
  warnings: string[];
}

export interface SupportGradeResult {
  pass: boolean;
  reason?: string;
}

export interface GoalImmutabilityResult {
  pass: boolean;
  reason?: string;
}

export type FailureSeverity = 'critical' | 'major' | 'minor';

export interface ScenarioGrading {
  decisionPass: boolean;
  domainPass: boolean;
  workloadPass: boolean;
  continuityPass: boolean;
  supportPass: boolean;
  goalPass: boolean;
  groundingWarnings: string[];
  overallPass: boolean;
  severity: FailureSeverity | 'pass';
  detail: {
    decision: DecisionGradeResult;
    domain: DomainGradeResult;
    workload: WorkloadGradeResult;
    continuity: ContinuityGradeResult;
    support: SupportGradeResult;
    goal: GoalImmutabilityResult;
    grounding: GroundingGradeResult;
  };
}

export interface RetrievalEvalResult {
  domain: KnowledgeDomain;
  query: string;
  resultCount: number;
  topSimilarity: number | null;
  chunks: Array<{ chunkId: string; title: string; similarity: number; relevant: boolean | null }>;
  domainPass: boolean;
}

export interface WeeklyAdaptationEvaluationResult {
  scenarioId: string;
  description: string;
  group: string;

  retrieval: {
    requests: Array<{ domain: KnowledgeDomain; query: string }>;
    results: RetrievalEvalResult[];
    domainPass: boolean;
  };

  generation?: {
    decision: AdaptationDecision;
    rationale: string;
    rawActivities: StartingPlanActivity[];
    support_opportunities: SupportOpportunity[];
  };

  guardrails?: {
    finalActivities: StartingPlanActivity[];
    interventions: string[];
  };

  grading: ScenarioGrading;

  timing?: {
    retrievalMs?: number;
    generationMs?: number;
    totalMs?: number;
  };
}

// ── Threshold analysis ────────────────────────────────────────────────────────

export interface ThresholdRow {
  threshold: number;
  relevantRetained: number;
  irrelevantRetained: number;
  emptyQueries: number;
  totalQueries: number;
}

// ── Aggregate report ──────────────────────────────────────────────────────────

export interface EvaluationReport {
  runAt: string;
  model: string;
  scenarioCount: number;
  liveCount: number;
  results: WeeklyAdaptationEvaluationResult[];
  summary: {
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
    keepRate?: number;
    progressRate?: number;
    simplifyRate?: number;
    rebalanceRate?: number;
    adjustRate?: number;
  };
  qualityGate: 'PASS' | 'PARTIAL PASS' | 'FAIL';
  qualityGateReasons: string[];
}
