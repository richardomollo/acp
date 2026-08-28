import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  validateAssessment, checkAuthorization, getWeeklyMinutesBudget, enforceTimeBudget,
  enforceSupportLogic, attachPlanDates, upgradeLegacyPlanDates,
} from '../onboarding-assessment/assessment';
import {
  WEEKLY_ADAPTATION_MODEL, AI_REQUEST_CONFIG, WEEKLY_ADAPTATION_JSON_SCHEMA, WEEKLY_ADAPTATION_SYSTEM_PROMPT,
  buildWeeklyAdaptationUserPrompt, validateWeeklyAdaptation, enforceAdaptationMagnitude,
  preserveMeaningfulActivityContinuity, buildDeterministicFallbackPlan,
  type BehaviourSummary, type AIAssessment,
} from './adaptation';
import {
  buildLongitudinalSummary, resolveMemorySync, buildCompactLongitudinalContext,
  type LongitudinalPlanInput, type LongitudinalCompletionInput, type MeasurementInput,
} from './longitudinal';
import { logAdaptationStage } from './diagnostics';

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
    const { userId, accessToken, behaviourSummary } = await req.json();

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
        .select('ai_assessment, ai_assessment_generated_at, goal, experience_level, barriers, preferred_activities, activity_level, cuisine_preference, goal_weight_kg')
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
    const budget = getWeeklyMinutesBudget(profile?.activity_level, healthData?.hours_exercising_per_week);

    // Idempotency (Part 42 / Day 5.5 Part 19): same user + same target week
    // must never produce a second plan, whether AI-generated or fallback.
    // Checked BEFORE calling OpenAI at all, so a duplicate request never
    // wastes a generation.
    const { data: existingPlan } = await adminSupabase
      .from('fitness_plans')
      .select('plan_id, assessment')
      .eq('user_id', userId)
      .eq('week_start_date', nextWeekStart)
      .maybeSingle();
    if (existingPlan) {
      return NextResponse.json({ assessment: existingPlan.assessment, generatedAt: existingPlan.plan_id, alreadyExisted: true });
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
      ? await adminSupabase.from('plan_activity_completions').select('plan_id, activity_index').eq('user_id', userId).in('plan_id', planIds)
      : { data: [] as { plan_id: string; activity_index: number }[] };
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
        weeklyMinutesBudget: budget,
        previousWeeklyFocus: current.weekly_focus,
        previousSupportOpportunities: current.support_opportunities,
        behaviourSummary: behaviourSummary as BehaviourSummary,
        longitudinalContext,
      });

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        throw new Error(`OpenAI request failed: ${aiRes.status} ${errText}`);
      }

      const completion = await aiRes.json();
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new Error('AI returned no content');

      const parsed = JSON.parse(raw); // throws on malformed JSON — caught below
      if (!validateWeeklyAdaptation(parsed)) throw new Error('AI response failed validation');
      logAdaptationStage('model_output', {
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

      // Deterministic PT backstop — identical rule as onboarding, reused
      // rather than reimplemented.
      draftAssessment.support_opportunities = enforceSupportLogic(draftAssessment, {
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
      console.error('weekly-adaptation: AI adaptation failed, using deterministic fallback', adaptationError?.message);
      finalAssessment = buildDeterministicFallbackPlan(current, nextWeekStart, budget);
      logAdaptationStage('final_plan', {
        generation_source: finalAssessment.generation_source,
        activities: finalAssessment.starting_plan.activities,
        support_opportunities: finalAssessment.support_opportunities,
        nutrition_focus: finalAssessment.nutrition_focus,
      });
    }

    const generatedAt = new Date().toISOString();

    const { error: saveError } = await adminSupabase
      .from('fitness_profile')
      .upsert({ user_id: userId, ai_assessment: finalAssessment, ai_assessment_generated_at: generatedAt }, { onConflict: 'user_id' });
    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    // Best-effort history bookkeeping — never blocks the response, since the
    // current plan is already saved above regardless of what happens here.
    await adminSupabase.from('fitness_plans').update({ status: 'superseded' }).eq('user_id', userId).eq('plan_id', currentPlanId);
    const { error: insertError } = await adminSupabase.from('fitness_plans').insert({
      user_id: userId,
      plan_id: generatedAt,
      based_on_plan_id: currentPlanId,
      week_start_date: finalAssessment.starting_plan.week_start_date,
      week_end_date: finalAssessment.starting_plan.week_end_date,
      assessment: finalAssessment,
      status: 'active',
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
        return NextResponse.json({ assessment: winner.assessment, generatedAt: winner.plan_id, alreadyExisted: true });
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

      const { toUpsert, toDeactivate } = resolveMemorySync(longitudinalSummary, existingActive);
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
    } catch (memorySyncError) {
      console.error('weekly-adaptation: coaching_memory sync failed (non-blocking)', memorySyncError);
    }

    return NextResponse.json({ assessment: finalAssessment, generatedAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
