import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  validateAssessment, checkAuthorization, getWeeklyMinutesBudget, enforceTimeBudget,
  attachPlanDates, upgradeLegacyPlanDates, sanitizeTrainingDays,
} from '../onboarding-assessment/assessment';
import {
  WEEKLY_ADAPTATION_MODEL, AI_REQUEST_CONFIG, WEEKLY_ADAPTATION_JSON_SCHEMA, WEEKLY_ADAPTATION_SYSTEM_PROMPT,
  buildWeeklyAdaptationUserPrompt, validateWeeklyAdaptation, enforceAdaptationMagnitude,
  preserveMeaningfulActivityContinuity, buildDeterministicFallbackPlan, enforceAdaptationSupportLogic,
  isFutureRegenerationEligible,
  type BehaviourSummary, type AIAssessment,
} from './adaptation';
import {
  buildLongitudinalSummary, resolveMemorySync, buildCompactLongitudinalContext,
  type LongitudinalPlanInput, type LongitudinalCompletionInput, type MeasurementInput,
} from './longitudinal';
import {
  buildKnowledgeRetrievalRequests, retrieveKnowledgeForAdaptation, hasRepeatedChallengingSessions,
} from './knowledge';
import {
  buildWeeklyExecutionSummary, buildCompactExecutionContext, buildExecutionPatterns,
  type ExecutionRecordInput, type WorkoutExecutionSignal, type WeeklyExecutionSummary,
} from './execution';
import { logAdaptationStage } from './diagnostics';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../../../../lib/observability';
import { isWeeklyAdaptationEnabled, isRagEnabled, isExecutionFeedbackEnabled } from '../../../../lib/flags';

// §8 — bounded single-attempt deadline for the OpenAI chat call, comfortably
// under the 60s function ceiling so a hung request fails fast into the
// deterministic fallback instead of holding the connection open.
const OPENAI_CHAT_TIMEOUT_MS = 45_000;

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Weekly review is less time-critical than onboarding but should still feel
// responsive — same generous server-side ceiling as onboarding (the client
// UX timeout, separately, is what the user actually waits on).
export const maxDuration = 60;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken, behaviourSummary, regenerateFuturePlan } = await req.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!behaviourSummary || typeof behaviourSummary !== 'object') {
      return NextResponse.json({ error: 'Missing behaviourSummary' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authResult = checkAuthorization(user, userId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // The route fetches the current plan + profile itself (service role) —
    // by this point in the product (post-onboarding), fitness_profile is
    // already the reliable source of truth, so the client only needs to
    // send the one thing it alone can compute: this week's actual behaviour.
    const [{ data: profile }, { data: healthData }] = await Promise.all([
      adminSupabase
        .from('fitness_profile')
        .select('ai_assessment, ai_assessment_generated_at, goal, experience_level, barriers, preferred_activities, preferred_training_days, activity_level, cuisine_preference, goal_weight_kg')
        .eq('user_id', userId)
        .maybeSingle(),
      adminSupabase
        .from('health_profile')
        .select('hours_exercising_per_week')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    let current = profile?.ai_assessment as AIAssessment | undefined;
    const currentPlanId = profile?.ai_assessment_generated_at as string | undefined;
    if (!current || !validateAssessment(current) || !currentPlanId) {
      // Genuinely stale-shaped (old approach enum / missing support_opportunities)
      // or missing entirely — not this route's concern; the existing
      // "treat as stale, regenerate" mechanism (My Plan/Home) already
      // handles this case on its own.
      return NextResponse.json({ error: 'No reviewable current plan' }, { status: 400 });
    }

    // Day 5.5 Part 20-26 — an otherwise-valid plan generated before Day 5
    // simply has no dates yet. Upgrade it in place (anchored to its own
    // original generation timestamp, never "today"), persist it, and
    // continue this same request using the upgraded version. No OpenAI call.
    if (!current.starting_plan.week_end_date) {
      const upgraded = upgradeLegacyPlanDates(current, currentPlanId);
      const { error: upgradeSaveError } = await adminSupabase
        .from('fitness_profile')
        .update({ ai_assessment: upgraded })
        .eq('user_id', userId);
      if (!upgradeSaveError) {
        current = upgraded;
        const { data: existingHistoryRow } = await adminSupabase
          .from('fitness_plans').select('id').eq('user_id', userId).eq('plan_id', currentPlanId).maybeSingle();
        if (!existingHistoryRow) {
          await adminSupabase.from('fitness_plans').insert({
            user_id: userId, plan_id: currentPlanId, based_on_plan_id: null,
            week_start_date: upgraded.starting_plan.week_start_date, week_end_date: upgraded.starting_plan.week_end_date,
            assessment: upgraded, status: 'active',
          });
        }
      }
    }
    if (!current.starting_plan.week_end_date) {
      return NextResponse.json({ error: 'No reviewable current plan' }, { status: 400 });
    }

    const nextWeekStart = addDays(current.starting_plan.week_end_date, 1);
    const serverTodayIso = new Date().toISOString().split('T')[0];
    // Beta Feedback #001 — the target week has not started yet (Sunday
    // "prepare next week" case). The plan is generated normally but stored as
    // 'scheduled', NOT promoted into fitness_profile.ai_assessment, so the
    // user keeps their current week until Monday.
    const isAdvanceGeneration = nextWeekStart > serverTodayIso;
    const budget = getWeeklyMinutesBudget(profile?.activity_level, healthData?.hours_exercising_per_week);
    // Beta Feedback #002 — non-sensitive count only for observability (§31);
    // the specific weekdays are never logged.
    const scheduleDaysPerWeek = sanitizeTrainingDays(profile?.preferred_training_days).length;

    // §21 kill switch — adaptation disabled: the current plan stays fully
    // usable; never an error, never a regenerate.
    if (!isWeeklyAdaptationEnabled()) {
      logAcpEvent('weekly_adaptation_fallback', { usedFallback: true, failureCode: undefined });
      return NextResponse.json({ assessment: current, generatedAt: currentPlanId, alreadyExisted: true });
    }

    const adaptationStartedAt = Date.now();
    logAcpEvent('weekly_adaptation_started');

    // Idempotency (Part 42 / Day 5.5 Part 19): same user + same target week
    // must never produce a second plan, whether AI-generated or fallback.
    // Checked BEFORE calling OpenAI at all, so a duplicate request never
    // wastes a generation.
    const { data: existingPlan } = await adminSupabase
      .from('fitness_plans')
      .select('plan_id, assessment, status, week_start_date, id')
      .eq('user_id', userId)
      .eq('week_start_date', nextWeekStart)
      .maybeSingle();
    // Beta Feedback #001 — a plan prepared ahead of time whose week has now
    // begun: promote it to the current plan (mirror + status flip). No LLM call.
    const shouldPromote = !!existingPlan && existingPlan.status === 'scheduled' && !isAdvanceGeneration;
    // Beta Feedback #003 — the caller explicitly asked to rebuild an
    // already-prepared FUTURE plan after changing a planning preference.
    // Every other call stays strictly idempotent (falls into the early
    // return below); only this one is allowed to skip it and regenerate.
    const isFutureRegeneration = isFutureRegenerationEligible({
      regenerateFuturePlan,
      isAdvanceGeneration,
      existingStatus: existingPlan?.status,
      shouldPromote,
    });

    if (existingPlan && !isFutureRegeneration) {
      // Later Sunday evidence (§6) is deliberately NOT reconciled in.
      if (shouldPromote) {
        const promotedAt = existingPlan.plan_id;
        const { error: promoteErr } = await adminSupabase
          .from('fitness_profile')
          .upsert({ user_id: userId, ai_assessment: existingPlan.assessment, ai_assessment_generated_at: promotedAt }, { onConflict: 'user_id' });
        if (!promoteErr) {
          await adminSupabase.from('fitness_plans').update({ status: 'superseded' }).eq('user_id', userId).eq('plan_id', currentPlanId);
          await adminSupabase.from('fitness_plans').update({ status: 'active' }).eq('id', existingPlan.id);
          logAcpEvent('weekly_adaptation_completed', { usedFallback: false, promoted: true, targetWeekStart: nextWeekStart });
        }
      }
      return NextResponse.json({
        assessment: existingPlan.assessment,
        generatedAt: existingPlan.plan_id,
        alreadyExisted: true,
        scheduled: existingPlan.status === 'scheduled' && isAdvanceGeneration,
        promoted: shouldPromote,
      });
    }

    // Day 6 — longitudinal coaching evidence. Exactly three queries (a plans
    // history read, a single .in() completions read, and one bounded
    // client_measurements read for Day 6.5 outcome evidence), reused for
    // both the compact AI prompt context and the continuity-guard override
    // below — never recomputed per-consumer, never a query per metric.
    const { data: historyPlans } = await adminSupabase
      .from('fitness_plans')
      .select('plan_id, week_start_date, week_end_date, assessment')
      .eq('user_id', userId)
      .order('week_start_date', { ascending: false })
      .limit(8);
    const planIds = (historyPlans ?? []).map(p => p.plan_id);
    const { data: historyCompletions } = planIds.length > 0
      ? await adminSupabase.from('plan_activity_completions').select('plan_id, activity_index, completion_source, source_entity_id').eq('user_id', userId).in('plan_id', planIds)
      : { data: [] as { plan_id: string; activity_index: number; completion_source: string; source_entity_id: string | null }[] };

    // Day 9 — execution evidence: explicit per-activity feedback +
    // partial/skip state (plan_activity_execution), plus the difficulty /
    // completion-percentage signals already captured on any linked guided
    // workout_history session. Two bounded .in() reads, never per-activity.
    const { data: executionRows } = planIds.length > 0
      ? await adminSupabase
          .from('plan_activity_execution')
          .select('plan_id, activity_index, execution_status, difficulty, skip_reason, actual_duration_minutes')
          .eq('user_id', userId).in('plan_id', planIds)
      : { data: [] as any[] };
    const linkedWorkoutIds = (historyCompletions ?? [])
      .filter(c => c.completion_source === 'exercise_db' && c.source_entity_id)
      .map(c => c.source_entity_id as string);
    const { data: linkedWorkouts } = linkedWorkoutIds.length > 0
      ? await adminSupabase
          .from('workout_history')
          .select('id, perceived_difficulty, completion_percentage')
          .eq('user_id', userId).in('id', linkedWorkoutIds)
      : { data: [] as { id: string; perceived_difficulty: string | null; completion_percentage: number | null }[] };
    const workoutById = new Map((linkedWorkouts ?? []).map(w => [w.id, w]));

    // Assemble a per-plan WeeklyExecutionSummary from the three datasets.
    const executionSummaryForPlan = (planId: string, activities: AIAssessment['starting_plan']['activities']): WeeklyExecutionSummary => {
      const completedIndexes = new Set(
        (historyCompletions ?? []).filter(c => c.plan_id === planId).map(c => c.activity_index),
      );
      const records: ExecutionRecordInput[] = (executionRows ?? [])
        .filter((r: any) => r.plan_id === planId)
        .map((r: any) => ({
          activityIndex: r.activity_index,
          executionStatus: r.execution_status,
          difficulty: r.difficulty,
          skipReason: r.skip_reason,
          actualDurationMinutes: r.actual_duration_minutes,
        }));
      const signals: WorkoutExecutionSignal[] = (historyCompletions ?? [])
        .filter(c => c.plan_id === planId && c.completion_source === 'exercise_db' && c.source_entity_id && workoutById.has(c.source_entity_id))
        .map(c => {
          const w = workoutById.get(c.source_entity_id as string)!;
          return {
            activityIndex: c.activity_index,
            perceivedDifficulty: (w.perceived_difficulty as WorkoutExecutionSignal['perceivedDifficulty']) ?? null,
            completionPercentage: w.completion_percentage ?? null,
          };
        });
      return buildWeeklyExecutionSummary(activities, completedIndexes, records, signals);
    };
    // Bounded by row count (not per-metric queries) — comfortably covers
    // even daily logging across the whole 8-week plan-history window above.
    const { data: historyMeasurements } = await adminSupabase
      .from('client_measurements')
      .select('logged_at, weight_kg, body_fat_percentage, muscle_mass_kg, waist_cm')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(60);

    const longitudinalPlans: LongitudinalPlanInput[] = (historyPlans ?? []).map(p => {
      const a = p.assessment as AIAssessment;
      return {
        planId: p.plan_id,
        weekStartDate: p.week_start_date,
        weekEndDate: p.week_end_date,
        activities: a.starting_plan.activities,
        nutritionFocusType: a.nutrition_focus?.type ?? null,
        supportTypes: (a.support_opportunities ?? []).map(o => o.type),
      };
    });
    const longitudinalCompletions: LongitudinalCompletionInput[] = (historyCompletions ?? []).map(c => ({
      planId: c.plan_id, activityIndex: c.activity_index,
    }));
    const longitudinalMeasurements: MeasurementInput[] = (historyMeasurements ?? []).map(m => ({
      loggedAt: m.logged_at,
      weightKg: m.weight_kg, bodyFatPct: m.body_fat_percentage, muscleMassKg: m.muscle_mass_kg, waistCm: m.waist_cm,
    }));
    const longitudinalSummary = buildLongitudinalSummary(
      longitudinalPlans, longitudinalCompletions, new Date(), longitudinalMeasurements,
      profile?.goal ?? null, profile?.goal_weight_kg ?? null,
    );
    const longitudinalContext = buildCompactLongitudinalContext(longitudinalSummary);
    const strongDifficultyCategories = new Set(
      longitudinalSummary.patterns.filter(p => p.type === 'category_difficulty' && p.confidence === 'strong').map(p => p.subject),
    );
    const strongDifficultyDays = new Set(
      longitudinalSummary.patterns.filter(p => p.type === 'day_difficulty' && p.confidence === 'strong').map(p => p.subject),
    );
    logAdaptationStage('longitudinal_context', {
      longitudinalContext,
      strongDifficultyCategories: Array.from(strongDifficultyCategories),
      strongDifficultyDays: Array.from(strongDifficultyDays),
    });

    // Day 9 — this week's compact execution context for the prompt, and the
    // repeated cross-week execution patterns for coaching_memory. Both are
    // deterministic and never fail this route (any error degrades to "no
    // execution context", exactly like the knowledge block).
    let executionContext = '';
    let executionMemoryRows: { memory_type: string; subject: string; confidence: 'emerging' | 'moderate' | 'strong'; evidence: unknown; user_message?: string }[] = [];
    try {
      if (!isExecutionFeedbackEnabled()) throw new Error('execution feedback disabled');
      const thisWeekSummary = executionSummaryForPlan(currentPlanId, current.starting_plan.activities);
      executionContext = buildCompactExecutionContext(thisWeekSummary);
      const perWeekSummaries = (historyPlans ?? []).map(p =>
        executionSummaryForPlan(p.plan_id, (p.assessment as AIAssessment).starting_plan.activities),
      );
      executionMemoryRows = buildExecutionPatterns(perWeekSummaries).map(p => ({
        memory_type: 'execution_pattern', subject: p.subject, confidence: p.confidence,
        evidence: p.evidence, user_message: p.user_message,
      }));
      logAdaptationStage('execution_context', {
        executionContext,
        thisWeek: {
          completed: thisWeekSummary.completedActivities,
          partial: thisWeekSummary.partialActivities,
          skipped: thisWeekSummary.skippedActivities,
          difficultyCounts: thisWeekSummary.difficultyCounts,
          skipReasonCounts: thisWeekSummary.skipReasonCounts,
        },
        executionMemory: executionMemoryRows.map(r => `${r.subject}:${r.confidence}`),
      });
      logAcpEvent('execution_summary_built', {
        executionEvidencePresent: executionContext.length > 0,
        upserted: executionMemoryRows.length,
      });
    } catch (executionError) {
      console.error('weekly-adaptation: execution evidence failed (non-blocking)', executionError);
    }

    // Day 7.4 — deterministic ACP-knowledge retrieval, BEFORE the generation
    // call (section 7 — never a second LLM call to pick what to retrieve).
    // Read-only against Day 7.1's existing service; never fails this route
    // (retrieveKnowledgeForAdaptation itself never throws, and this is
    // additionally wrapped so a genuinely unexpected error still degrades to
    // "no knowledge context" rather than losing the whole weekly review).
    let knowledgeContext = '';
    try {
      if (!isRagEnabled()) throw new Error('rag disabled');
      const hasDifficultyPattern = longitudinalSummary.patterns.some(
        p => p.confidence !== 'emerging' && (p.type === 'category_difficulty' || p.type === 'day_difficulty' || p.type === 'duration_difficulty'),
      );
      const knowledgeRequests = buildKnowledgeRetrievalRequests({
        goal: profile?.goal ?? null,
        experience: profile?.experience_level ?? null,
        barriers: Array.isArray(profile?.barriers) ? (profile.barriers as string[]) : [],
        behaviourAdherenceRate: (behaviourSummary as BehaviourSummary)?.adherence_rate ?? null,
        hasDifficultyPattern,
        hasRepeatedChallengingSessions: hasRepeatedChallengingSessions(current.starting_plan.activities),
      });
      const knowledgeResult = await retrieveKnowledgeForAdaptation(knowledgeRequests);
      knowledgeContext = knowledgeResult.compactContext;
      logAdaptationStage('knowledge_retrieval', {
        domainsRequested: knowledgeResult.domainsRequested,
        failedDomains: knowledgeResult.failedDomains,
        chunkIds: knowledgeResult.allChunks.map(c => c.chunkId),
        documentIds: knowledgeResult.allChunks.map(c => c.documentId),
        sources: knowledgeResult.allChunks.map(c => c.source),
        versions: knowledgeResult.allChunks.map(c => c.version),
        similarities: knowledgeResult.allChunks.map(c => Number(c.similarity.toFixed(4))),
      });
      logAcpEvent('knowledge_retrieval_completed', {
        ragDomains: knowledgeResult.domainsRequested,
        ragFailedDomains: knowledgeResult.failedDomains,
      });
    } catch (knowledgeError) {
      console.error('weekly-adaptation: knowledge retrieval failed (non-blocking)', knowledgeError);
      logAcpEvent('knowledge_retrieval_failed', { failureCode: 'RAG_QUERY_ERROR' });
    }

    // ── Try the real AI adaptation; fall back deterministically on any
    // failure (Day 5.5 Problem B) rather than surfacing an error. ──────────
    let finalAssessment: AIAssessment | null = null;
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('AI assessment is not configured');

      const userPrompt = buildWeeklyAdaptationUserPrompt({
        goal: profile?.goal,
        experience: profile?.experience_level,
        barriers: profile?.barriers,
        preferredActivities: profile?.preferred_activities,
        preferredTrainingDays: profile?.preferred_training_days,
        weeklyMinutesBudget: budget,
        previousWeeklyFocus: current.weekly_focus,
        previousSupportOpportunities: current.support_opportunities,
        behaviourSummary: behaviourSummary as BehaviourSummary,
        longitudinalContext,
        knowledgeContext,
        executionContext,
      });

      const aiRes = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: WEEKLY_ADAPTATION_MODEL,
          messages: [
            { role: 'system', content: WEEKLY_ADAPTATION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'weekly_adaptation', strict: true, schema: WEEKLY_ADAPTATION_JSON_SCHEMA },
          },
          ...AI_REQUEST_CONFIG,
        }),
      }, OPENAI_CHAT_TIMEOUT_MS);

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`OpenAI request failed: ${aiRes.status} ${errText}`);
      }

      const completion = await aiRes.json();
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new Error('AI returned no content');

      const parsed = JSON.parse(raw); // throws on malformed JSON — caught below
      if (!validateWeeklyAdaptation(parsed)) throw new Error('AI response failed validation');
      logAcpEvent('weekly_adaptation_completed', {
        durationMs: Date.now() - adaptationStartedAt,
        usedFallback: false,
        model: WEEKLY_ADAPTATION_MODEL,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        executionEvidencePresent: executionContext.length > 0,
      });
      logAdaptationStage('model_output', {
        decision: parsed.decision,
        activities: parsed.starting_plan.activities,
        support_opportunities: parsed.support_opportunities,
        nutrition_focus: parsed.nutrition_focus,
      });

      // Guardrails, in order: time budget is the hard ceiling; adaptation
      // magnitude bounds the swing relative to last week; the continuity
      // backstop then reintroduces anything unjustifiably dropped; a final
      // time-budget pass guards against that reintroduction alone pushing
      // over budget.
      let activities = enforceTimeBudget(parsed.starting_plan.activities, budget);
      logAdaptationStage('time_budget_enforced', { activities });
      activities = enforceAdaptationMagnitude(activities, current.starting_plan.activities);
      logAdaptationStage('adaptation_magnitude_enforced', { activities });
      activities = preserveMeaningfulActivityContinuity({
        previousActivities: current.starting_plan.activities,
        nextActivities: activities,
        missedByCategory: (behaviourSummary as BehaviourSummary).missed_by_category ?? {},
        preferredActivities: profile?.preferred_activities,
        barriers: profile?.barriers,
        weekStartDate: nextWeekStart,
        strongDifficultyCategories,
        strongDifficultyDays,
      });
      activities = enforceTimeBudget(activities, budget);
      logAdaptationStage('continuity_enforced', { activities });

      const draftAssessment: AIAssessment = {
        headline: parsed.review.headline,
        summary: parsed.review.summary,
        starting_point: current.starting_point, // carried forward — a user's experience/barriers don't reset week to week
        recommendation: parsed.recommendation,
        support_opportunities: parsed.support_opportunities,
        starting_plan: { title: parsed.starting_plan.title, rationale: parsed.starting_plan.rationale, activities },
        weekly_focus: parsed.weekly_focus,
        next_steps: parsed.next_steps,
        nutrition_focus: parsed.nutrition_focus,
        review: parsed.review,
        generation_source: 'ai_adaptation',
      };

      // Day 7.5C Correction A — first drop any model-generated
      // support_opportunity the user's deterministic context doesn't warrant
      // (baseline A1), THEN apply the shared additive personal_trainer
      // backstop (identical rule as onboarding, reused not reimplemented).
      draftAssessment.support_opportunities = enforceAdaptationSupportLogic(draftAssessment, {
        strengthExperience: profile?.experience_level,
        barriers: profile?.barriers,
      }).support_opportunities;

      finalAssessment = attachPlanDates(draftAssessment, nextWeekStart);
      logAdaptationStage('final_plan', {
        generation_source: finalAssessment.generation_source,
        activities: finalAssessment.starting_plan.activities,
        support_opportunities: finalAssessment.support_opportunities,
        nutrition_focus: finalAssessment.nutrition_focus,
      });
    } catch (adaptationError: any) {
      console.error('weekly-adaptation: AI adaptation failed', adaptationError?.message);
      logAcpEvent('weekly_adaptation_fallback', {
        durationMs: Date.now() - adaptationStartedAt,
        usedFallback: true,
        failureCode: classifyOpenAiFailure(null, adaptationError),
      });
      // Beta Feedback #003 — a FAILED regeneration must never destroy the
      // already-prepared plan (spec §Loading/failure). Return the untouched
      // existing plan with an error marker; the client keeps showing it.
      if (isFutureRegeneration && existingPlan) {
        return NextResponse.json({
          error: 'regeneration_failed',
          assessment: existingPlan.assessment,
          generatedAt: existingPlan.plan_id,
          scheduled: true,
        }, { status: 502 });
      }
      finalAssessment = buildDeterministicFallbackPlan(current, nextWeekStart, budget, profile?.preferred_training_days);
      logAdaptationStage('final_plan', {
        generation_source: finalAssessment.generation_source,
        activities: finalAssessment.starting_plan.activities,
        support_opportunities: finalAssessment.support_opportunities,
        nutrition_focus: finalAssessment.nutrition_focus,
      });
    }

    const generatedAt = new Date().toISOString();

    // Beta Feedback #003 — safe, atomic replacement of the ONE canonical
    // scheduled row for this future week. The old plan (only ever a
    // 'scheduled' fitness_plans row, never promoted/executed — a future week
    // has no completion/execution rows, and bookings never reference plan_id)
    // is replaced IN PLACE only now that `finalAssessment` has fully passed
    // generation + every guardrail. UNIQUE(user_id, week_start_date) + the
    // update-by-id guarantee exactly one canonical plan for the week; the
    // `status='scheduled'` guard makes a concurrent promotion win instead of
    // this replacing an already-active plan. The mirror / current week are
    // never touched.
    if (isFutureRegeneration && existingPlan) {
      const { error: replaceError } = await adminSupabase
        .from('fitness_plans')
        .update({
          plan_id: generatedAt,
          assessment: finalAssessment,
          week_end_date: finalAssessment.starting_plan.week_end_date,
        })
        .eq('id', existingPlan.id)
        .eq('user_id', userId)
        .eq('status', 'scheduled'); // no-ops if the row was promoted concurrently
      // Confirm the replacement actually landed (a concurrent promotion at
      // week-rollover would have flipped status away from 'scheduled', so the
      // UPDATE matched zero rows without erroring).
      const { data: replacedRow } = await adminSupabase
        .from('fitness_plans')
        .select('plan_id, status')
        .eq('id', existingPlan.id)
        .maybeSingle();
      if (replaceError || replacedRow?.plan_id !== generatedAt) {
        // The prepared plan is untouched — surface it unchanged.
        return NextResponse.json({
          error: 'regeneration_failed',
          assessment: existingPlan.assessment,
          generatedAt: existingPlan.plan_id,
          scheduled: true,
        }, { status: replaceError ? 500 : 409 });
      }
      logAcpEvent('weekly_adaptation_completed', {
        durationMs: Date.now() - adaptationStartedAt,
        usedFallback: false,
        scheduled: true,
        regenerated: true,
        targetWeekStart: nextWeekStart,
        scheduleDaysPerWeek,
      });
      // Coaching memory was already synced by the first advance generation
      // for this week (same longitudinal inputs) — no re-sync needed.
      return NextResponse.json({ assessment: finalAssessment, generatedAt, scheduled: true, regenerated: true });
    }

    // Beta Feedback #001 — an advance ("prepare next week") generation is
    // stored as 'scheduled' and does NOT become the current plan: the mirror
    // and the currently-active history row are left untouched so the user
    // keeps this week until the scheduled week begins (then the idempotency
    // branch above promotes it). A normal (week-already-started) generation
    // is unchanged: mirror + supersede + insert active.
    if (!isAdvanceGeneration) {
      const { error: saveError } = await adminSupabase
        .from('fitness_profile')
        .upsert({ user_id: userId, ai_assessment: finalAssessment, ai_assessment_generated_at: generatedAt }, { onConflict: 'user_id' });
      if (saveError) {
        return NextResponse.json({ error: saveError.message }, { status: 500 });
      }
      await adminSupabase.from('fitness_plans').update({ status: 'superseded' }).eq('user_id', userId).eq('plan_id', currentPlanId);
    }

    const { error: insertError } = await adminSupabase.from('fitness_plans').insert({
      user_id: userId,
      plan_id: generatedAt,
      based_on_plan_id: currentPlanId,
      week_start_date: finalAssessment.starting_plan.week_start_date,
      week_end_date: finalAssessment.starting_plan.week_end_date,
      assessment: finalAssessment,
      status: isAdvanceGeneration ? 'scheduled' : 'active',
    });
    if (insertError?.code === '23505') {
      // Lost a genuine race against a concurrent request for the same week
      // — the other request's row is now the canonical one for this week.
      const { data: winner } = await adminSupabase
        .from('fitness_plans')
        .select('plan_id, assessment')
        .eq('user_id', userId)
        .eq('week_start_date', nextWeekStart)
        .maybeSingle();
      if (winner) {
        return NextResponse.json({ assessment: winner.assessment, generatedAt: winner.plan_id, alreadyExisted: true, scheduled: isAdvanceGeneration });
      }
    }

    // Day 6 — sync coaching_memory. Best-effort, never blocks the response:
    // the plan itself is already saved above regardless of what happens here.
    // first_observed_at is preserved for a row that's continuously active
    // (just being refreshed); anything new or reactivated after being
    // deactivated starts a fresh observation period.
    try {
      const { data: existingRows } = await adminSupabase
        .from('coaching_memory')
        .select('memory_type, subject, active, first_observed_at')
        .eq('user_id', userId);
      const existingActive = (existingRows ?? []).filter(r => r.active).map(r => ({ memory_type: r.memory_type, subject: r.subject }));
      const firstObservedMap = new Map(
        (existingRows ?? []).filter(r => r.active).map(r => [`${r.memory_type}:${r.subject}`, r.first_observed_at]),
      );

      const { toUpsert, toDeactivate } = resolveMemorySync(longitudinalSummary, existingActive, executionMemoryRows);
      const syncedAt = new Date().toISOString();

      if (toUpsert.length > 0) {
        await adminSupabase.from('coaching_memory').upsert(
          toUpsert.map(r => ({
            user_id: userId, memory_type: r.memory_type, subject: r.subject, confidence: r.confidence,
            evidence: r.evidence, user_message: r.user_message ?? null,
            first_observed_at: firstObservedMap.get(`${r.memory_type}:${r.subject}`) ?? syncedAt,
            last_observed_at: syncedAt, active: true, updated_at: syncedAt,
          })),
          { onConflict: 'user_id,memory_type,subject' },
        );
      }
      await Promise.all(toDeactivate.map(identity =>
        adminSupabase.from('coaching_memory')
          .update({ active: false, updated_at: syncedAt })
          .eq('user_id', userId).eq('memory_type', identity.memory_type).eq('subject', identity.subject),
      ));
      logAcpEvent('coaching_memory_sync_completed', { upserted: toUpsert.length, deactivated: toDeactivate.length });
    } catch (memorySyncError) {
      console.error('weekly-adaptation: coaching_memory sync failed (non-blocking)', memorySyncError);
      logAcpEvent('coaching_memory_sync_failed', { failureCode: 'SUPABASE_WRITE_ERROR' });
    }

    logAcpEvent('weekly_adaptation_completed', {
      durationMs: Date.now() - adaptationStartedAt,
      usedFallback: finalAssessment.generation_source === 'deterministic_fallback',
      scheduled: isAdvanceGeneration,
      targetWeekStart: nextWeekStart,
      scheduleDaysPerWeek,
    });
    return NextResponse.json({ assessment: finalAssessment, generatedAt, scheduled: isAdvanceGeneration });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
