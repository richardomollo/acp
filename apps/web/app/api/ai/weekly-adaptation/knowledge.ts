// ACP Intelligence™ Day 7.4 — deterministic knowledge-retrieval orchestration
// for weekly adaptation. Pure query-building/domain-selection/formatting
// (no LLM anywhere in this file); the one async function here composes
// Day 7.1's existing retrieveKnowledge() service (unchanged, reused as-is —
// no second embedding/similarity system) and never invents a chunk.
//
// Boundary this file protects (Day 7.4 section 27/94): supply (Day 7.3) and
// meal candidates (Day 7.2) are never imported or referenced here — this
// module answers "what approved ACP knowledge is relevant?", never "what
// can ACP sell/serve right now?".
import { retrieveKnowledge, type RetrieveDeps } from '../../../../lib/knowledge/retrieval.ts';
import type { KnowledgeDomain, KnowledgeSearchResult, RetrieveKnowledgeParams } from '../../../../lib/knowledge/types.ts';

export interface KnowledgeAdaptationInput {
  goal: string | null;
  experience: string | null;
  barriers: string[];
  /** From BehaviourSummary.adherence_rate — null when there were no planned sessions to compute a rate from. */
  behaviourAdherenceRate: number | null;
  /** Any category_difficulty/day_difficulty/duration_difficulty pattern at moderate+ confidence (see longitudinal.ts). */
  hasDifficultyPattern: boolean;
  /** Two or more 'challenging'-intensity activities in the CURRENT plan (see hasRepeatedChallengingSessions below). */
  hasRepeatedChallengingSessions: boolean;
}

export interface KnowledgeRetrievalRequest {
  domain: KnowledgeDomain;
  query: string;
  goals?: string[];
  experienceLevels?: string[];
  barriers?: string[];
  topK: number;
}

// Maxima, not quotas (section 10) — zero is always a valid outcome per domain.
const DOMAIN_TOP_K: Record<KnowledgeDomain, number> = { training: 3, recovery: 2, nutrition: 2, coaching: 2 };

function adherenceLabel(rate: number | null): 'high' | 'moderate' | 'low' | 'unknown' {
  if (rate == null) return 'unknown';
  if (rate >= 0.75) return 'high';
  if (rate >= 0.4) return 'moderate';
  return 'low';
}

// Priority order only — the single most relevant barrier drives one
// predictable coaching query rather than one query per barrier (section 38
// — "keep templates testable", not a combinatorial prompt).
const COACHING_BARRIER_PRIORITY = ['time', 'confidence', 'accountability', 'consistency', 'motivation'];
const NUTRITION_RELEVANT_GOALS = new Set(['build_muscle', 'lose_weight']);

/**
 * Deterministic domain selection + query construction (section 8/37/38) —
 * no LLM anywhere in this function. Every query is a predictable template,
 * not free-form natural language, so this is directly unit-testable
 * (Test K — same input always produces the same requests).
 */
export function buildKnowledgeRetrievalRequests(input: KnowledgeAdaptationInput): KnowledgeRetrievalRequest[] {
  const requests: KnowledgeRetrievalRequest[] = [];

  // training — relevant whenever there's a goal to progress toward at all
  // (section 8's own conditions — load/category/progression, adherence,
  // outcome — are all sub-cases of "a goal exists").
  if (input.goal) {
    requests.push({
      domain: 'training',
      query: `${input.experience ?? 'general'} ${input.goal} progression with ${adherenceLabel(input.behaviourAdherenceRate)} adherence`,
      goals: [input.goal],
      experienceLevels: input.experience ? [input.experience] : undefined,
      topK: DOMAIN_TOP_K.training,
    });
  }

  // recovery — repeated demanding sessions this plan already contains, OR
  // a difficulty pattern that might call for rebalancing/re-spacing.
  if (input.hasRepeatedChallengingSessions || input.hasDifficultyPattern) {
    requests.push({
      domain: 'recovery',
      query: 'recovery when demanding sessions are closely scheduled',
      topK: DOMAIN_TOP_K.recovery,
    });
  }

  // nutrition — a stated nutrition barrier, or a goal where nutrition
  // classically matters (section 8 — "goal/outcome context makes nutrition
  // relevant"). Deliberately NOT gated on the model's own future
  // nutrition_focus choice — that would require generating first, which
  // section 7 explicitly forbids (retrieval must happen before generation).
  if (input.barriers.includes('nutrition') || (input.goal && NUTRITION_RELEVANT_GOALS.has(input.goal))) {
    requests.push({
      domain: 'nutrition',
      query: input.barriers.includes('nutrition')
        ? 'nutrition support when nutrition is a barrier'
        : `${input.goal} nutrition support relevant to current goal`,
      goals: input.goal ? [input.goal] : undefined,
      topK: DOMAIN_TOP_K.nutrition,
    });
  }

  // coaching — motivational/behavioural barriers, or adherence itself is
  // low enough that behaviour (not physiology) is the dominant problem.
  const coachingBarrier = COACHING_BARRIER_PRIORITY.find(b => input.barriers.includes(b));
  if (coachingBarrier || adherenceLabel(input.behaviourAdherenceRate) === 'low') {
    const barrier = coachingBarrier ?? 'consistency';
    requests.push({
      domain: 'coaching',
      query: `exercise consistency when ${barrier} is a repeated barrier`,
      barriers: [barrier],
      topK: DOMAIN_TOP_K.coaching,
    });
  }

  return requests;
}

export interface KnowledgeContextResult {
  domainsRequested: KnowledgeDomain[];
  resultsByDomain: Partial<Record<KnowledgeDomain, KnowledgeSearchResult[]>>;
  failedDomains: KnowledgeDomain[];
  compactContext: string;
  allChunks: KnowledgeSearchResult[];
}

const DOMAIN_LABEL: Record<KnowledgeDomain, string> = {
  training: 'Training', recovery: 'Recovery', nutrition: 'Nutrition', coaching: 'Coaching',
};
const DOMAIN_ORDER: KnowledgeDomain[] = ['training', 'recovery', 'nutrition', 'coaching'];

/**
 * Never dumps raw rows into the prompt (section 13) — a plain, numbered,
 * domain-grouped block. Pure/deterministic given its input, so it's tested
 * independent of any network call.
 */
export function buildCompactKnowledgeContext(resultsByDomain: Partial<Record<KnowledgeDomain, KnowledgeSearchResult[]>>): string {
  const sections: string[] = [];
  let counter = 1;
  for (const domain of DOMAIN_ORDER) {
    const chunks = resultsByDomain[domain];
    if (!chunks || chunks.length === 0) continue;
    const lines = chunks.map(c => `[K${counter++}] ${c.content}`);
    sections.push(`${DOMAIN_LABEL[domain]}:\n${lines.join('\n\n')}`);
  }
  if (sections.length === 0) return '';
  return `RELEVANT ACP KNOWLEDGE\n\n${sections.join('\n\n')}`;
}

export interface RetrieveForAdaptationDeps {
  retrieve?: (params: RetrieveKnowledgeParams, deps?: RetrieveDeps) => ReturnType<typeof retrieveKnowledge>;
}

/**
 * Runs every requested domain's retrieval in parallel (section 39/84) via
 * Promise.allSettled — one domain's failure (a rejected promise OR a `{ok:
 * false}` result; Day 7.1 distinguishes "zero results" from "infrastructure
 * failure", both are handled identically here: the domain is just absent
 * from context) never discards another domain's successful results
 * (section 12/85). Always resolves — this function itself never throws, so
 * a RAG outage can never fail the surrounding weekly-adaptation request.
 */
export async function retrieveKnowledgeForAdaptation(
  requests: KnowledgeRetrievalRequest[],
  deps: RetrieveForAdaptationDeps = {},
): Promise<KnowledgeContextResult> {
  const retrieve = deps.retrieve ?? retrieveKnowledge;

  const settled = await Promise.allSettled(requests.map(r => retrieve({
    query: r.query, domains: [r.domain], goals: r.goals, experienceLevels: r.experienceLevels,
    barriers: r.barriers, topK: r.topK,
    // No `status` override — production default ('approved') always applies
    // here (section 48). Tests inject a fake `retrieve`, never this param.
  })));

  const resultsByDomain: Partial<Record<KnowledgeDomain, KnowledgeSearchResult[]>> = {};
  const failedDomains: KnowledgeDomain[] = [];
  const allChunks: KnowledgeSearchResult[] = [];

  settled.forEach((outcome, i) => {
    const domain = requests[i].domain;
    if (outcome.status === 'fulfilled' && outcome.value.ok) {
      resultsByDomain[domain] = outcome.value.results;
      allChunks.push(...outcome.value.results);
    } else {
      failedDomains.push(domain);
    }
  });

  return {
    domainsRequested: requests.map(r => r.domain),
    resultsByDomain,
    failedDomains,
    compactContext: buildCompactKnowledgeContext(resultsByDomain),
    allChunks,
  };
}

/** Section 25's "repeated demanding sessions" signal — simple, deterministic, no day-adjacency scheduling model. */
export function hasRepeatedChallengingSessions(activities: { intensity: string }[]): boolean {
  return activities.filter(a => a.intensity === 'challenging').length >= 2;
}
