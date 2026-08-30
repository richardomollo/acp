// ACP Intelligence™ Day 7.5 — synthetic evaluation benchmark.
// All profiles are fictional; no real user data. 45 scenarios across 13 groups.
import type { EvaluationScenario, ScenarioBehaviourEvidence } from './types.ts';
import type { StartingPlanActivity } from '../../onboarding-assessment/assessment.ts';

// ── Builders ─────────────────────────────────────────────────────────────────

function act(overrides: Partial<StartingPlanActivity>): StartingPlanActivity {
  return {
    day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60,
    intensity: 'moderate', title: 'Strength session', description: 'Full-body gym session.',
    ...overrides,
  };
}

function beh(
  planned: number, completed: number, minutesEach: number,
  byCategory: Record<string, number>,
  missedByCategory?: Record<string, number>,
  knownDuration = true,
): ScenarioBehaviourEvidence {
  const missed = missedByCategory ?? Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, Math.max(0, planned / Object.keys(byCategory).length - v)]),
  );
  return {
    planned_sessions: planned, completed_sessions: completed,
    planned_minutes: planned * minutesEach, completed_known_minutes: completed * minutesEach,
    has_known_duration: knownDuration,
    adherence_rate: Math.round((completed / planned) * 1000) / 1000,
    completed_by_category: byCategory,
    missed_by_category: missed,
    completion_sources: { checkin: completed },
  };
}

// ── Group A — working plan (high adherence + positive outcome + no difficulty) ─

const A1: EvaluationScenario = {
  id: 'A1', group: 'A',
  description: 'Beginner build_muscle, 90% adherence, weight trending toward goal — KEEP preferred',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 3, 50, { strength: 2, cardio: 1 }, { strength: 0, cardio: 0 }),
  outcomePatterns: [{ type: 'outcome_progressing', metric: 'weight', confidence: 'moderate', evidence: '82 → 80 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    expectedKnowledgeDomains: ['training'],
    forbiddenKnowledgeDomains: ['coaching'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.3,
    supportExpectation: 'none',
    notes: ['High adherence + positive outcome — KEEP is the natural stable outcome'],
  },
};

const A2: EvaluationScenario = {
  id: 'A2', group: 'A',
  description: 'Intermediate general_fitness, 85% adherence, mixed plan working — major rewrite forbidden',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 210 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 3, 49, { strength: 2, cardio: 1, recovery: 1 }, { strength: 1, cardio: 0, recovery: 0 }),
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength', 'cardio'],
    maxWorkloadIncrease: 0.25,
    notes: ['3 of 4 completed is a good week — do not restructure'],
  },
};

const A3: EvaluationScenario = {
  id: 'A3', group: 'A',
  description: 'Beginner build_muscle, perfect adherence 3/3 — modest PROGRESS allowed but not required',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 3, 45, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    expectedKnowledgeDomains: ['training'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.5,
    notes: ['100% adherence — KEEP or conservative PROGRESS. Not a rewrite.'],
  },
};

const A4: EvaluationScenario = {
  id: 'A4', group: 'A',
  description: 'Intermediate lose_weight, 80% adherence, weight decreasing — stable plan appropriate',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 40, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'cardio', activity: 'Running', duration_minutes: 40, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 45, { strength: 2, cardio: 2 }, { strength: 0, cardio: 0 }),
  outcomePatterns: [{ type: 'outcome_progressing', metric: 'weight', confidence: 'strong', evidence: '84 → 82.1 over 4 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['strength', 'cardio'],
    maxWorkloadIncrease: 0.3,
    notes: ['All 4 sessions completed + weight trend aligned — keep the plan working'],
  },
};

// ── Group B — high adherence + flat outcome ───────────────────────────────────

const B1: EvaluationScenario = {
  id: 'B1', group: 'B',
  description: 'lose_weight, 88% adherence, weight flat — no causal claims; nutrition may be relevant',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 40, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 35, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 46, { strength: 2, cardio: 2 }, { strength: 0, cardio: 0 }),
  outcomePatterns: [{ type: 'outcome_stable', metric: 'weight', confidence: 'moderate', evidence: '78 → 77.8 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'adjust', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['strength', 'cardio'],
    maxWorkloadIncrease: 0.3,
    forbiddenRationalePhrases: ['caused', 'because this workout made', 'your weight dropped because'],
    notes: ['Flat outcome + strong adherence: do not automatically increase volume; nutrition/plan-fit is a valid consideration'],
  },
};

const B2: EvaluationScenario = {
  id: 'B2', group: 'B',
  description: 'build_muscle, 80% adherence, muscle mass flat — keep or minor adjust; no aggressive progression',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 45, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 55, { strength: 3 }, { strength: 0 }),
  outcomePatterns: [{ type: 'outcome_stable', metric: 'muscle_mass', confidence: 'moderate', evidence: '42 → 42.1 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'progress', 'adjust'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    expectedKnowledgeDomains: ['training'],
    mustPreserveActivities: ['strength'],
    notes: ['Flat muscle outcome + good adherence — small progression may be warranted; a major restructure is not'],
  },
};

const B3: EvaluationScenario = {
  id: 'B3', group: 'B',
  description: 'general_fitness, 82% adherence, no outcome data — plan stability is the priority',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'cycling'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Cycling', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'mobility', activity: 'Yoga', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 49, { strength: 2, cardio: 1, mobility: 1 }, { strength: 0, cardio: 0, mobility: 0 }),
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength', 'cardio'],
    notes: ['No outcome data, good adherence — KEEP is the natural outcome'],
  },
};

const B4: EvaluationScenario = {
  id: 'B4', group: 'B',
  description: 'reduce_stress, 90% adherence, flat mood-related outcome — no causal claims allowed',
  userContext: { goal: 'reduce_stress', experience: 'beginner', barriers: [], preferredActivities: ['yoga', 'walking'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'mobility', activity: 'Yoga', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 35, intensity: 'light' }),
    act({ day: 'Friday', category: 'mobility', activity: 'Yoga', duration_minutes: 40, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 3, 38, { mobility: 2, cardio: 1 }, { mobility: 0, cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['progress', 'simplify'],
    forbiddenKnowledgeDomains: ['nutrition'],
    forbiddenRationalePhrases: ['caused your stress to drop', 'workout made you feel'],
    mustPreserveActivities: ['mobility', 'cardio'],
    notes: ['reduce_stress goal — no outcome causality claims; KEEP is the right answer here'],
  },
};

// ── Group C — low adherence + flat outcome ────────────────────────────────────

const C1: EvaluationScenario = {
  id: 'C1', group: 'C',
  description: 'lose_weight, 25% adherence, time barrier, missed long sessions — SIMPLIFY strongly expected',
  userContext: { goal: 'lose_weight', experience: 'beginner', barriers: ['time'], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 90, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 90, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Running', duration_minutes: 90, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 90, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 1, 90, { cardio: 1 }, { strength: 2, cardio: 1 }),
  expected: {
    allowedDecisions: ['simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    mustPreserveActivities: ['cardio'],
    maxWorkloadIncrease: 0,
    supportExpectation: 'high_forbidden',
    notes: ['25% adherence + time barrier + very long sessions = SIMPLIFY. Workload increase forbidden.'],
  },
};

const C2: EvaluationScenario = {
  id: 'C2', group: 'C',
  description: 'build_muscle, 30% adherence, 6 sessions/week too many — plan too ambitious, SIMPLIFY',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(6, 2, 60, { strength: 2 }, { strength: 4 }),
  expected: {
    allowedDecisions: ['simplify'],
    forbiddenDecisions: ['progress', 'keep'],
    expectedKnowledgeDomains: ['training'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0,
    notes: ['6-session plan with 30% adherence — the plan itself is the problem'],
  },
};

const C3: EvaluationScenario = {
  id: 'C3', group: 'C',
  description: 'general_fitness, 40% adherence, confidence barrier — SIMPLIFY or REBALANCE; no volume increase',
  userContext: { goal: 'general_fitness', experience: 'beginner', barriers: ['confidence'], preferredActivities: ['gym', 'walking'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Walking', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 2, 63, { strength: 1, cardio: 1 }, { strength: 2, cardio: 0 }),
  expected: {
    allowedDecisions: ['simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    maxWorkloadIncrease: 0,
    notes: ['40% adherence + confidence barrier — plan-fit before intensity'],
  },
};

const C4: EvaluationScenario = {
  id: 'C4', group: 'C',
  description: 'lose_weight, 35% adherence, missed most cardio — REBALANCE to fewer, achievable sessions',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: ['consistency'], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'challenging' }),
  ],
  behaviourEvidence: beh(5, 2, 58, { strength: 1, cardio: 1 }, { strength: 1, cardio: 2 }),
  expected: {
    allowedDecisions: ['simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training', 'nutrition'],
    mustPreserveActivities: ['cardio', 'strength'],
    maxWorkloadIncrease: 0,
    notes: ['35% adherence + consistency barrier — workload increase forbidden'],
  },
};

const C5: EvaluationScenario = {
  id: 'C5', group: 'C',
  description: 'build_muscle, 20% adherence, accountability barrier — coaching domain; SIMPLIFY strongly',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: ['accountability'], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 1, 71, { strength: 1 }, { strength: 3 }),
  expected: {
    allowedDecisions: ['simplify'],
    forbiddenDecisions: ['progress', 'keep'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0,
    notes: ['20% adherence + accountability barrier — behaviour is the problem; plan must shrink'],
  },
};

// ── Group D — low adherence + positive outcome ────────────────────────────────

const D1: EvaluationScenario = {
  id: 'D1', group: 'D',
  description: 'lose_weight, 40% adherence, weight trending down — KEEP or SIMPLIFY; do not punish with more volume',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 2, 53, { cardio: 1, strength: 1 }, { cardio: 1, strength: 1 }),
  outcomePatterns: [{ type: 'outcome_progressing', metric: 'weight', confidence: 'moderate', evidence: '85 → 83.5 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'simplify'],
    forbiddenDecisions: ['progress'],
    maxWorkloadIncrease: 0,
    notes: ['Positive outcome despite lower adherence — respect effective lower dose; never punish with more'],
  },
};

const D2: EvaluationScenario = {
  id: 'D2', group: 'D',
  description: 'build_muscle, 35% adherence, muscle mass trending up — effective lower dose; KEEP or SIMPLIFY',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 210 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'cardio', activity: 'Running', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(5, 2, 62, { strength: 2 }, { strength: 2, cardio: 1 }),
  outcomePatterns: [{ type: 'body_composition_progressing', metric: 'muscle_mass', confidence: 'emerging', evidence: '42 → 42.6 over 2 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'simplify'],
    forbiddenDecisions: ['progress'],
    maxWorkloadIncrease: 0,
    mustPreserveActivities: ['strength'],
    notes: ['Positive outcome at low dose — do not automatically increase load'],
  },
};

const D3: EvaluationScenario = {
  id: 'D3', group: 'D',
  description: 'general_fitness, 50% adherence, no outcome data but first week positive — cautious KEEP',
  userContext: { goal: 'general_fitness', experience: 'beginner', barriers: [], preferredActivities: ['gym', 'walking'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 2, 38, { strength: 1, cardio: 1 }, { strength: 1, cardio: 1 }),
  expected: {
    allowedDecisions: ['keep', 'simplify'],
    forbiddenDecisions: ['progress'],
    maxWorkloadIncrease: 0,
    notes: ['50% adherence first week — keep or simplify; never reward low adherence with more volume'],
  },
};

// ── Group E — time barrier ────────────────────────────────────────────────────

const E1: EvaluationScenario = {
  id: 'E1', group: 'E',
  description: 'lose_weight, time barrier, missed 90-min sessions consistently — shorten, do not remove',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: ['time'], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 90, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 90, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 90, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 1, 90, { cardio: 1 }, { strength: 1, cardio: 1 }),
  expected: {
    allowedDecisions: ['simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    maxWorkloadIncrease: 0,
    notes: ['Time barrier + very long missed sessions — shorten sessions; coaching knowledge is relevant'],
  },
};

const E2: EvaluationScenario = {
  id: 'E2', group: 'E',
  description: 'build_muscle, time barrier, 50% adherence — shorter sessions not activity removal',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: ['time'], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 75, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 75, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 75, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 75, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 2, 75, { strength: 2 }, { strength: 2 }),
  expected: {
    allowedDecisions: ['simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0,
    notes: ['Time barrier — shorter sessions allowed; removing strength category not appropriate'],
  },
};

const E3: EvaluationScenario = {
  id: 'E3', group: 'E',
  description: 'general_fitness, time barrier, good adherence on SHORT sessions — preserve what works',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: ['time'], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 25, intensity: 'light' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Sunday', category: 'cardio', activity: 'Running', duration_minutes: 25, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 28, { strength: 2, cardio: 2 }, { strength: 0, cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    mustPreserveActivities: ['strength', 'cardio'],
    notes: ['Short sessions working — this is the time-barrier solution already in place; KEEP it'],
  },
};

const E4: EvaluationScenario = {
  id: 'E4', group: 'E',
  description: 'lose_weight, time barrier + 70% adherence — coaching domain expected; no aggressive removal',
  userContext: { goal: 'lose_weight', experience: 'beginner', barriers: ['time'], preferredActivities: ['running'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 2, 60, { cardio: 2 }, { cardio: 1 }),
  expected: {
    allowedDecisions: ['keep', 'simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching', 'training', 'nutrition'],
    maxWorkloadIncrease: 0,
    notes: ['70% adherence with time barrier — coaching domain should fire; shorten before remove'],
  },
};

// ── Group F — confidence / beginner ──────────────────────────────────────────

const F1: EvaluationScenario = {
  id: 'F1', group: 'F',
  description: 'Beginner, build_muscle, confidence + knowledge barriers — manageable plan; PT may be appropriate',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: ['confidence', 'knowledge'], preferredActivities: ['gym'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 40, intensity: 'light' }),
  ],
  behaviourEvidence: beh(2, 2, 40, { strength: 2 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'coaching'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.3,
    notes: ['Confidence + knowledge barriers with beginner experience make PT high relevance appropriate'],
  },
};

const F2: EvaluationScenario = {
  id: 'F2', group: 'F',
  description: 'Beginner general_fitness, confidence + low adherence — simple plan, no progression',
  userContext: { goal: 'general_fitness', experience: 'beginner', barriers: ['confidence'], preferredActivities: ['walking', 'gym'], weeklyMinutesBudget: 120 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 35, intensity: 'light' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 2, 32, { cardio: 1, strength: 1 }, { cardio: 1, strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['training', 'coaching'],
    maxWorkloadIncrease: 0,
    notes: ['Confidence barrier + beginner — never increase difficulty; achievable sessions build momentum'],
  },
};

const F3: EvaluationScenario = {
  id: 'F3', group: 'F',
  description: 'Beginner reduce_stress, 60% adherence — do not increase difficulty; coaching relevant',
  userContext: { goal: 'reduce_stress', experience: 'beginner', barriers: ['confidence'], preferredActivities: ['yoga', 'walking'], weeklyMinutesBudget: 120 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'mobility', activity: 'Yoga', duration_minutes: 35, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Friday', category: 'mobility', activity: 'Yoga', duration_minutes: 35, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 2, 33, { mobility: 1, cardio: 1 }, { mobility: 1, cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'simplify'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['coaching'],
    forbiddenKnowledgeDomains: ['nutrition'],
    maxWorkloadIncrease: 0,
    notes: ['reduce_stress + confidence + beginner — keep sessions achievable and non-threatening'],
  },
};

// ── Group G — advanced users ──────────────────────────────────────────────────

const G1: EvaluationScenario = {
  id: 'G1', group: 'G',
  description: 'Experienced build_muscle, 90% adherence — no PT assumed needed; progression only with evidence',
  userContext: { goal: 'build_muscle', experience: 'experienced', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 300 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
  ],
  behaviourEvidence: beh(4, 4, 70, { strength: 4 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training'],
    mustPreserveActivities: ['strength'],
    supportExpectation: 'high_forbidden',
    notes: ['Experienced user with strong adherence — do not suggest PT; do not oversimplify'],
  },
};

const G2: EvaluationScenario = {
  id: 'G2', group: 'G',
  description: 'Experienced general_fitness, 85% adherence, self-directed — KEEP; do not over-coach',
  userContext: { goal: 'general_fitness', experience: 'experienced', barriers: [], preferredActivities: ['gym', 'running', 'cycling'], weeklyMinutesBudget: 300 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Cycling', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(5, 5, 52, { strength: 2, cardio: 2, recovery: 1 }, { strength: 0, cardio: 0, recovery: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength', 'cardio'],
    supportExpectation: 'high_forbidden',
    notes: ['Experienced with high adherence — self-directed is appropriate; no PT needed'],
  },
};

const G3: EvaluationScenario = {
  id: 'G3', group: 'G',
  description: 'Experienced lose_weight, 75% adherence, weight stable — evidence-based adjustment only',
  userContext: { goal: 'lose_weight', experience: 'experienced', barriers: [], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 280 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
    act({ day: 'Thursday', category: 'cardio', activity: 'Running', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
  ],
  behaviourEvidence: beh(4, 3, 63, { cardio: 2, strength: 1 }, { cardio: 0, strength: 1 }),
  outcomePatterns: [{ type: 'outcome_stable', metric: 'weight', confidence: 'moderate', evidence: '78 → 77.9 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'adjust', 'rebalance'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['strength', 'cardio'],
    supportExpectation: 'high_forbidden',
    notes: ['Experienced + 75% adherence — do not over-simplify; nutrition lens is valid for flat weight outcome'],
  },
};

// ── Group H — recovery / schedule ────────────────────────────────────────────

const H1: EvaluationScenario = {
  id: 'H1', group: 'H',
  description: 'build_muscle, two challenging sessions back-to-back, 85% adherence — recovery domain expected',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 70, intensity: 'challenging' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 58, { strength: 3, recovery: 1 }, { strength: 0, recovery: 0 }),
  expected: {
    allowedDecisions: ['keep', 'rebalance'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'recovery'],
    mustPreserveActivities: ['strength'],
    notes: ['Two consecutive challenging sessions — recovery domain; REBALANCE spacing is appropriate'],
  },
};

const H2: EvaluationScenario = {
  id: 'H2', group: 'H',
  description: 'general_fitness, 3 challenging sessions, 70% adherence — recovery check; REBALANCE not simplify',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 250 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'challenging' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 3, 53, { strength: 2, cardio: 0, recovery: 1 }, { strength: 0, cardio: 1, recovery: 0 }),
  expected: {
    allowedDecisions: ['keep', 'rebalance', 'adjust'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'recovery'],
    mustPreserveActivities: ['strength'],
    notes: ['3 challenging sessions with missed cardio — recovery spacing, not a full simplification'],
  },
};

const H3: EvaluationScenario = {
  id: 'H3', group: 'H',
  description: 'build_muscle, closely spaced strength sessions with difficulty pattern — recovery domain',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
  ],
  behaviourEvidence: beh(3, 3, 60, { strength: 3 }, { strength: 0 }),
  longitudinalPatterns: [{ type: 'duration_difficulty', subject: 'long', confidence: 'moderate', evidence: '4/6 completed' }],
  expected: {
    allowedDecisions: ['keep', 'rebalance'],
    expectedKnowledgeDomains: ['training', 'recovery'],
    mustPreserveActivities: ['strength'],
    notes: ['3 consecutive challenging sessions + longitudinal difficulty — recovery domain; redistribute spacing'],
  },
};

// ── Group I — nutrition relevance ─────────────────────────────────────────────

const I1: EvaluationScenario = {
  id: 'I1', group: 'I',
  description: 'lose_weight, 90% adherence, weight flat — nutrition knowledge appropriate; no fabricated macros',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['running', 'gym'], weeklyMinutesBudget: 220 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 4, 55, { cardio: 2, strength: 2 }, { cardio: 0, strength: 0 }),
  outcomePatterns: [{ type: 'outcome_stable', metric: 'weight', confidence: 'moderate', evidence: '80 → 79.8 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['cardio', 'strength'],
    forbiddenRationalePhrases: ['eat exactly', 'grams of protein', 'calorie deficit of', 'consume 150g'],
    notes: ['Nutrition domain appropriate for lose_weight + flat outcome; zero fabricated nutrient amounts'],
  },
};

const I2: EvaluationScenario = {
  id: 'I2', group: 'I',
  description: 'build_muscle, 75% adherence, nutrition barrier explicitly stated — nutrition knowledge expected',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: ['nutrition'], preferredActivities: ['gym'], weeklyMinutesBudget: 210 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 60, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['strength'],
    forbiddenRationalePhrases: ['you must eat', 'mandatory nutrition', 'specific grams'],
    notes: ['Nutrition barrier explicit — nutrition domain fires; no fabricated meal/macro content'],
  },
};

const I3: EvaluationScenario = {
  id: 'I3', group: 'I',
  description: 'lose_weight, 80% adherence, positive weight trend — nutrition may be relevant; no mandatory referral',
  userContext: { goal: 'lose_weight', experience: 'beginner', barriers: [], preferredActivities: ['walking', 'gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Walking', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Walking', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 43, { cardio: 2, strength: 2 }, { cardio: 0, strength: 0 }),
  outcomePatterns: [{ type: 'outcome_progressing', metric: 'weight', confidence: 'moderate', evidence: '76 → 75.1 over 3 check-ins' }],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['cardio', 'strength'],
    notes: ['Working plan + nutrition domain for lose_weight — no mandatory nutritionist support'],
  },
};

// ── Group J — insufficient evidence ──────────────────────────────────────────

const J1: EvaluationScenario = {
  id: 'J1', group: 'J',
  description: 'First week ever — no longitudinal data; KEEP bias; no aggressive adaptation',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
  ],
  behaviourEvidence: beh(2, 2, 45, { strength: 2 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    expectedKnowledgeDomains: ['training'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.25,
    notes: ['First week — only one week of evidence; KEEP preferred; cautious language expected'],
  },
};

const J2: EvaluationScenario = {
  id: 'J2', group: 'J',
  description: 'Week 1, mixed adherence 2/4 — too little evidence for strong adaptation conclusion',
  userContext: { goal: 'general_fitness', experience: 'beginner', barriers: [], preferredActivities: ['gym', 'walking'], weeklyMinutesBudget: 160 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Tuesday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 2, 35, { strength: 1, cardio: 1 }, { strength: 1, cardio: 1 }),
  expected: {
    allowedDecisions: ['keep', 'simplify', 'adjust'],
    forbiddenDecisions: ['progress'],
    maxWorkloadIncrease: 0,
    notes: ['Only one week of data — cautious; no aggressive progression from single partial week'],
  },
};

const J3: EvaluationScenario = {
  id: 'J3', group: 'J',
  description: 'No outcome measurements at all — no weight/body claims; KEEP with evidence-appropriate language',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['running'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 50, { cardio: 3 }, { cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['training', 'nutrition'],
    mustPreserveActivities: ['cardio'],
    forbiddenRationalePhrases: ['your weight', 'body fat has', 'you lost'],
    notes: ['No outcome data — model must not claim weight changed; cannot infer from behaviour alone'],
  },
};

const J4: EvaluationScenario = {
  id: 'J4', group: 'J',
  description: 'Returning user after gap — 2 weeks data, insufficient for strong pattern; cautious KEEP',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: ['consistency'], preferredActivities: ['gym', 'cycling'], weeklyMinutesBudget: 200 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Cycling', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 2, 52, { strength: 1, cardio: 1 }, { strength: 1, cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'adjust'],
    forbiddenDecisions: ['progress'],
    expectedKnowledgeDomains: ['training', 'coaching'],
    maxWorkloadIncrease: 0,
    notes: ['Returning user + consistency barrier + only 2 weeks of data — cautious; no progression'],
  },
};

// ── Group K — RAG irrelevant / zero result ────────────────────────────────────

const K1: EvaluationScenario = {
  id: 'K1', group: 'K',
  description: 'Unusual barrier combination unlikely to match corpus — adaptation continues without knowledge',
  userContext: { goal: 'general_fitness', experience: 'experienced', barriers: ['motivation'], preferredActivities: ['swimming', 'cycling'], weeklyMinutesBudget: 250 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'cardio', activity: 'Swimming', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Cycling', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Swimming', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 60, { cardio: 3 }, { cardio: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    expectedKnowledgeDomains: ['coaching', 'training'],
    mustPreserveActivities: ['cardio'],
    notes: ['Swimming/cycling may not match corpus well — zero retrieval is valid; adaptation must still work'],
  },
};

const K2: EvaluationScenario = {
  id: 'K2', group: 'K',
  description: 'Experience level not well represented in corpus — empty retrieval is not an error',
  userContext: { goal: 'reduce_stress', experience: 'experienced', barriers: [], preferredActivities: ['yoga', 'cycling'], weeklyMinutesBudget: 160 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'mobility', activity: 'Yoga', duration_minutes: 40, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Cycling', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'mobility', activity: 'Yoga', duration_minutes: 40, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 3, 42, { mobility: 2, cardio: 1 }, { mobility: 0, cardio: 0 }),
  expected: {
    allowedDecisions: ['keep'],
    forbiddenDecisions: ['progress', 'simplify'],
    forbiddenKnowledgeDomains: ['nutrition'],
    mustPreserveActivities: ['mobility', 'cardio'],
    notes: ['reduce_stress + experienced + yoga/cycling — corpus unlikely to have perfect match; plan still valid'],
  },
};

// ── Group L — RAG misleading edge case ───────────────────────────────────────

const L1: EvaluationScenario = {
  id: 'L1', group: 'L',
  description: 'Time coaching knowledge retrieved BUT no time barrier + high adherence — evidence beats knowledge',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 70, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 70, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength'],
    notes: [
      'RAG may return time-barrier coaching chunk — but NO time barrier exists and adherence is 100%.',
      'Model must NOT simplify merely because knowledge mentions shorter sessions can help.',
      'User evidence always wins over retrieved knowledge.',
    ],
  },
};

const L2: EvaluationScenario = {
  id: 'L2', group: 'L',
  description: 'Beginner knowledge retrieved BUT user is experienced with perfect adherence — no over-application',
  userContext: { goal: 'build_muscle', experience: 'experienced', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 280 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 75, intensity: 'challenging' }),
    act({ day: 'Sunday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 4, 71, { strength: 4 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength'],
    supportExpectation: 'high_forbidden',
    notes: [
      'Training knowledge for beginners may be retrieved — but this user is experienced.',
      'Model must not apply beginner frequency/intensity guidelines to an experienced, fully adherent user.',
    ],
  },
};

// ── Group M — supply independence ────────────────────────────────────────────
// Structural tests: supply is absent from the adaptation data flow by design.
// These document that supply-driven plan changes would be a violation.

const M1: EvaluationScenario = {
  id: 'M1', group: 'M',
  description: 'Structural: no strength gym supply — core plan decision must be unchanged',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 210 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 60, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    mustPreserveActivities: ['strength'],
    mustNotAddActivities: ['mobility', 'sport'],
    notes: [
      'Supply context is never passed into the adaptation prompt.',
      'Plan decision (KEEP/PROGRESS) must be identical regardless of venue availability.',
    ],
  },
};

const M2: EvaluationScenario = {
  id: 'M2', group: 'M',
  description: 'Structural: abundant yoga supply — no yoga added if not in existing plan',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
    act({ day: 'Saturday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
  ],
  behaviourEvidence: beh(3, 3, 55, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['rebalance', 'simplify'],
    mustPreserveActivities: ['strength'],
    mustNotAddActivities: ['mobility'],
    notes: [
      'Supply context is never passed into adaptation — yoga supply abundance is invisible to the model.',
      'Model must not add yoga/mobility to a pure strength plan without evidence.',
    ],
  },
};

// ── Group N — Day 9 execution evidence ───────────────────────────────────────
// Execution feedback (partial/skip state, difficulty taps) is EVIDENCE for
// the next adaptation — it must sharpen reasoning without adding volatility.

const N1: EvaluationScenario = {
  id: 'N1', group: 'N',
  description: 'High completion (4/4) but 3 sessions felt too hard — do not aggressively progress',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 65, intensity: 'challenging' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'challenging' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 55, { strength: 3, recovery: 1 }, { strength: 0, recovery: 0 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'too_hard' },
    { activityIndex: 1, executionStatus: 'completed', difficulty: 'too_hard' },
    { activityIndex: 2, executionStatus: 'completed', difficulty: 'too_hard' },
    { activityIndex: 3, executionStatus: 'completed', difficulty: 'about_right' },
  ],
  expected: {
    allowedDecisions: ['keep', 'simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0,
    notes: ['Completion does not prove appropriate difficulty — repeated too_hard favours executability, never progression'],
  },
};

const N2: EvaluationScenario = {
  id: 'N2', group: 'N',
  description: 'Low completion (2/4) with 2 activities skipped for no_time — executability first',
  userContext: { goal: 'lose_weight', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 220 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'cardio', activity: 'Running', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 55, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 2, 55, { strength: 1, cardio: 1 }, { strength: 1, cardio: 1 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 1, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' },
    { activityIndex: 3, executionStatus: 'skipped', skipReason: 'no_time' },
  ],
  expected: {
    allowedDecisions: ['keep', 'simplify', 'rebalance'],
    forbiddenDecisions: ['progress'],
    mustPreserveActivities: ['strength', 'cardio'],
    maxWorkloadIncrease: 0,
    notes: ['Repeated time skips → fit the plan to available time (shorter/fewer), never remove an activity type outright'],
  },
};

const N3: EvaluationScenario = {
  id: 'N3', group: 'N',
  description: 'One session partially completed, everything else fine and about_right — partial is not failure',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 210 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Running', duration_minutes: 40, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 55, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 45, { strength: 2, cardio: 1, recovery: 1 }, { strength: 0, cardio: 0, recovery: 0 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 1, executionStatus: 'partial', difficulty: 'about_right' },
    { activityIndex: 2, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 3, executionStatus: 'completed', difficulty: 'about_right' },
  ],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength', 'cardio'],
    maxWorkloadIncrease: 0.25,
    notes: ['A single partial completion with about_right difficulty is not a missed session — do not simplify because of it'],
  },
};

const N4: EvaluationScenario = {
  id: 'N4', group: 'N',
  description: 'High completion (4/4) and 3 sessions felt too easy — conservative progression is reasonable',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 55, intensity: 'light' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 50, { strength: 3, recovery: 1 }, { strength: 0, recovery: 0 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'too_easy' },
    { activityIndex: 1, executionStatus: 'completed', difficulty: 'too_easy' },
    { activityIndex: 2, executionStatus: 'completed', difficulty: 'too_easy' },
    { activityIndex: 3, executionStatus: 'completed', difficulty: 'about_right' },
  ],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.5,
    notes: ['Repeated too_easy + strong completion may support a small progression, still bound by magnitude/continuity guards'],
  },
};

const N5: EvaluationScenario = {
  id: 'N5', group: 'N',
  description: 'High completion, a single session felt too hard once — do not overreact',
  userContext: { goal: 'build_muscle', experience: 'intermediate', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 240 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Sunday', category: 'recovery', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 4, 55, { strength: 3, recovery: 1 }, { strength: 0, recovery: 0 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 1, executionStatus: 'completed', difficulty: 'too_hard' },
    { activityIndex: 2, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 3, executionStatus: 'completed', difficulty: 'about_right' },
  ],
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.3,
    notes: ['One isolated too_hard is an observation, not a pattern — no exaggerated adaptation'],
  },
};

const N6: EvaluationScenario = {
  id: 'N6', group: 'N',
  description: 'Strength completed and about_right; running repeatedly skipped/too hard — evidence scoped to cardio',
  userContext: { goal: 'general_fitness', experience: 'intermediate', barriers: [], preferredActivities: ['gym', 'running'], weeklyMinutesBudget: 230 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Tuesday', category: 'cardio', activity: 'Running', duration_minutes: 45, intensity: 'moderate' }),
    act({ day: 'Thursday', category: 'strength', duration_minutes: 60, intensity: 'moderate' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 50, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(4, 2, 55, { strength: 2, cardio: 0 }, { strength: 0, cardio: 2 }),
  executionRecords: [
    { activityIndex: 0, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 1, executionStatus: 'skipped', skipReason: 'too_difficult' },
    { activityIndex: 2, executionStatus: 'completed', difficulty: 'about_right' },
    { activityIndex: 3, executionStatus: 'skipped', skipReason: 'too_difficult' },
  ],
  longitudinalPatterns: [{ type: 'category_difficulty', subject: 'cardio', confidence: 'moderate', evidence: '3/8 running sessions completed over 3 weeks' }],
  expected: {
    allowedDecisions: ['keep', 'rebalance', 'adjust', 'simplify'],
    forbiddenDecisions: ['progress'],
    mustPreserveActivities: ['cardio', 'strength'],
    notes: ['Difficulty is scoped to running — adjust the running sessions (shorter/easier/relocated), never conclude the user dislikes running or drop cardio entirely'],
  },
};

const N7: EvaluationScenario = {
  id: 'N7', group: 'N',
  description: 'Legacy binary completion only (no execution feedback), high adherence — existing behaviour preserved',
  userContext: { goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: ['gym'], weeklyMinutesBudget: 180 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Wednesday', category: 'strength', duration_minutes: 50, intensity: 'moderate' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 50, intensity: 'moderate' }),
  ],
  behaviourEvidence: beh(3, 3, 50, { strength: 3 }, { strength: 0 }),
  expected: {
    allowedDecisions: ['keep', 'progress'],
    forbiddenDecisions: ['simplify', 'rebalance'],
    mustPreserveActivities: ['strength'],
    maxWorkloadIncrease: 0.5,
    notes: ['No execution feedback → prompt gains no EXECUTION EVIDENCE block; behaviour must match a normal high-adherence week'],
  },
};

const N8: EvaluationScenario = {
  id: 'N8', group: 'N',
  description: 'No execution data, mixed adherence, first observed week — existing behaviour preserved',
  userContext: { goal: 'general_fitness', experience: 'beginner', barriers: [], preferredActivities: ['gym', 'walking'], weeklyMinutesBudget: 150 },
  currentPlanActivities: [
    act({ day: 'Monday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
    act({ day: 'Friday', category: 'strength', duration_minutes: 45, intensity: 'light' }),
    act({ day: 'Saturday', category: 'cardio', activity: 'Walking', duration_minutes: 30, intensity: 'light' }),
  ],
  behaviourEvidence: beh(4, 2, 38, { strength: 1, cardio: 1 }, { strength: 1, cardio: 1 }),
  expected: {
    allowedDecisions: ['keep', 'simplify'],
    forbiddenDecisions: ['progress'],
    maxWorkloadIncrease: 0,
    notes: ['No execution evidence → unchanged from the equivalent Day 7 low-ish adherence week'],
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  A1, A2, A3, A4,
  B1, B2, B3, B4,
  C1, C2, C3, C4, C5,
  D1, D2, D3,
  E1, E2, E3, E4,
  F1, F2, F3,
  G1, G2, G3,
  H1, H2, H3,
  I1, I2, I3,
  J1, J2, J3, J4,
  K1, K2,
  L1, L2,
  M1, M2,
  N1, N2, N3, N4, N5, N6, N7, N8,
];

// Day 9 — the new execution scenarios, for a bounded live validation of the
// changed adaptation prompt/context (section 67). NOT added to LIVE_SUITE_IDS,
// which stays the frozen Day 7.5 set.
export const EXECUTION_LIVE_IDS = new Set(['N1', 'N2', 'N3', 'N4', 'N5', 'N8']);

// Subset recommended for live model calls — representative coverage, manageable cost.
export const LIVE_SUITE_IDS = new Set([
  'A1', 'A3',         // working plan
  'B1', 'B4',         // high adherence flat
  'C1', 'C5',         // low adherence flat
  'D1',               // low adherence positive
  'E1', 'E3',         // time barrier
  'F1',               // confidence/beginner
  'G1',               // advanced
  'H1',               // recovery
  'I1', 'I2',         // nutrition relevance
  'J1', 'J3',         // insufficient evidence
  'K1',               // zero RAG result
  'L1', 'L2',         // RAG misleading
  'M1',               // supply independence
]);

// RAG ablation pairs — same scenario run with and without knowledge block.
export const ABLATION_IDS = new Set(['A1', 'C1', 'E1', 'F1', 'H1', 'I1']);
