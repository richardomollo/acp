// Day 5 — weekly review + next-week adaptation. Pure, framework-free logic
// (same split as onboarding-assessment/assessment.ts), reusing that file's
// types/helpers rather than duplicating a competing plan schema — see the
// Day 5 report's schema-versioning section for why.
//
// Non-negotiable separation this whole module protects:
//   CODE calculates facts (behaviourSummary is built entirely client-side,
//   from real completion/Strava/ExerciseDB records, and is never asked of
//   the model). AI interprets those facts and decides a small adaptation +
//   ONE nutrition intent. Nutrient values and food names never come from
//   the model at all — see apps/mobile/lib/nutrition-matching.ts.
import {
  type AIAssessment, type StartingPlan, type StartingPlanActivity, type ActivityCategory, type ActivityIntensity,
  type SupportOpportunity, type NutritionFocus, type NutritionFocusType, type WeeklyReview,
  sumDurationMinutes, dateForWeekdayInWeek, attachPlanDates, enforceTimeBudget,
  enforceSupportLogic, isDeterministicPtWarranted,
  sanitizeTrainingDays, formatTrainingDaysForPrompt,
} from '../onboarding-assessment/assessment.ts';

export const WEEKLY_ADAPTATION_MODEL = 'gpt-5-mini';

// Same latency levers as onboarding (Day 2.5/Day 3): minimal reasoning +
// a token cap. This call has a smaller, more constrained output than the
// full onboarding assessment (no starting_point to restate, no headline
// separate from the review), so it should be at least as fast — benchmarked
// in the Day 5 report rather than assumed.
export const AI_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 1600,
};

const MAX_ACTIVITIES = 7;
const MAX_NEXT_STEPS = 3;
const MAX_WINS = 3;

export interface BehaviourSummary {
  planned_sessions: number;
  completed_sessions: number;
  planned_minutes: number;
  // Only ever incremented from sources where actual duration is genuinely
  // known (Strava, ExerciseDB) — see Part 8. 0 does not mean "0 minutes
  // trained", it means "no duration-bearing source was involved"; the
  // has_known_duration flag is what disambiguates that for the prompt.
  completed_known_minutes: number;
  has_known_duration: boolean;
  adherence_rate: number;
  completed_by_category: Record<string, number>;
  missed_by_category: Record<string, number>;
  completion_sources: Record<string, number>;
}

// ACP Intelligence™ Day 7.4 — the adaptation decision the model must commit
// to, per section 4's vocabulary. This is a required field on the model's
// OWN structured output only (never persisted into AIAssessment, never sent
// to mobile) — it exists purely so the change the model is making is
// inspectable via logAdaptationStage, without asking the model to justify
// itself in free text the server would have to trust.
export type AdaptationDecision = 'keep' | 'progress' | 'simplify' | 'rebalance' | 'adjust';
export const ADAPTATION_DECISION_VALUES = new Set<AdaptationDecision>(['keep', 'progress', 'simplify', 'rebalance', 'adjust']);

export interface WeeklyAdaptationRaw {
  decision: AdaptationDecision;
  review: WeeklyReview;
  recommendation: { approach: 'self_directed' | 'guided'; title: string; reason: string };
  starting_plan: { title: string; rationale: string; activities: StartingPlanActivity[] };
  weekly_focus: { title: string; description: string };
  next_steps: string[];
  support_opportunities: SupportOpportunity[];
  nutrition_focus: NutritionFocus;
}

export const WEEKLY_ADAPTATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['keep', 'progress', 'simplify', 'rebalance', 'adjust'] },
    review: {
      type: 'object',
      additionalProperties: false,
      properties: {
        headline: { type: 'string', maxLength: 90 },
        summary: { type: 'string', maxLength: 340 },
        wins: { type: 'array', maxItems: MAX_WINS, items: { type: 'string', maxLength: 90 } },
        focus_next_week: { type: 'string', maxLength: 200 },
      },
      required: ['headline', 'summary', 'wins', 'focus_next_week'],
    },
    recommendation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        approach: { type: 'string', enum: ['self_directed', 'guided'] },
        title: { type: 'string', maxLength: 90 },
        reason: { type: 'string', maxLength: 340 },
      },
      required: ['approach', 'title', 'reason'],
    },
    starting_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 60 },
        rationale: { type: 'string', maxLength: 420 },
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
              description: { type: 'string', maxLength: 220 }, // was 170 — observed truncating mid-sentence in practice (same fix as onboarding-assessment)
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
        title: { type: 'string', maxLength: 45 },
        description: { type: 'string', maxLength: 280 },
      },
      required: ['title', 'description'],
    },
    next_steps: { type: 'array', minItems: 1, maxItems: MAX_NEXT_STEPS, items: { type: 'string', maxLength: 110 } },
    support_opportunities: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['personal_trainer', 'nutrition'] },
          relevance: { type: 'string', enum: ['high', 'medium'] },
          reason: { type: 'string', maxLength: 220 },
        },
        required: ['type', 'relevance', 'reason'],
      },
    },
    nutrition_focus: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['protein_consistency', 'fibre', 'pre_training_energy', 'post_training_recovery'] },
        title: { type: 'string', maxLength: 60 },
        reason: { type: 'string', maxLength: 220 }, // ~30-40 words, Part 13
      },
      required: ['type', 'title', 'reason'],
    },
  },
  required: ['decision', 'review', 'recommendation', 'starting_plan', 'weekly_focus', 'next_steps', 'support_opportunities', 'nutrition_focus'],
} as const;

// Compact by design, same discipline as onboarding's SYSTEM_PROMPT — every
// constraint below maps directly to a numbered Day 5 requirement.
export const WEEKLY_ADAPTATION_SYSTEM_PROMPT = `You are ACP Intelligence™, reviewing one completed week of a user's fitness plan and adapting next week's plan. You are given already-computed facts (planned/completed sessions, adherence, categories, barriers) — never calculate counts, minutes, or adherence yourself; interpret the numbers given, do not restate them as if you derived them.

REVIEW
- Base "review" only on the given facts. State what went well and what was difficult, factually and encouragingly — never guilt-oriented, never implying failure.
- "wins": genuine positives only, at most ${MAX_WINS}; an empty array is fine if there truly are none.
- If completed_known_minutes/has_known_duration is false, do not claim an exact number of minutes were trained — refer to sessions completed instead.

DECISION — "decision" must be exactly one of: keep, progress, simplify, rebalance, adjust
- keep: the plan is broadly working; minor wording/scheduling differences do not count as a change.
- progress: evidence supports a modest increase in challenge/volume/duration — still bound by the rules below.
- simplify: adherence or fit evidence shows the plan is too difficult or burdensome to execute — shorten or reduce complexity, never as a punishment for missed sessions.
- rebalance: overall workload can stay similar while day/category distribution changes (e.g. move a session to a day that works better, redistribute recovery).
- adjust: a real, evidence-grounded change that doesn't cleanly fit the above — use sparingly.
- If the evidence does not clearly justify a change, choose keep. ACP should not change a plan merely to appear active — continuity is itself a good outcome.

ADHERENCE / EXECUTABILITY PRECEDENCE
- A positive outcome trend never, on its own, justifies changing the plan. When adherence is low, first ask whether the current plan is actually executable.
- Low adherence with a positive outcome: do not progress, and do not restructure (rebalance) merely because the outcome moved in the goal's direction. Prefer keep when the current structure should simply be stabilised; prefer simplify when the plan is clearly too difficult or burdensome to execute. Choose rebalance only when there is specific evidence that the schedule or category distribution itself is the problem.
- Outcome evidence is observational: it can support keeping a plan, but it does not prove the workload should increase, the structure should change, or that any single activity caused the result.

RECOVERY PRECEDENCE
- High adherence is not, by itself, evidence for progression.
- If demanding sessions are closely scheduled, or the recovery guidance in RELEVANT ACP KNOWLEDGE points to poor spacing: do not add workload just because the sessions were completed. First evaluate whether the existing workload should be redistributed — keep is valid when the overall programme should stay stable, rebalance is valid when session spacing should change. Choose progress only when session spacing is already appropriate.
- This concerns scheduling and workload distribution, not injury or medical assessment — make no medical claims.

ADAPTATION — prefer small changes over large ones, never overreact to one week
- Completing most of the plan (e.g. 3 of 4) is a good week — do not restructure it.
- One difficult or missed session does not justify removing that activity type; consider shortening or simplifying it instead (e.g. a 90-minute session that repeatedly gets missed could become 60 minutes, not disappear).
- Never increase session count or total minutes just because adherence was high — an unchanged, stable plan is a good, valid outcome. Any progression must be conservative and still respect the original time budget, goal, and experience level.
- Preserve activities/categories the user completed successfully; only adjust the ones that were consistently missed or reported as difficult.
- Use the user's own stated barriers to interpret WHY something was missed (e.g. a "time" barrier plus a long missed session suggests shortening it, not removing it) — never invent a barrier the user didn't select.

LONGITUDINAL EVIDENCE (if provided) — what has consistently worked or been difficult across several past weeks, not just this one
- This is more reliable than a single week's result and may justify a more meaningful change than this week's data alone would (e.g. a day/category that has been difficult for multiple weeks in a row, not just missed once).
- Still prefer the smallest useful change: if a specific day has been difficult for a liked activity, prefer moving it to a different day before removing the activity itself.
- Never treat this evidence as license to increase overall session count or minutes — it only justifies removing/relocating/shortening what has consistently not worked.

OUTCOME EVIDENCE (if provided) — already-computed weight/body-composition trends from the user's own logged measurements, alongside the behavioural evidence above
- Use outcome trends as context, not as isolated triggers. Prefer multi-week trends over any single measurement; you are never given a single reading in isolation.
- Do not make medical conclusions, and never claim the plan or the user's behaviour CAUSED an outcome change — describe both as observations (e.g. "activity consistency has been strong, and weight has also moved toward your goal", not "you lost weight because you trained consistently").
- Do not automatically increase exercise volume/difficulty when an outcome trend is flat/stable — a stable outcome with strong adherence can mean the current approach is sustainable, or that nutrition/plan-fit is worth a look; it does not by itself justify a harder plan.
- When adherence is low, prioritize improving plan fit and consistency before increasing difficulty, regardless of what the outcome trend shows.
- When adherence is high and the outcome trend already moves in the goal's intended direction, prefer keeping the plan stable or making only small, conservative progression.

EXECUTION EVIDENCE (if provided) — already-computed facts about how this user's week actually went, beyond a binary "completed"
- Completion alone does not prove the difficulty was appropriate: a session completed at "too_hard", or only partially, is a different signal from one completed at "about_right".
- Partial completion is useful positive evidence, not the same as a skip — never treat it as a missed session.
- Repeated "too_hard" feedback favours improving executability before any progression; repeated "too_easy" can support a small, conservative progression only when the other evidence also supports it.
- Repeated time-related skips favour fitting the plan to the user's available time (shorter or fewer sessions), not removing an activity type outright.
- One isolated feedback event is not a pattern — do not drive a meaningful adaptation from a single "too_hard"/"too_easy"/skip.
- This evidence is observational: it does not license a medical inference, and it does not override the user's goal or the deterministic rules in this prompt.

RELEVANT ACP KNOWLEDGE (if provided) — general training/recovery/nutrition/coaching guidance, not specific to this user
- This is contextual background, never a source of facts about this user. It never overrides the user's own goal, completion evidence, outcome evidence, or the deterministic rules in this prompt — if it ever seems to conflict with the evidence above, the evidence above wins.
- Use it only to help choose a well-reasoned adaptation among the options the evidence already supports — never as a reason to invent a change the evidence itself doesn't call for.

APPROACH & SUPPORT (independent of each other, never mutually exclusive — see onboarding rules)
- Re-assess "approach" (self_directed/guided) and support_opportunities from the current facts; do not just copy last week's values unless they still apply.
- personal_trainer HIGH: beginner/new experience and at least one of confidence/knowledge/accountability is a barrier; OR two or more of confidence/knowledge/accountability/consistency materially limit execution. MEDIUM: some experience but wants more structure, or motivation/consistency/accountability applies more lightly.
- A stated preference for "personal_training" as an activity is NOT by itself enough for any relevance level. Include an entry ONLY if relevance is high or medium; omit entirely if low. Never name a specific ACP provider.

NUTRITION FOCUS
- Choose exactly ONE of: protein_consistency, fibre, pre_training_energy, post_training_recovery — whichever single behaviour would help most this week given the goal and barriers.
- This is intent only, not a nutrient value — never invent a specific gram/calorie amount; real foods and their real nutrient data come from ACP's own database afterward.

TRAINING SCHEDULE PREFERENCE (only if "preferred training days" are given below)
- These are weekdays the user themselves stated they prefer to train on. Strongly respect them: place next week's activities on those days and keep the other days free, and aim for roughly that many active days.
- Do NOT assume every preferred day needs a demanding session — a sensible structure interleaves harder days with a lighter cardio / mobility / recovery day. Consecutive preferred days are fine when handled this way; use intensity and category, not omission of days, to manage load.
- More preferred days is NOT a reason to increase session count beyond the schedule or to add total minutes — keep within the weekly time budget and the magnitude limits; distribute the budget across the preferred days as shorter sessions if needed.
- All other rules still apply: time budget, adaptation magnitude, adherence/executability precedence, recovery precedence, and continuity are unchanged by this preference.
- This is the user's stated preference, not a behavioural signal. Never rewrite or narrow it because adherence was low or sessions were skipped — when the evidence says the workload is too much, adapt the PLAN (shorter/lighter sessions on the same preferred days), not the stated preference.

PLAN
- Produce next week's activities using the same day/category/activity/duration_minutes/intensity/title/description fields as before. Respect the given weekly time budget and the user's preferred activities/existing categories — never invent an obscure activity type.

SAFETY
- No diagnosis, no medical claims, no deficiency/disorder inference from behaviour or food data, no guaranteed outcomes.

OUTPUT
- Concise, no repetition across fields, no markdown or bullet characters inside strings. Return only the required structured fields.
- Every field has a hard character limit — write each as one complete, self-contained sentence or two that comfortably fits, never a longer thought cut short.`;

export function buildWeeklyAdaptationUserPrompt(input: {
  goal: unknown;
  experience: unknown;
  barriers: unknown;
  preferredActivities: unknown;
  // Beta Feedback #002 — user-stated preferred training weekdays (any form;
  // sanitised here). Empty/absent ⇒ no schedule section, behaviour unchanged.
  preferredTrainingDays?: unknown;
  weeklyMinutesBudget: number;
  previousWeeklyFocus: unknown;
  previousSupportOpportunities: unknown;
  behaviourSummary: BehaviourSummary;
  // Day 6 — compact, deterministic multi-week evidence (moderate+strong
  // patterns only; see longitudinal.ts's buildCompactLongitudinalContext).
  // Never the full historical plans/activities — kept small by design.
  // Day 6.5 — `outcomes` is the same compact treatment for measurement
  // trends (already-computed, never raw client_measurements rows).
  longitudinalContext?: {
    weeks_observed: number;
    patterns: { type: string; subject: string; confidence: string; evidence: string }[];
    outcomes?: { type: string; metric: string; confidence: string; evidence: string }[];
  } | null;
  // Day 7.4 — compact, pre-formatted "RELEVANT ACP KNOWLEDGE" block from
  // knowledge.ts's buildCompactKnowledgeContext(). Already retrieved,
  // filtered to approved-only, and diversified BEFORE this function ever
  // runs (see knowledge.ts/route.ts) — this function only places it as its
  // own clearly separated section, never merges it into user-evidence prose.
  knowledgeContext?: string | null;
  // Day 9 — compact, pre-formatted "EXECUTION EVIDENCE" block from
  // execution.ts's buildCompactExecutionContext(). Bounded counts only
  // (planned/completed/partial/skipped, difficulty tallies, skip-reason
  // tallies) — never raw event rows, IDs or timestamps. Empty string for a
  // legacy binary-only week, which then changes nothing about the prompt.
  executionContext?: string | null;
}): string {
  const longitudinalSection = input.longitudinalContext && input.longitudinalContext.patterns.length > 0
    ? `\n\nLongitudinal coaching evidence from your last ${input.longitudinalContext.weeks_observed} completed weeks (JSON) — patterns that have consistently held, not just this week:\n${JSON.stringify(input.longitudinalContext.patterns)}`
    : '';
  const outcomeSection = input.longitudinalContext?.outcomes && input.longitudinalContext.outcomes.length > 0
    ? `\n\nOutcome evidence from the user's own logged measurements (JSON) — already-computed trends, not raw readings:\n${JSON.stringify(input.longitudinalContext.outcomes)}`
    : '';
  const executionSection = input.executionContext ? `\n\n${input.executionContext}` : '';
  const knowledgeSection = input.knowledgeContext ? `\n\n${input.knowledgeContext}` : '';

  const trainingDays = sanitizeTrainingDays(input.preferredTrainingDays);
  const trainingScheduleSection = trainingDays.length >= 2
    ? `\n\nPreferred training days (user-stated, ${trainingDays.length} days/week): ${formatTrainingDaysForPrompt(trainingDays)}. Strongly respect this: put next week's activities on these days and keep the others free. Do not add total minutes or session count because of it, do not make every day demanding, and do not narrow this preference because of low adherence — adapt the plan, not the preference.`
    : '';

  return `User context (JSON): goal is their primary fitness goal; experience is their strength-training experience; barriers are what they said would make progress difficult; preferredActivities are activities they're open to.

${JSON.stringify({
    goal: input.goal, experience: input.experience, barriers: input.barriers, preferredActivities: input.preferredActivities,
  })}

Weekly available time budget: approximately ${input.weeklyMinutesBudget} minutes total. The sum of all "starting_plan.activities[].duration_minutes" must not exceed this.${trainingScheduleSection}

Previous week's focus (JSON): ${JSON.stringify(input.previousWeeklyFocus)}
Previous support opportunities (JSON): ${JSON.stringify(input.previousSupportOpportunities)}

Last week's actual behaviour, already computed in code (JSON) — interpret, do not recompute:
${JSON.stringify(input.behaviourSummary)}${executionSection}${longitudinalSection}${outcomeSection}${knowledgeSection}

Produce the weekly review and next week's plan now.`;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}

const APPROACH_VALUES = new Set(['self_directed', 'guided']);
const CATEGORY_VALUES = new Set(['strength', 'cardio', 'recovery', 'mobility', 'sport']);
const INTENSITY_VALUES = new Set(['light', 'moderate', 'challenging']);
const SUPPORT_TYPE_VALUES = new Set(['personal_trainer', 'nutrition']);
const SUPPORT_RELEVANCE_VALUES = new Set(['high', 'medium']);
const NUTRITION_FOCUS_TYPE_VALUES = new Set(['protein_consistency', 'fibre', 'pre_training_energy', 'post_training_recovery']);

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

function isValidSupportOpportunity(x: unknown): x is SupportOpportunity {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === 'string' && SUPPORT_TYPE_VALUES.has(o.type)
    && typeof o.relevance === 'string' && SUPPORT_RELEVANCE_VALUES.has(o.relevance)
    && typeof o.reason === 'string' && !!o.reason.trim();
}

/** Defensive runtime check on the raw model response, same discipline as onboarding's validateAssessment. */
export function validateWeeklyAdaptation(x: unknown): x is WeeklyAdaptationRaw {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;

  if (typeof a.decision !== 'string' || !ADAPTATION_DECISION_VALUES.has(a.decision as AdaptationDecision)) return false;

  const review = a.review as Record<string, unknown> | undefined;
  if (!review || typeof review.headline !== 'string' || !review.headline.trim()) return false;
  if (typeof review.summary !== 'string' || !review.summary.trim()) return false;
  if (!isStringArray(review.wins) || review.wins.length > MAX_WINS) return false;
  if (typeof review.focus_next_week !== 'string' || !review.focus_next_week.trim()) return false;

  const rec = a.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec.approach !== 'string' || !APPROACH_VALUES.has(rec.approach)) return false;
  if (typeof rec.title !== 'string' || !rec.title.trim()) return false;
  if (typeof rec.reason !== 'string' || !rec.reason.trim()) return false;

  if (!Array.isArray(a.support_opportunities) || a.support_opportunities.length > 2) return false;
  if (!a.support_opportunities.every(isValidSupportOpportunity)) return false;

  const plan = a.starting_plan as Record<string, unknown> | undefined;
  if (!plan || typeof plan.title !== 'string' || typeof plan.rationale !== 'string') return false;
  if (!Array.isArray(plan.activities) || plan.activities.length === 0 || plan.activities.length > MAX_ACTIVITIES) return false;
  if (!plan.activities.every(isValidActivity)) return false;

  const focus = a.weekly_focus as Record<string, unknown> | undefined;
  if (!focus || typeof focus.title !== 'string' || typeof focus.description !== 'string') return false;

  if (!isStringArray(a.next_steps) || a.next_steps.length === 0 || a.next_steps.length > MAX_NEXT_STEPS) return false;

  const nf = a.nutrition_focus as Record<string, unknown> | undefined;
  if (!nf || typeof nf.type !== 'string' || !NUTRITION_FOCUS_TYPE_VALUES.has(nf.type)) return false;
  if (typeof nf.title !== 'string' || !nf.title.trim()) return false;
  if (typeof nf.reason !== 'string' || !nf.reason.trim()) return false;

  return true;
}

// ── Beta Feedback #003 — explicit future-plan regeneration eligibility ──────
// A normal weekly-adaptation call stays strictly idempotent per target week.
// This is the ONE additional, explicit intent that lets a user rebuild an
// already-prepared FUTURE plan after they deliberately changed a planning
// preference (e.g. preferred_training_days). Pure decision, unit-testable,
// separate from the route's Supabase plumbing.
export interface FutureRegenerationContext {
  /** The `regenerateFuturePlan` flag from the (authenticated) request body. */
  regenerateFuturePlan: unknown;
  /** True when nextWeekStart > server's today — i.e. the target week has not started. */
  isAdvanceGeneration: boolean;
  /** status of the existing fitness_plans row for the target week, if any. */
  existingStatus: string | null | undefined;
  /** True when this same call is about to PROMOTE the scheduled plan (week has begun). */
  shouldPromote: boolean;
}

/**
 * Regeneration is accepted ONLY when every condition holds (spec §Idempotency):
 *   1. the caller explicitly asked for it (`regenerateFuturePlan === true`);
 *   2. the target week is still in the future (never replaces an active week — §Current week protection);
 *   3. an already-prepared plan exists for that week AND it is still 'scheduled';
 *   4. this call is not simultaneously a promotion.
 * (Authentication is enforced earlier in the route, unconditionally.)
 * Any normal call — no flag — is unaffected and remains idempotent.
 */
export function isFutureRegenerationEligible(ctx: FutureRegenerationContext): boolean {
  return ctx.regenerateFuturePlan === true
    && ctx.isAdvanceGeneration === true
    && ctx.existingStatus === 'scheduled'
    && ctx.shouldPromote === false;
}

// ── Adaptation magnitude guardrail (Part 38) ────────────────────────────────
// The user's stated time budget (enforceTimeBudget) is already a hard
// ceiling; this additionally prevents a big swing RELATIVE to what last
// week's plan actually contained (e.g. 3 -> 7 sessions, 150 -> 400 minutes)
// without any real change in the user's input. Conservative, documented
// limit: at most 50% more sessions/minutes than last week, with a small
// flat allowance so a tiny plan (e.g. 2 sessions) can still grow at all.
const MAX_ADAPTATION_GROWTH = 1.5;
const MIN_SESSION_GROWTH_ALLOWANCE = 2;

export function enforceAdaptationMagnitude(
  nextActivities: StartingPlanActivity[],
  previousActivities: StartingPlanActivity[],
): StartingPlanActivity[] {
  if (previousActivities.length === 0) return nextActivities;
  const maxSessions = Math.max(
    Math.ceil(previousActivities.length * MAX_ADAPTATION_GROWTH),
    previousActivities.length + MIN_SESSION_GROWTH_ALLOWANCE,
  );
  const maxMinutes = Math.ceil(sumDurationMinutes(previousActivities) * MAX_ADAPTATION_GROWTH);

  const trimmed = [...nextActivities];
  while (trimmed.length > 1 && (trimmed.length > maxSessions || sumDurationMinutes(trimmed) > maxMinutes)) {
    trimmed.pop();
  }
  return trimmed;
}

// ── Support-opportunity eligibility gate (Day 7.5C, Correction A) ───────────
// The Day 7.5B live baseline showed A1: a no-barrier, high-adherence,
// positive-outcome beginner where the model emitted two support_opportunities
// (personal_trainer + nutrition) and nothing removed them — enforceSupportLogic
// only ever ADDS a warranted personal_trainer:high, it never suppresses an
// unwarranted one. This is a deterministic guardrail gap, not a prompt-wording
// gap, so it is fixed deterministically here.
export interface AdaptationSupportContext {
  strengthExperience: unknown;
  barriers: unknown;
}

const NUTRITION_SUPPORT_BARRIER = 'nutrition';

/**
 * Answers only one question: is this TYPE of support allowed to appear at
 * all, given the user's deterministic context? Never ranks providers, never
 * reads availability or commercial data (there is none in scope here), never
 * duplicates the mobile Day 4 professional-support keyword scorer.
 *
 * - personal_trainer: survives only when the same experience+barrier rule
 *   that would deterministically ADD a personal_trainer:high entry is met
 *   (isDeterministicPtWarranted). Beginner experience on its own, a
 *   build_muscle goal, high adherence, PT availability, or "personal_training"
 *   as a mere preferred activity are all explicitly NOT sufficient.
 * - nutrition: survives only when nutrition is a stated barrier. A goal
 *   where nutrition classically matters (lose_weight / build_muscle), or the
 *   model's own nutrition_focus intent, is NOT a professional-nutritionist
 *   signal — a nutrition focus and a nutritionist recommendation are
 *   separate concepts.
 */
export function isSupportOpportunityEligible(
  opportunity: SupportOpportunity,
  context: AdaptationSupportContext,
): boolean {
  const barriers = Array.isArray(context.barriers)
    ? context.barriers.filter((b): b is string => typeof b === 'string')
    : [];
  if (opportunity.type === 'personal_trainer') {
    return isDeterministicPtWarranted({ strengthExperience: context.strengthExperience, barriers });
  }
  if (opportunity.type === 'nutrition') {
    return barriers.includes(NUTRITION_SUPPORT_BARRIER);
  }
  return false;
}

/**
 * Weekly-adaptation support guardrail (Day 7.5C):
 *   1. Drop every model-generated support_opportunity that fails the
 *      deterministic eligibility gate above.
 *   2. Then run the existing shared additive backstop (enforceSupportLogic),
 *      so a genuinely warranted personal_trainer:high is still added when
 *      the model omitted it.
 * recommendation.approach is never read or written here — an empty support
 * list does not force "guided".
 */
export function enforceAdaptationSupportLogic(
  assessment: AIAssessment,
  context: AdaptationSupportContext,
): AIAssessment {
  const eligible = (assessment.support_opportunities ?? []).filter(o => isSupportOpportunityEligible(o, context));
  return enforceSupportLogic(
    { ...assessment, support_opportunities: eligible },
    { strengthExperience: context.strengthExperience, barriers: context.barriers },
  );
}

// ── Continuity backstop (Day 5.5, Problem A) ────────────────────────────────
// Real failure observed in Day 5 live testing: a single missed/difficult
// session caused the model to drop an entire activity/category rather than
// shortening it. This is a narrow, explainable floor — NOT a full
// deterministic coaching engine, and NOT "never remove anything": it only
// reintroduces a category when the available evidence is genuinely weak.
//
// Trigger (documented rule, Part 8): a previous-week category with zero
// presence in the model's next plan is reintroduced, in reduced form, ONLY
// when ALL of:
//   - it had at least one MISSED instance last week (behaviourSummary.
//     missed_by_category) — a category with a clean 100% completion record
//     that the model still dropped is a different situation this narrow
//     backstop does not attempt to second-guess.
//   - its activity name still matches something in the user's CURRENT
//     preferredActivities — if it's no longer listed, that IS the user's
//     explicit signal that they don't want it any more (Part 4/Scenario C),
//     and the model's removal is respected.
//   - the previous template activity's own duration is already above the
//     practical reduction floor (MIN_REDUCED_DURATION) — nothing meaningful
//     left to "shrink" otherwise.
// "Goal hasn't changed" and "no safety reason" are not separately checked:
// the route reads the user's profile once per call, so the goal is
// definitionally the same for both the previous and next plan in a single
// invocation, and no safety/medical field exists anywhere in ACP's schema
// to check against. Multi-week "this consistently doesn't work" patterns
// are explicitly out of scope (Part 4's own list allows removal on that
// basis, but evaluating it would require cross-week trend analysis, which
// this task deliberately does not build).
const MIN_REDUCED_DURATION = 20;

const INTENSITY_STEP_DOWN: Record<ActivityIntensity, ActivityIntensity> = {
  challenging: 'moderate',
  moderate: 'light',
  light: 'light',
};

// A small, self-contained keyword table — deliberately not the full
// keyword-alias sophistication of apps/mobile/lib/fulfilment.ts's
// normalizeActivity (a separate app; there is no shared package between web
// and mobile for this), just enough to answer "is this still something the
// user said they're open to?"
const PREFERRED_ACTIVITY_KEYWORDS: Record<string, string[]> = {
  gym: ['gym', 'strength', 'weight'],
  running: ['run'],
  walking: ['walk'],
  football: ['football', 'soccer'],
  yoga: ['yoga'],
  swimming: ['swim'],
  cycling: ['cycl', 'bike'],
  boxing: ['box'],
  personal_training: ['personal train'],
};

function matchesPreferredActivity(activityName: string, preferredActivities: unknown): boolean {
  if (!Array.isArray(preferredActivities)) return false;
  const lower = activityName.toLowerCase();
  return preferredActivities.some(pref => {
    if (typeof pref !== 'string') return false;
    const keywords = PREFERRED_ACTIVITY_KEYWORDS[pref] ?? [pref];
    return keywords.some(k => lower.includes(k));
  });
}

/**
 * Adaptation hierarchy applied together as ONE small, conservative
 * correction (Part 5) — shorten + step down intensity once. Time-barrier
 * profiles get a larger cut (90→60, matching the report's example exactly);
 * everything else gets a gentler one (60→45). Never below MIN_REDUCED_DURATION.
 */
function reduceDurationForContinuity(minutes: number, barriers: unknown): number {
  const barrierList = Array.isArray(barriers) ? barriers : [];
  const factor = barrierList.includes('time') ? 2 / 3 : 0.75;
  const reduced = Math.round((minutes * factor) / 5) * 5;
  return Math.max(reduced, MIN_REDUCED_DURATION);
}

export function preserveMeaningfulActivityContinuity(params: {
  previousActivities: StartingPlanActivity[];
  nextActivities: StartingPlanActivity[];
  missedByCategory: Record<string, number>;
  preferredActivities: unknown;
  barriers: unknown;
  weekStartDate: string;
  // Day 6, Part 29 — the ONE narrow bypass this backstop's weak-evidence
  // protection allows: a category/day with STRONG multi-week longitudinal
  // difficulty evidence (see longitudinal.ts) counts as legitimate
  // elimination/replacement evidence, so a single-week miss no longer forces
  // reintroduction. This does NOT disable the guardrail generally — every
  // other rule below (preference match, reduction floor, etc.) still
  // applies, and a category/day is still protected by default unless this
  // specific, high-bar evidence says otherwise.
  strongDifficultyCategories?: Set<string>;
  strongDifficultyDays?: Set<string>;
}): StartingPlanActivity[] {
  const {
    previousActivities, nextActivities, missedByCategory, preferredActivities, barriers, weekStartDate,
    strongDifficultyCategories, strongDifficultyDays,
  } = params;

  const nextCategories = new Set(nextActivities.map(a => a.category));
  const previousCategories = Array.from(new Set(previousActivities.map(a => a.category)));
  const reintroductions: StartingPlanActivity[] = [];

  for (const category of previousCategories) {
    if (nextCategories.has(category)) continue; // still present — nothing to correct
    if (!(missedByCategory?.[category] > 0)) continue; // no evidence at all prompted this — not this backstop's concern

    const template = previousActivities
      .filter(a => a.category === category)
      .sort((a, b) => b.duration_minutes - a.duration_minutes)[0]; // the most significant instance, as the reintroduction template
    if (!template) continue;
    if (!matchesPreferredActivity(template.activity, preferredActivities)) continue; // Scenario C — explicit preference change respected
    if (template.duration_minutes <= MIN_REDUCED_DURATION) continue; // nothing meaningful left to shrink
    if (strongDifficultyCategories?.has(category) || strongDifficultyDays?.has(template.day.toLowerCase())) continue; // strong multi-week evidence justifies letting the removal stand

    reintroductions.push({
      ...template,
      duration_minutes: reduceDurationForContinuity(template.duration_minutes, barriers),
      intensity: INTENSITY_STEP_DOWN[template.intensity],
      planned_date: dateForWeekdayInWeek(weekStartDate, template.day) ?? undefined,
    });
  }

  if (reintroductions.length === 0) return nextActivities;

  // Duplicate-safety (Part 9/10) — never add a second activity for a
  // day+category the model's own plan already has.
  const existingKeys = new Set(nextActivities.map(a => `${a.day}:${a.category}`));
  const safeReintroductions = reintroductions.filter(r => !existingKeys.has(`${r.day}:${r.category}`));

  // Front-loaded: if the subsequent time-budget/magnitude re-check (Part 10)
  // needs to trim anything, it removes from the model's OWN, already-larger
  // activities first (they trim from the end) rather than immediately
  // undoing the correction just made.
  return [...safeReintroductions, ...nextActivities];
}

// ── Deterministic next-week fallback (Day 5.5, Problem B) ───────────────────
// If the AI call times out, fails, or returns something that doesn't
// validate, ACP must still produce a usable next week rather than leaving
// the user stuck on the plan whose week has already ended. Deliberately
// conservative: copies the previous plan's structure verbatim (no new
// activities, no new coaching logic — Part 13), shifts every date forward
// exactly one week using the same dating helpers as every other plan
// (never derived from "today"), and carries forward support_opportunities/
// nutrition_focus rather than inventing anything new (Part 30/31).
export function buildDeterministicFallbackPlan(
  current: AIAssessment,
  nextWeekStartDateIso: string,
  weeklyMinutesBudget: number,
  // Beta Feedback #002 §19 — the fallback must not silently destroy a
  // user's preferred weekly structure. When a preference is set, the
  // carried-forward activities are moved onto the preferred weekdays
  // (nothing else changes: same activities, durations, categories,
  // intensities, count — no new coaching logic, still conservative).
  preferredTrainingDays?: unknown,
): AIAssessment {
  const carriedForwardReview: WeeklyReview = {
    headline: 'Your next week is ready.',
    summary: "We've carried your current structure forward so you can keep moving.",
    wins: [],
    focus_next_week: current.weekly_focus?.title ?? 'Keep showing up on your planned days.',
  };

  const preferredDays = sanitizeTrainingDays(preferredTrainingDays);
  const carriedActivities = current.starting_plan.activities.map((a, i) => ({
    day: preferredDays.length >= 2 ? capitalize(preferredDays[i % preferredDays.length]) : a.day,
    category: a.category, activity: a.activity, duration_minutes: a.duration_minutes,
    intensity: a.intensity, title: a.title, description: a.description,
  }));

  const draft: AIAssessment = {
    headline: carriedForwardReview.headline,
    summary: carriedForwardReview.summary,
    starting_point: current.starting_point,
    recommendation: current.recommendation,
    support_opportunities: current.support_opportunities ?? [],
    starting_plan: {
      title: current.starting_plan.title,
      rationale: current.starting_plan.rationale,
      // Validated against the CURRENT weekly time budget (Part 13's
      // "VALIDATE TIME BUDGET" step) — the user's stated available time may
      // have changed since the previous plan was generated. Never grows the
      // plan: preferred-day redistribution only reassigns `day`.
      activities: enforceTimeBudget(carriedActivities, weeklyMinutesBudget),
    },
    weekly_focus: current.weekly_focus,
    next_steps: current.next_steps,
    nutrition_focus: current.nutrition_focus ?? null,
    review: carriedForwardReview,
    generation_source: 'deterministic_fallback',
  };

  return attachPlanDates(draft, nextWeekStartDateIso);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type { AIAssessment, StartingPlan, StartingPlanActivity, ActivityCategory, ActivityIntensity };
