// ACP Intelligence™ Day 7.5 — corpus relevance map.
// For each approved seed document, lists which benchmark scenario tags
// (goal / experience / barrier / topic) it is genuinely relevant to.
// Labels are conservative — inferred from actual content, not just title.
//
// Day 7.5C added 8 documents (7 training, 1 recovery) to close the
// goal/experience coverage gaps the Day 7.5B baseline exposed — 9 → 17.

export interface CorpusDocumentEntry {
  documentKey: string;
  title: string;
  domain: 'training' | 'nutrition' | 'recovery' | 'coaching';
  sourceType: 'internal';
  chunkCount: number;
  metadata: {
    goals?: string[];
    experience_levels?: string[];
    activities?: string[];
    topics?: string[];
    barriers?: string[];
    locale?: string[];
    [key: string]: unknown;
  };
  // Benchmark scenario IDs where this document is genuinely likely to help.
  relevantScenarioIds: string[];
  // Scenario tags this document is relevant to (goal/experience/barrier/topic).
  relevantTags: string[];
  notes: string;
}

export const CORPUS_MAP: CorpusDocumentEntry[] = [
  {
    documentKey: 'beginner-strength-consistency',
    title: 'Beginner Strength Consistency',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['build_muscle', 'general_fitness'],
      experience_levels: ['beginner'],
      activities: ['gym'],
      topics: ['consistency', 'frequency'],
    },
    relevantScenarioIds: ['A1', 'A3', 'F1', 'F2', 'J1', 'M2'],
    relevantTags: ['beginner', 'strength', 'consistency', 'build_muscle', 'general_fitness'],
    notes: 'Relevant when user is a beginner doing gym strength work. Not useful for experienced users or non-strength goals.',
  },
  {
    documentKey: 'progressive-overload',
    title: 'Progressive Overload',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['build_muscle'],
      experience_levels: ['beginner', 'intermediate'],
      activities: ['gym'],
      topics: ['progression', 'progressive_overload'],
    },
    relevantScenarioIds: ['A1', 'A3', 'B2', 'G1', 'G3'],
    relevantTags: ['build_muscle', 'progression', 'beginner', 'intermediate'],
    notes: 'Relevant when training domain fires for build_muscle goal. Less directly relevant for cardio/mobility-only plans.',
  },
  {
    documentKey: 'recovery-between-demanding-sessions',
    title: 'Recovery Between Demanding Strength Sessions',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 1,
    metadata: {
      goals: ['build_muscle'],
      experience_levels: ['beginner', 'intermediate'],
      activities: ['gym'],
      topics: ['recovery', 'session_spacing'],
    },
    relevantScenarioIds: ['H1', 'H2', 'H3', 'C2'],
    relevantTags: ['recovery', 'session_spacing', 'build_muscle', 'strength', 'challenging'],
    notes: 'Directly relevant for back-to-back challenging sessions (H group). Also relevant for overloaded beginner plans (C2).',
  },
  {
    documentKey: 'balanced-meal-composition',
    title: 'Balanced Meal Composition',
    domain: 'nutrition',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      topics: ['meal_composition'],
      locale: ['global'],
    },
    relevantScenarioIds: ['I1', 'I3', 'B1'],
    relevantTags: ['meal_composition', 'nutrition', 'variety'],
    notes: 'General nutrition guidance, no goal/experience filter in metadata. Relevant whenever nutrition domain fires. No specific macro amounts — safe for all scenarios.',
  },
  {
    documentKey: 'protein-goal-supportive',
    title: 'Protein As Part of Goal-Supportive Nutrition',
    domain: 'nutrition',
    sourceType: 'internal',
    chunkCount: 1,
    metadata: {
      goals: ['build_muscle', 'lose_weight'],
      topics: ['protein'],
    },
    relevantScenarioIds: ['I1', 'I2', 'I3', 'A4', 'B1', 'D1'],
    relevantTags: ['protein', 'build_muscle', 'lose_weight', 'nutrition'],
    notes: 'Relevant for build_muscle and lose_weight goals when nutrition domain fires. Content is intent-level (no gram amounts), so grounding-safe.',
  },
  {
    documentKey: 'recovery-rest-principle',
    title: 'Recovery and Rest Principle',
    domain: 'recovery',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      activities: ['strength'],
      topics: ['rest', 'recovery'],
    },
    relevantScenarioIds: ['H1', 'H2', 'H3', 'C2', 'G1'],
    relevantTags: ['rest', 'recovery', 'strength', 'overtraining'],
    notes: 'Describes rest as part of the training process and signs of insufficient recovery. Retrieves on recovery domain queries.',
  },
  {
    documentKey: 'reducing-friction-time-barrier',
    title: 'Reducing Friction When Time Is A Barrier',
    domain: 'coaching',
    sourceType: 'internal',
    chunkCount: 1,
    metadata: {
      barriers: ['time'],
      topics: ['consistency', 'time_management'],
    },
    relevantScenarioIds: ['E1', 'E2', 'E4', 'C1'],
    relevantTags: ['time', 'time_barrier', 'shorter_sessions', 'consistency'],
    notes: 'Highly specific to time barrier. Should NOT influence decisions where no time barrier exists (L1 test case).',
  },
  {
    documentKey: 'confidence-through-achievable-sessions',
    title: 'Confidence Through Achievable Sessions',
    domain: 'coaching',
    sourceType: 'internal',
    chunkCount: 1,
    metadata: {
      barriers: ['confidence'],
      topics: ['confidence'],
    },
    relevantScenarioIds: ['F1', 'F2', 'F3', 'C3'],
    relevantTags: ['confidence', 'beginner', 'achievable'],
    notes: 'Relevant for confidence barrier only. Content is about starting easy to build habit.',
  },
  {
    documentKey: 'accountability-and-consistency',
    title: 'Accountability and Consistency',
    domain: 'coaching',
    sourceType: 'internal',
    chunkCount: 1,
    metadata: {
      barriers: ['accountability'],
      topics: ['consistency', 'accountability'],
    },
    relevantScenarioIds: ['C5', 'D3', 'J4'],
    relevantTags: ['accountability', 'consistency', 'check-in'],
    notes: 'Relevant for accountability barrier. General coaching on check-ins; no specific workout prescriptions.',
  },
  // ── Day 7.5C Correction D — targeted training-corpus expansion ────────────
  {
    documentKey: 'intermediate-strength-progression',
    title: 'Intermediate Strength Progression',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['build_muscle', 'general_fitness'],
      experience_levels: ['intermediate'],
      activities: ['gym'],
      topics: ['progression', 'strength'],
    },
    relevantScenarioIds: ['H1', 'H2', 'G3', 'A2', 'D2'],
    relevantTags: ['intermediate', 'build_muscle', 'general_fitness', 'progression', 'strength'],
    notes: 'Fills the intermediate build_muscle/general_fitness progression gap. Emphasises progression without adding sessions, and recovery pacing — supports KEEP/REBALANCE over PROGRESS for H1.',
  },
  {
    documentKey: 'experienced-strength-progression',
    title: 'Experienced Strength Progression',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['build_muscle', 'general_fitness'],
      experience_levels: ['advanced', 'experienced'],
      activities: ['gym'],
      topics: ['progression', 'strength'],
    },
    relevantScenarioIds: ['G1', 'G2', 'G3'],
    relevantTags: ['experienced', 'advanced', 'build_muscle', 'progression', 'strength'],
    notes: 'Fills the experienced-level training gap (G group previously retrieved beginner-targeted chunks). Frequency is not the default progression lever; recovery context still applies.',
  },
  {
    documentKey: 'general-fitness-progression',
    title: 'General Fitness Progression',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['general_fitness', 'maintain_weight'],
      topics: ['progression', 'consistency'],
    },
    relevantScenarioIds: ['A2', 'D3', 'F2', 'H2', 'J2'],
    relevantTags: ['general_fitness', 'maintain_weight', 'progression', 'consistency'],
    notes: 'No experience/activity filter — applies to any general_fitness plan. Consistency over continuously added volume.',
  },
  {
    documentKey: 'exercise-planning-weight-loss',
    title: 'Exercise Planning for Weight-Loss Goals',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['lose_weight'],
      topics: ['progression', 'consistency'],
    },
    relevantScenarioIds: ['D1', 'A4', 'B1', 'C1', 'I2'],
    relevantTags: ['lose_weight', 'progression', 'consistency'],
    notes: 'Directly addresses D1: a slow/flat weight trend is not a reason to add exercise; keep the plan executable. No causal weight-change language.',
  },
  {
    documentKey: 'running-cardio-progression',
    title: 'Running and Cardio Progression',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['improve_running', 'general_fitness', 'lose_weight'],
      activities: ['running', 'walking', 'cycling'],
      topics: ['progression', 'cardio', 'recovery'],
    },
    relevantScenarioIds: ['D1', 'E1', 'J3', 'A4'],
    relevantTags: ['running', 'cardio', 'improve_running', 'progression'],
    notes: 'Fills the cardio-specific training gap. Gradual, one-variable-at-a-time progression; consistency over big jumps.',
  },
  {
    documentKey: 'training-for-stress-reduction',
    title: 'Training for Stress Reduction and General Wellbeing',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      goals: ['reduce_stress'],
      activities: ['yoga', 'walking'],
      topics: ['consistency', 'wellbeing', 'progression'],
    },
    relevantScenarioIds: ['F3', 'K1'],
    relevantTags: ['reduce_stress', 'wellbeing', 'consistency'],
    notes: 'Fills the reduce_stress training gap. Progression need not mean more intensity/volume for a wellbeing goal.',
  },
  {
    documentKey: 'managing-inconsistent-adherence',
    title: 'Managing Training During Inconsistent Adherence',
    domain: 'training',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      topics: ['adherence', 'executability', 'consistency'],
    },
    relevantScenarioIds: ['D1', 'D2', 'D3', 'C1', 'C3'],
    relevantTags: ['adherence', 'executability', 'consistency'],
    notes: 'No goal/experience filter — retrievable across goals when adherence is the issue. Executability before workload; a positive trend at low adherence is not a reason to add volume.',
  },
  // ── Day 7.5C Correction C — actionable recovery-spacing principle ─────────
  {
    documentKey: 'recovery-spacing-before-progression',
    title: 'Recovery Spacing Before Progression',
    domain: 'recovery',
    sourceType: 'internal',
    chunkCount: 2,
    metadata: {
      activities: ['strength'],
      topics: ['recovery', 'session_spacing', 'progression'],
    },
    relevantScenarioIds: ['H1', 'H2', 'H3'],
    relevantTags: ['recovery', 'session_spacing', 'progression', 'completion_not_readiness'],
    notes: 'Added for H1: completion is not readiness; redistribute closely-spaced demanding sessions before adding workload. Retrieves on the recovery-domain "closely scheduled" query.',
  },
];

// Domain distribution summary (used in Day 7.5 corpus-gap report).
export const CORPUS_SUMMARY = {
  total: CORPUS_MAP.length,
  byDomain: {
    training: CORPUS_MAP.filter(d => d.domain === 'training').length,
    nutrition: CORPUS_MAP.filter(d => d.domain === 'nutrition').length,
    recovery: CORPUS_MAP.filter(d => d.domain === 'recovery').length,
    coaching: CORPUS_MAP.filter(d => d.domain === 'coaching').length,
  },
  totalChunks: CORPUS_MAP.reduce((s, d) => s + d.chunkCount, 0),
};

// P0/P1/P2 corpus gaps identified from benchmark coverage.
// `status`: 'addressed' entries were closed by the Day 7.5C corpus expansion
// (Corrections C/D); 'open' entries are deliberately out of Day 7.5C scope.
export const CORPUS_GAPS = [
  { priority: 'P0', topic: 'Intermediate strength progression', status: 'addressed', rationale: 'Closed by "Intermediate Strength Progression" (Day 7.5C) — progression without adding sessions, recovery-paced.' },
  { priority: 'P0', topic: 'Recovery spacing and scheduling', status: 'addressed', rationale: 'Closed by "Recovery Spacing Before Progression" (Day 7.5C) — completion is not readiness; redistribute before adding.' },
  { priority: 'P1', topic: 'Running / cardio progression', status: 'addressed', rationale: 'Closed by "Running and Cardio Progression" (Day 7.5C).' },
  { priority: 'P1', topic: 'Managing inconsistent adherence', status: 'addressed', rationale: 'Closed by "Managing Training During Inconsistent Adherence" (Day 7.5C).' },
  { priority: 'P1', topic: 'Nutrition consistency for fat loss', status: 'open', rationale: 'B1, I1, I3 need goal-specific nutrition principles. Out of Day 7.5C scope — nutrition query templates and corpus are deliberately left unchanged this pass.' },
  { priority: 'P2', topic: 'Experienced training periodization', status: 'addressed', rationale: 'Closed by "Experienced Strength Progression" (Day 7.5C) — frequency is not the default lever.' },
  { priority: 'P2', topic: 'Motivation as a barrier', status: 'open', rationale: 'K1 has a motivation barrier. Partly served now via goal-tagged wellbeing/consistency content, but no barrier:motivation coaching document was added this pass.' },
];
