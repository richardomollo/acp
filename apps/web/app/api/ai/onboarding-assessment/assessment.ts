// Pure, framework-free logic for the onboarding-assessment route — no
// Next.js/Supabase/OpenAI-SDK imports here, so it can be unit tested with
// Node's built-in test runner the same way apps/mobile/lib/onboarding.ts is.
// route.ts wires this up to the actual HTTP/auth/DB layer.
//
// Day 2: the AI now generates one canonical list of weekly activities
// (`starting_plan.activities`) instead of independently generating both a
// weekly schedule AND separate session-count numbers — the old shape let
// those two drift apart (e.g. "4 strength" while only 3 were described).
// Category counts and total minutes are always derived from `activities`
// by deriveCategoryCounts()/sumDurationMinutes(), never asked of the model.
//
// Day 3: latency + resilience + time-accuracy pass. Measured baseline: 30-90s
// per call against production with the Day 2 prompt/schema and no
// reasoning_effort/token cap set. Benchmarked fix (see AI_REQUEST_CONFIG
// below): reasoning_effort:'minimal' + a max_completion_tokens cap cut a
// small-schema test call from ~5.6s to ~1.9s; `maxLength` added to every
// string field below is a hard, schema-enforced content cap (not just a
// prompt suggestion) that keeps the full 7-activity response short enough
// to generate quickly. `temperature` is deliberately never set — this model
// rejects any value other than its default (confirmed empirically: passing
// temperature:0.3 returns a 400 "Unsupported value" error).

export type ActivityCategory = 'strength' | 'cardio' | 'recovery' | 'mobility' | 'sport';
export type ActivityIntensity = 'light' | 'moderate' | 'challenging';

export interface StartingPlanActivity {
  day: string;
  category: ActivityCategory;
  activity: string;
  duration_minutes: number;
  intensity: ActivityIntensity;
  title: string;
  description: string;
  // Day 5 — plan dating fix. Always CODE-injected (attachPlanDates below),
  // never asked of the model: the model reasons about weekday names only,
  // exactly as before. This is the one absolute, historically-stable date
  // for this activity — completion/fulfilment matching should prefer this
  // over recomputing "next occurrence of this weekday from today", which is
  // what silently turned last week's Monday into next week's Monday.
  planned_date?: string;
}

export interface StartingPlan {
  title: string;
  rationale: string;
  activities: StartingPlanActivity[];
  // Also code-injected (see attachPlanDates) — the Monday-Sunday week this
  // specific plan belongs to. Optional so an already-saved pre-Day-5 plan
  // (generated before this field existed) doesn't fail existing validation;
  // isPlanReadyForReview simply treats its absence as "not reviewable yet".
  week_start_date?: string;
  week_end_date?: string;
}

export interface WeeklyFocus {
  title: string;
  description: string;
}

// Support-recommendation fix: "approach" and "support opportunities" are two
// separate questions (see the Support Recommendation Logic Fix report for
// the full rationale). approach describes ONLY how independently the user
// can execute the plan; support_opportunities independently lists which
// forms of professional support (if any) could materially help — both may
// be present, either may be present, or neither. They are never mutually
// exclusive with each other.
export type SupportType = 'personal_trainer' | 'nutrition';
export type SupportRelevance = 'high' | 'medium';

export interface SupportOpportunity {
  type: SupportType;
  relevance: SupportRelevance;
  reason: string;
}

// Day 5 — nutrition intelligence. ACP Intelligence™ decides only the INTENT
// (which one behaviour matters this week); the food data and any nutrient
// numbers always come from ACP's real meals data, never from the model —
// see lib/nutrition-matching.ts (mobile) for the deterministic food matcher.
// Only 4 types: the meals table's real, curated tags (see the Day 5 report's
// nutrition-architecture inspection) only reliably support these four —
// "meal_consistency"/"vegetable_variety"/"hydration" were considered and
// dropped because no existing tag/data could fulfil them yet.
export type NutritionFocusType = 'protein_consistency' | 'fibre' | 'pre_training_energy' | 'post_training_recovery';

export interface NutritionFocus {
  type: NutritionFocusType;
  title: string;
  reason: string;
}

// Present only on an assessment produced by the weekly-adaptation route —
// null for the original onboarding-generated plan and for anything from
// before Day 5. Kept as its own field (rather than folded into headline/
// summary) so My Plan/Home can render "weekly review" as a visually distinct,
// one-time section, separate from the ongoing "current plan" card.
export interface WeeklyReview {
  headline: string;
  summary: string;
  wins: string[];
  focus_next_week: string;
}

// Bumped whenever the assessment shape changes meaningfully — see
// isValidAssessment/isValidAssessment (mobile) for how old rows are
// rejected safely rather than crashing. 3 = this Day 5 shape (dates +
// nutrition_focus + review); the two prior implicit shapes (Day 1/2's
// original 4-value approach enum, and the Support Recommendation Logic
// Fix's self_directed/guided + support_opportunities shape) were never
// explicitly numbered, so this is the first real version marker.
export const CURRENT_ASSESSMENT_VERSION = 3;

export interface AIAssessment {
  headline: string;
  summary: string;
  starting_point: {
    experience: string;
    available_time: string;
    main_barriers: string[];
  };
  recommendation: {
    approach: 'self_directed' | 'guided';
    title: string;
    reason: string;
  };
  // Deliberately never includes 'low' relevance entries — a low-relevance
  // opportunity isn't useful enough to surface to the user at all (see the
  // "Support Recommendation Logic Fix" report, Part 15). Max 2 entries (one
  // per type), and empty is a completely valid, common result.
  support_opportunities: SupportOpportunity[];
  starting_plan: StartingPlan;
  weekly_focus: WeeklyFocus;
  next_steps: string[];
  // Optional — always present (never undefined) on anything generated by
  // this codebase, but kept optional in the type so an old saved row (from
  // before this field existed) still structurally satisfies AIAssessment
  // rather than requiring a hard cast; isValidAssessment is what actually
  // gates whether an old row is safe to use, not the type checker.
  assessment_version?: number;
  // Null for the original onboarding plan (Day 5 explicitly keeps onboarding
  // nutrition-free — see Part 45) and for anything from before Day 5.
  nutrition_focus?: NutritionFocus | null;
  review?: WeeklyReview | null;
  // Day 5.5 — plan JSON metadata (Part 16): distinguishes a real AI-produced
  // adaptation from a deterministic carry-forward fallback, without a new
  // migration/column. Undefined is treated as 'ai_adaptation' (every plan
  // before this field existed was, in fact, AI-produced).
  generation_source?: 'ai_adaptation' | 'deterministic_fallback';
}

// Single place to change the model used for onboarding assessments.
export const AI_ASSESSMENT_MODEL = 'gpt-5-mini';

// Single place to tune the model's latency/verbosity tradeoff. Benchmarked
// empirically (see comment above) — 'minimal' reasoning effort roughly
// halved latency on its own, and capping output tokens cut it further by
// bounding hidden reasoning-token generation, not just the visible answer.
// No `temperature` key here: this model only supports its default (1) and
// errors on anything else, so it's intentionally omitted rather than set.
export const AI_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 1600,
};

const MAX_ACTIVITIES = 7;
const MAX_NEXT_STEPS = 3;

// OpenAI Structured Outputs schema (response_format: json_schema, strict).
// Every property must be listed in `required` and every object must set
// `additionalProperties: false` for strict mode to accept the schema.
// `maxLength` on every string is a hard, model-enforced content cap (not
// just a prompt request) — this is the main lever keeping the full
// 7-activity response short enough to generate quickly.
export const ASSESSMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string', maxLength: 90 },       // ~12 words
    summary: { type: 'string', maxLength: 480 },        // ~70 words
    starting_point: {
      type: 'object',
      additionalProperties: false,
      properties: {
        experience: { type: 'string', maxLength: 60 },       // short phrase
        available_time: { type: 'string', maxLength: 40 },   // short phrase
        main_barriers: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 30 } },
      },
      required: ['experience', 'available_time', 'main_barriers'],
    },
    recommendation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        approach: {
          type: 'string',
          enum: ['self_directed', 'guided'],
        },
        title: { type: 'string', maxLength: 90 },       // ~12 words
        reason: { type: 'string', maxLength: 340 },      // ~50 words
      },
      required: ['approach', 'title', 'reason'],
    },
    // Independent of "recommendation" — see the AIAssessment/SupportOpportunity
    // comments above. maxItems: 2 keeps output small (one per type) per the
    // Day 2.5 latency work; omit an entry entirely rather than including a
    // low-relevance one.
    support_opportunities: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['personal_trainer', 'nutrition'] },
          relevance: { type: 'string', enum: ['high', 'medium'] },
          reason: { type: 'string', maxLength: 220 },  // ~30-40 words
        },
        required: ['type', 'relevance', 'reason'],
      },
    },
    starting_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 60 },
        rationale: { type: 'string', maxLength: 420 },   // ~60 words
        activities: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ACTIVITIES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              day: { type: 'string', maxLength: 12 },
              category: { type: 'string', enum: ['strength', 'cardio', 'recovery', 'mobility', 'sport'] },
              activity: { type: 'string', maxLength: 40 },
              duration_minutes: { type: 'integer' },
              intensity: { type: 'string', enum: ['light', 'moderate', 'challenging'] },
              title: { type: 'string', maxLength: 50 },
              description: { type: 'string', maxLength: 220 },  // ~32 words — was 170 (~25 words), observed truncating mid-sentence in practice
            },
            required: ['day', 'category', 'activity', 'duration_minutes', 'intensity', 'title', 'description'],
          },
        },
      },
      required: ['title', 'rationale', 'activities'],
    },
    weekly_focus: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 45 },        // ~6 words
        description: { type: 'string', maxLength: 280 }, // ~40 words
      },
      required: ['title', 'description'],
    },
    next_steps: { type: 'array', minItems: 1, maxItems: MAX_NEXT_STEPS, items: { type: 'string', maxLength: 110 } }, // ~15 words each
  },
  required: ['headline', 'summary', 'starting_point', 'recommendation', 'support_opportunities', 'starting_plan', 'weekly_focus', 'next_steps'],
} as const;

// ── Available-time budget ───────────────────────────────────────────────────
// starting-point.tsx already collects the user's own stated weekly
// sport/training hours and persists it to health_profile.hours_exercising_per_week
// — a direct, explicit signal of realistic weekly time commitment. When it's
// available, it IS the canonical budget; activityLevel (a coarser bucket
// describing current behaviour, not stated availability) is no longer used
// for the budget in that case.
//
// deriveTemporaryWeeklyTimeBudgetFromActivityLevel() below is the fallback
// used only when the raw hours value isn't available (e.g. accounts that
// completed onboarding before health_profile existed, or a client that
// hasn't been updated to send it yet) — it's a deliberately conservative
// proxy, not a true availability figure, hence the explicit name.
// TODO(onboarding): there's still no dedicated "how much time can you
// realistically dedicate to training?" question distinct from "how much do
// you currently train" — see the Day 3 report for the proposed question and
// where it would go (a new field alongside sport hours on starting-point.tsx).
const ACTIVITY_LEVEL_MINUTES_BUDGET: Record<string, number> = {
  inactive: 90,        // ~1-2 short sessions
  occasional: 120,     // ~2 sessions
  active_2_3: 180,     // ~3 sessions
  active_4_plus: 240,  // ~4 sessions
  serious: 300,        // capped conservatively rather than matching "serious" literally
};
const DEFAULT_MINUTES_BUDGET = 120; // unset/unknown activityLevel — same as "occasional"

function deriveTemporaryWeeklyTimeBudgetFromActivityLevel(activityLevel: unknown): number {
  if (typeof activityLevel === 'string' && activityLevel in ACTIVITY_LEVEL_MINUTES_BUDGET) {
    return ACTIVITY_LEVEL_MINUTES_BUDGET[activityLevel];
  }
  return DEFAULT_MINUTES_BUDGET;
}

/**
 * Canonical weekly time budget, in minutes. Prefers the user's own stated
 * weekly training hours (health_profile.hours_exercising_per_week) when
 * given; otherwise falls back to the activityLevel-based proxy.
 */
export function getWeeklyMinutesBudget(activityLevel: unknown, sportHoursPerWeek?: unknown): number {
  if (typeof sportHoursPerWeek === 'number' && Number.isFinite(sportHoursPerWeek) && sportHoursPerWeek >= 0) {
    return Math.round(sportHoursPerWeek * 60);
  }
  return deriveTemporaryWeeklyTimeBudgetFromActivityLevel(activityLevel);
}

export function sumDurationMinutes(activities: { duration_minutes: number }[]): number {
  return activities.reduce((sum, a) => sum + (Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0), 0);
}

export function deriveCategoryCounts(activities: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of activities) {
    counts[a.category] = (counts[a.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * Hard-enforces the time budget programmatically rather than only asking
 * the model nicely — trims the lowest-priority (last) activities until the
 * total fits within a 15% tolerance of the budget. Never trims below one
 * activity, so a plan is never reduced to nothing.
 */
export function enforceTimeBudget(activities: StartingPlanActivity[], budgetMinutes: number): StartingPlanActivity[] {
  const tolerance = Math.round(budgetMinutes * 1.15);
  const trimmed = [...activities];
  while (trimmed.length > 1 && sumDurationMinutes(trimmed) > tolerance) {
    trimmed.pop();
  }
  return trimmed;
}

// ── Plan dating (Day 5 Part 3) ───────────────────────────────────────────────
// The model only ever reasons about weekday NAMES (unchanged) — every actual
// calendar date is computed here, in code, anchored once to a fixed
// week_start_date. This is what makes a plan historically stable: a Monday
// activity's planned_date is fixed the moment the plan is generated and
// never recomputed against "today" again (which is what the pre-Day-5
// nextDateForWeekday(day, new Date()) pattern did, and why last week's
// Monday could silently become next week's Monday on a later visit).
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// ── Training schedule preference (Beta Feedback #002) ───────────────────────
// The ONE canonical weekday representation for the training-schedule
// preference: lowercase full names, Monday-first order (the plan week is
// Monday–Sunday everywhere else in ACP). Every write path normalises to this
// before persisting; the DB CHECK on fitness_profile.preferred_training_days
// is the backstop. Never introduce Mon / Monday / MONDAY as competing forms.
export const CANONICAL_WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;
export type CanonicalWeekday = (typeof CANONICAL_WEEKDAYS)[number];

const WEEKDAY_ALIAS: Record<string, CanonicalWeekday> = (() => {
  const map: Record<string, CanonicalWeekday> = {};
  for (const d of CANONICAL_WEEKDAYS) {
    map[d] = d;
    map[d.slice(0, 3)] = d; // mon, tue, wed, ...
  }
  return map;
})();

/** "Monday" / "mon" / " MON. " / "Tues" → "monday" | "tuesday"; unknown → null. */
export function normalizeWeekdayName(input: unknown): CanonicalWeekday | null {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  return WEEKDAY_ALIAS[key] ?? WEEKDAY_ALIAS[key.slice(0, 3)] ?? null;
}

/**
 * Cleans an arbitrary preferred-training-days input into the canonical form
 * actually stored/sent: each entry normalised, unknown entries dropped,
 * duplicates removed, sorted Monday-first. Does NOT clamp the count — the
 * 2–6 range is enforced by the DB CHECK and the editing UI; an out-of-range
 * or empty result here simply means "no usable preference", which callers
 * treat exactly like NULL.
 */
export function sanitizeTrainingDays(input: unknown): CanonicalWeekday[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<CanonicalWeekday>();
  for (const raw of input) {
    const day = normalizeWeekdayName(raw);
    if (day) seen.add(day);
  }
  return CANONICAL_WEEKDAYS.filter(d => seen.has(d));
}

/** ["monday","wednesday"] → "Monday, Wednesday" for prompt prose. */
export function formatTrainingDaysForPrompt(days: CanonicalWeekday[]): string {
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
}

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** The Monday-Sunday week containing `anchor`, as ISO date strings. */
export function getWeekBounds(anchor: Date): { weekStartDate: string; weekEndDate: string } {
  const day = anchor.getDay(); // 0=Sunday..6=Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day; // days from anchor back to that week's Monday
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStartDate: toIsoDate(monday), weekEndDate: toIsoDate(sunday) };
}

/** The absolute date of `dayName` within the specific week starting `weekStartDate` — never dependent on "now". */
export function dateForWeekdayInWeek(weekStartDateIso: string, dayName: string): string | null {
  const target = WEEKDAY_INDEX[dayName.trim().toLowerCase()];
  if (target === undefined) return null;
  const monday = new Date(weekStartDateIso + 'T00:00:00Z');
  const mondayIndex = 1;
  const offset = (target - mondayIndex + 7) % 7;
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + offset);
  return toIsoDate(d);
}

/**
 * Injects week_start_date/week_end_date/planned_date/assessment_version —
 * the one place any plan (initial onboarding or a later weekly adaptation)
 * gets its dates. Never touches anything the model actually reasoned about.
 */
export function attachPlanDates(assessment: AIAssessment, weekStartDateIso: string): AIAssessment {
  const { weekStartDate, weekEndDate } = (() => {
    const monday = new Date(weekStartDateIso + 'T00:00:00Z');
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { weekStartDate: weekStartDateIso, weekEndDate: toIsoDate(sunday) };
  })();
  return {
    ...assessment,
    assessment_version: CURRENT_ASSESSMENT_VERSION,
    starting_plan: {
      ...assessment.starting_plan,
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      activities: assessment.starting_plan.activities.map(a => ({
        ...a,
        planned_date: dateForWeekdayInWeek(weekStartDate, a.day) ?? undefined,
      })),
    },
  };
}

// ── Legacy plan date upgrade (Day 5.5 Part 20-26) ───────────────────────────
// An existing user's CURRENT plan can predate Day 5 entirely (no
// week_start_date/week_end_date/planned_date at all) — such a plan already
// passes isValidAssessment (correct approach enum, has support_opportunities)
// so it is NOT the "old/stale shape, regenerate" case; it's simply undated,
// and dating it is all that's needed to bring it into the review loop.
//
// Anchored to the plan's own ORIGINAL generation timestamp — never "today" —
// so a plan generated on, say, a Wednesday keeps whichever Monday/Wednesday/
// Saturday dates fall in THAT SAME calendar week, exactly as attachPlanDates
// already computes for a brand-new plan generated on a Wednesday today. This
// is one single, already-established rule applied retroactively, not a new
// one: the plan's week is the Monday-Sunday week containing its generation
// moment, even for a weekday listed earlier in that week than the
// generation day itself.
//
// nutrition_focus/review are set to null (never fabricated) if absent —
// identical to what a normal v3 onboarding-generated plan already has, so
// claiming assessment_version 3 afterward is not misleading (see the Day 5.5
// report's versioning-decision section for the full reasoning). No OpenAI
// call is made here.
export function upgradeLegacyPlanDates(assessment: AIAssessment, generatedAtIso: string): AIAssessment {
  if (assessment.starting_plan.week_start_date && assessment.starting_plan.week_end_date) {
    return assessment; // already dated — nothing to upgrade
  }
  const { weekStartDate } = getWeekBounds(new Date(generatedAtIso));
  return attachPlanDates(
    { ...assessment, nutrition_focus: assessment.nutrition_focus ?? null, review: assessment.review ?? null },
    weekStartDate,
  );
}

// ── Deterministic support-recommendation backstop ───────────────────────────
// We identified a real failure case: the model can omit personal_trainer
// support even for an obviously beginner+low-confidence+low-knowledge+
// needs-accountability profile (see the "Support Recommendation Logic Fix"
// report's root-cause section). Rather than trust prompt compliance alone
// for this one high-confidence case, this is a narrow, explainable floor —
// NOT a replacement recommendation engine. It only ever ADDS a missing
// personal_trainer:high entry when the user's own barriers/experience
// clearly warrant it; it never removes or downgrades anything the model
// already produced, and it never touches nutrition.
const PT_EXECUTION_BARRIERS = ['confidence', 'knowledge', 'accountability', 'consistency'] as const;
const PT_BEGINNER_TRIGGER_BARRIERS = ['confidence', 'knowledge', 'accountability'] as const;

function isBeginnerExperience(onboardingAnswers: Record<string, unknown>): boolean {
  return onboardingAnswers.strengthExperience === 'beginner';
}

function presentExecutionBarriers(onboardingAnswers: Record<string, unknown>): string[] {
  const barriers = Array.isArray(onboardingAnswers.barriers)
    ? onboardingAnswers.barriers.filter((b): b is string => typeof b === 'string')
    : [];
  return PT_EXECUTION_BARRIERS.filter(b => barriers.includes(b));
}

/**
 * Deterministic copy derived ONLY from the barriers the user actually
 * selected — never claims a barrier they didn't state (Part 17 of the
 * report).
 */
function buildDeterministicPtReason(barriers: string[]): string {
  const clauses: string[] = [];
  if (barriers.includes('confidence')) clauses.push('build confidence');
  if (barriers.includes('knowledge')) clauses.push('learn the fundamentals');
  if (barriers.includes('accountability')) clauses.push('add accountability');
  if (barriers.includes('consistency')) clauses.push('build a consistent routine');
  if (clauses.length === 0) {
    return 'A trainer could help you get started with more structure while you establish your routine.';
  }
  const joined = clauses.length === 1
    ? clauses[0]
    : clauses.length === 2
      ? `${clauses[0]} and ${clauses[1]}`
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
  return `A trainer could help you ${joined} while you establish your routine.`;
}

/**
 * The single deterministic condition under which a personal_trainer:high
 * opportunity is warranted from the user's own experience + barriers alone:
 * beginner/new experience + at least one of confidence/knowledge/
 * accountability, OR two-or-more of confidence/knowledge/accountability/
 * consistency. Shared so both the onboarding backstop below and the Day 7.5C
 * weekly-adaptation support-eligibility filter (adaptation.ts's
 * enforceAdaptationSupportLogic) ask the exact same question — a stated
 * "personal_training" preference, a build_muscle goal, high adherence, or
 * provider availability are all deliberately NOT inputs here.
 */
export function isDeterministicPtWarranted(onboardingAnswers: unknown): boolean {
  const answers = (onboardingAnswers && typeof onboardingAnswers === 'object') ? onboardingAnswers as Record<string, unknown> : {};
  const barriers = presentExecutionBarriers(answers);
  const beginner = isBeginnerExperience(answers);
  return (beginner && barriers.some(b => (PT_BEGINNER_TRIGGER_BARRIERS as readonly string[]).includes(b)))
    || barriers.length >= 2;
}

/**
 * At minimum: beginner/new experience + at least one of confidence/
 * knowledge/accountability, OR two-or-more of confidence/knowledge/
 * accountability/consistency — either case must yield personal_trainer at
 * relevance:high. If the model already returned that, this is a no-op; if
 * it didn't, this adds it deterministically (no second OpenAI call) without
 * touching any nutrition entry already present.
 */
export function enforceSupportLogic(assessment: AIAssessment, onboardingAnswers: unknown): AIAssessment {
  const answers = (onboardingAnswers && typeof onboardingAnswers === 'object') ? onboardingAnswers as Record<string, unknown> : {};
  const barriers = presentExecutionBarriers(answers);

  if (!isDeterministicPtWarranted(onboardingAnswers)) return assessment;

  const existing = assessment.support_opportunities ?? [];
  const existingPt = existing.find(o => o.type === 'personal_trainer');
  if (existingPt?.relevance === 'high') return assessment; // model already got it right

  const ptOpportunity: SupportOpportunity = {
    type: 'personal_trainer',
    relevance: 'high',
    reason: buildDeterministicPtReason(barriers),
  };
  const withoutPt = existing.filter(o => o.type !== 'personal_trainer');
  return { ...assessment, support_opportunities: [ptOpportunity, ...withoutPt].slice(0, 2) };
}

// Compact by design (Day 3: cut from ~950 words to keep latency down) —
// every constraint below still matches Day 1/2 behaviour, just stated once
// instead of repeated across paragraphs. Length limits are enforced by
// ASSESSMENT_JSON_SCHEMA's `maxLength`, not just requested here.
export const SYSTEM_PROMPT = `You are ACP Intelligence™, the ACP fitness planning assistant. Read one user's onboarding answers and produce a personalised assessment plus one concrete first-week plan.

"starting_plan.activities" is the single source of truth for the week — the app derives all session counts and totals from it directly. Never state a session count anywhere else, and never let another field imply a different number of sessions than "activities" actually contains.

USER FIT
- Use only the given onboarding data; never invent facts.
- Respect the stated goal, experience level, and barriers.
- Available weekly time (given below as a maximum number of minutes) is a hard constraint — the sum of all activities' duration_minutes must not exceed it. When no preferred training days are given, prefer fewer/shorter sessions over more.
- Strongly prefer the user's stated preferred activities. Do not introduce one they didn't mention (e.g. swimming, boxing, yoga) unless their preferences genuinely cannot support the goal at all.

TRAINING SCHEDULE (only if "preferred training days" are given below)
- These are the weekdays the user prefers to train. Treat them as a STRONG preference: put the week's activities on those days and leave the other days free, and aim for roughly that many active days.
- This is NOT an instruction to make every preferred day a demanding session. Build a sensible structure across them using activity type, intensity and category — e.g. harder strength/cardio days interleaved with a lighter cardio, mobility or recovery day.
- More preferred days does NOT mean more total time. Distribute the SAME weekly time budget across the preferred days (shorter sessions), never exceed it, and never treat extra days as a reason to add volume.
- It remains a preference, not an override: if the time budget, the user's experience, or safety make honouring every day infeasible, stay within those limits and get as close to the preferred structure as is sensible.

BARRIERS (change the plan itself, not just the recommendation)
- time → fewer/shorter sessions, simpler schedule.
- consistency → fewer activity types, predictable structure.
- motivation → prioritise activities they enjoy; keep it clearly achievable.
- confidence → conservative intensity, simple activities.
- knowledge → clearer/more structured activity descriptions.
- accountability → structured support can be mentioned as optional, never mandatory.
- cost → prioritise self-directed, low-cost activities.
- nutrition → acknowledge as a supporting factor; never prescribe calories/macros/diets.

SAFETY
- General fitness guidance only — no diagnosis, no medical claims or treatment, no medications/supplements.
- No extreme training volumes, no unsafe rates of weight change, no guaranteed outcomes, no hype language.
- Do not invent, name, or imply any specific ACP partner, trainer, gym, or class.

APPROACH
- "approach" describes ONLY how independently the user can execute the plan (experience, confidence, knowledge, ability to structure activity) — "self_directed" is the default whenever the data doesn't clearly show a meaningful execution barrier.
- "guided": beginner/new experience, low confidence, lack of knowledge, or accountability challenges materially limit independent execution. This never means professional support is required — the plan must stay fully usable either way.

SUPPORT (independent of approach — never a choice between them; both, either, or neither may apply)
- Evaluate personal_trainer and nutrition separately, each on its own merits. Include an entry in support_opportunities ONLY when relevance is high or medium; omit it entirely if low. Max 2 entries, at most one per type.
- personal_trainer HIGH: beginner/new experience AND at least one of confidence/knowledge/accountability is a barrier; OR two or more of confidence/knowledge/accountability/consistency are barriers that materially limit execution.
- personal_trainer MEDIUM: some experience but wants more structure; motivation or consistency is a barrier; accountability would help but the user otherwise seems capable; progression matters to them.
- A stated preference for "personal_training" as an activity is NOT by itself enough for any relevance level.
- nutrition: judge independently using only nutrition barriers and goal context (e.g. weight-related goals) — never prescribe calories/macros/diets.
- "reason": ~30-40 words, drawn only from barriers/goal the user actually gave — never invent one they didn't select. Never name a specific ACP provider.
- Optimise for the user's outcome, never for generating a transaction — provider availability and commercial considerations never affect relevance.

OUTPUT
- Concise, no repetition across fields, no restating the same point twice.
- "headline": short human coaching phrase (e.g. "Consistency matters more than doing more."), NOT a restatement of specific goal numbers.
- "weekly_focus": exactly ONE primary behavioural focus, not a list.
- "next_steps": genuinely new actions not already obvious from the weekly plan (at most ${MAX_NEXT_STEPS}).
- Every field has a hard character limit — write each as one complete, self-contained sentence or two that comfortably fits, never a longer thought cut short.
- No markdown, no bullet characters inside strings, no generic filler.
- Return only the required structured fields.`;

/**
 * Turns the raw onboarding-answers payload into the user-message text sent
 * to the model. Kept intentionally simple: the model reads the same field
 * names the rest of the app uses (see apps/mobile/lib/onboarding.ts), so no
 * separate label-translation layer needs to be duplicated/maintained here.
 */
export function buildUserPrompt(onboardingAnswers: unknown, sportHoursPerWeek?: unknown): string {
  const answers = (onboardingAnswers as Record<string, unknown> | null) ?? {};
  const activityLevel = answers.activityLevel;
  const budget = getWeeklyMinutesBudget(activityLevel, sportHoursPerWeek);
  const budgetSource = typeof sportHoursPerWeek === 'number' && Number.isFinite(sportHoursPerWeek)
    ? `(the user's own stated ${sportHoursPerWeek} training hours/week)`
    : '(estimated from their current activity level — no explicit availability was given)';

  // Beta Feedback #002 — user-stated preferred training days, if any. Placed
  // as its own clearly-labelled line so the model reads it as a structured
  // preference, never merged into the free-form onboarding JSON above.
  const trainingDays = sanitizeTrainingDays(answers.preferredTrainingDays);
  const trainingScheduleLine = trainingDays.length >= 2
    ? `\n\nPreferred training days (user-stated): ${formatTrainingDaysForPrompt(trainingDays)} — that is ${trainingDays.length} days/week. Organise the week's activities onto these days and keep the others free. Distribute the time budget above across them (shorter sessions if needed); do not add total minutes or make every day a demanding session. This is a strong preference, still bounded by the time budget, experience level and safety.`
    : '';

  return `Onboarding data (JSON): goal is their primary fitness goal; startingWeightKg/goalWeightKg/goalTargetDate apply to weight-related goals; activityLevel describes current activity habits; strengthExperience describes strength-training experience; goalDetails.health_focus is what they most want to improve; barriers are what they expect to make progress difficult; preferredActivities are activities they're open to doing; preferredTrainingDays (if present) are the weekdays they prefer to train on.

${JSON.stringify(onboardingAnswers)}

Weekly available time budget: approximately ${budget} minutes total ${budgetSource}. The sum of all "starting_plan.activities[].duration_minutes" must not exceed this.${trainingScheduleLine}

Produce the assessment now.`;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}

const APPROACH_VALUES = new Set(['self_directed', 'guided']);
const CATEGORY_VALUES = new Set(['strength', 'cardio', 'recovery', 'mobility', 'sport']);
const INTENSITY_VALUES = new Set(['light', 'moderate', 'challenging']);
const SUPPORT_TYPE_VALUES = new Set(['personal_trainer', 'nutrition']);
const SUPPORT_RELEVANCE_VALUES = new Set(['high', 'medium']);

function isValidSupportOpportunity(x: unknown): x is SupportOpportunity {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === 'string' && SUPPORT_TYPE_VALUES.has(o.type)
    && typeof o.relevance === 'string' && SUPPORT_RELEVANCE_VALUES.has(o.relevance)
    && typeof o.reason === 'string' && !!o.reason.trim();
}

function isValidActivity(x: unknown): x is StartingPlanActivity {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return typeof a.day === 'string' && !!a.day.trim()
    && typeof a.category === 'string' && CATEGORY_VALUES.has(a.category)
    && typeof a.activity === 'string' && !!a.activity.trim()
    && Number.isFinite(a.duration_minutes) && (a.duration_minutes as number) > 0
    && typeof a.intensity === 'string' && INTENSITY_VALUES.has(a.intensity)
    && typeof a.title === 'string' && !!a.title.trim()
    && typeof a.description === 'string';
}

/**
 * Defensive runtime check on top of the strict JSON-schema response — belt
 * and suspenders against a malformed or unexpected model response before we
 * persist or return it.
 */
export function validateAssessment(x: unknown): x is AIAssessment {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;

  if (typeof a.headline !== 'string' || !a.headline.trim()) return false;
  if (typeof a.summary !== 'string' || !a.summary.trim()) return false;

  const sp = a.starting_point as Record<string, unknown> | undefined;
  if (!sp || typeof sp !== 'object') return false;
  if (typeof sp.experience !== 'string') return false;
  if (typeof sp.available_time !== 'string') return false;
  if (!isStringArray(sp.main_barriers)) return false;

  const rec = a.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== 'object') return false;
  if (typeof rec.approach !== 'string' || !APPROACH_VALUES.has(rec.approach)) return false;
  if (typeof rec.title !== 'string' || !rec.title.trim()) return false;
  if (typeof rec.reason !== 'string' || !rec.reason.trim()) return false;

  if (!Array.isArray(a.support_opportunities) || a.support_opportunities.length > 2) return false;
  if (!a.support_opportunities.every(isValidSupportOpportunity)) return false;

  const plan = a.starting_plan as Record<string, unknown> | undefined;
  if (!plan || typeof plan !== 'object') return false;
  if (typeof plan.title !== 'string' || !plan.title.trim()) return false;
  if (typeof plan.rationale !== 'string' || !plan.rationale.trim()) return false;
  if (!Array.isArray(plan.activities) || plan.activities.length === 0 || plan.activities.length > MAX_ACTIVITIES) return false;
  if (!plan.activities.every(isValidActivity)) return false;

  const focus = a.weekly_focus as Record<string, unknown> | undefined;
  if (!focus || typeof focus !== 'object') return false;
  if (typeof focus.title !== 'string' || !focus.title.trim()) return false;
  if (typeof focus.description !== 'string' || !focus.description.trim()) return false;

  if (!isStringArray(a.next_steps) || a.next_steps.length === 0 || a.next_steps.length > MAX_NEXT_STEPS) return false;

  return true;
}

export type AuthCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Pure authorization decision, separated from the actual Supabase token
 * verification (which stays a thin call in route.ts, matching every other
 * route in this codebase) purely so this branching logic is unit-testable
 * without mocking a network call.
 */
export function checkAuthorization(user: { id: string } | null, userId: unknown): AuthCheckResult {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (typeof userId !== 'string' || !userId) return { ok: false, status: 400, error: 'Missing userId' };
  if (user.id !== userId) return { ok: false, status: 403, error: 'User ID does not match authenticated user' };
  return { ok: true };
}
