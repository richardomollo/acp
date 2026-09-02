import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  AI_ASSESSMENT_MODEL, AI_REQUEST_CONFIG, ASSESSMENT_JSON_SCHEMA, SYSTEM_PROMPT,
  buildUserPrompt, validateAssessment, checkAuthorization,
  getWeeklyMinutesBudget, enforceTimeBudget, enforceSupportLogic, enforceStrengthSessionDuration,
  getWeekBounds, attachPlanDates, sanitizeTrainingDays,
} from './assessment';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../../../../lib/observability';

const OPENAI_CHAT_TIMEOUT_MS = 45_000; // §8 — bounded single attempt, well under maxDuration

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Generous on purpose: the client's own UX timeout is much shorter (~15s —
// see apps/mobile/lib/ai-assessment.ts), but that's only about what the
// user waits looking at a spinner. This route keeps running to completion
// and saves server-side even if the client has already shown its fallback,
// so a slower-than-ideal generation still isn't wasted work.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { userId, onboardingAnswers, accessToken, sportHoursPerWeek } = await req.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!onboardingAnswers || typeof onboardingAnswers !== 'object') {
      return NextResponse.json({ error: 'Missing onboardingAnswers' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authResult = checkAuthorization(user, userId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!process.env.OPENAI_API_KEY) {
      logAcpEvent('initial_assessment_failed', { failureCode: 'VALIDATION_ERROR', httpStatus: 503 });
      return NextResponse.json({ error: 'AI assessment is not configured' }, { status: 503 });
    }

    const startedAt = Date.now();
    logAcpEvent('initial_assessment_started');

    let aiRes: Response;
    try {
      aiRes = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_ASSESSMENT_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(onboardingAnswers, sportHoursPerWeek) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'ai_assessment', strict: true, schema: ASSESSMENT_JSON_SCHEMA },
          },
          ...AI_REQUEST_CONFIG,
        }),
      }, OPENAI_CHAT_TIMEOUT_MS);
    } catch (fetchErr) {
      logAcpEvent('initial_assessment_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(null, fetchErr),
        httpStatus: 502,
      });
      // The mobile client already races this route against a ~15s UX
      // deadline and falls back to a deterministic rule-based plan
      // (buildPlanSummary) — the user is never stuck (§9).
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('onboarding-assessment: OpenAI request failed', aiRes.status, errText.slice(0, 200));
      logAcpEvent('initial_assessment_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(aiRes.status),
        httpStatus: aiRes.status,
      });
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const completion = await aiRes.json();
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      logAcpEvent('initial_assessment_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
    }

    let assessment: unknown;
    try {
      assessment = JSON.parse(raw);
    } catch {
      logAcpEvent('initial_assessment_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    if (!validateAssessment(assessment)) {
      console.error('onboarding-assessment: response failed validation');
      logAcpEvent('initial_assessment_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'AI response failed validation' }, { status: 502 });
    }

    // Available time is a hard constraint, not a suggestion to the model —
    // enforce it programmatically in case the response doesn't fully comply.
    // Prefers the user's own stated weekly training hours when given
    // (canonical); falls back to the activityLevel-based proxy otherwise.
    const budget = getWeeklyMinutesBudget((onboardingAnswers as Record<string, unknown>)?.activityLevel, sportHoursPerWeek);
    assessment.starting_plan.activities = enforceTimeBudget(assessment.starting_plan.activities, budget);

    // Beta Feedback #013 — an advanced/intermediate user's PRIMARY strength
    // session should not land on a ~30-minute default when their weekly
    // budget has room. Deterministic, budget-bounded, and never touches a
    // deliberately light/support strength day. Runs AFTER enforceTimeBudget
    // so it only ever spends real headroom.
    assessment.starting_plan.activities = enforceStrengthSessionDuration(
      assessment.starting_plan.activities,
      (onboardingAnswers as Record<string, unknown>)?.strengthExperience,
      budget,
    );

    // Deterministic safety backstop — see enforceSupportLogic's own comment.
    // Never a second OpenAI call; only ever adds a missing high-confidence
    // personal_trainer:high entry, never removes/downgrades model output.
    assessment.support_opportunities = enforceSupportLogic(assessment, onboardingAnswers).support_opportunities;

    // Day 5 — plan dating (Part 3): the model only ever reasoned about
    // weekday names; every actual date is computed here, anchored to the
    // Monday of the week this plan starts (the current week, for the very
    // first plan). Nutrition/review are Day 5 concepts introduced starting
    // with the first weekly adaptation, not onboarding (Part 45) — always
    // null here.
    const { weekStartDate } = getWeekBounds(new Date());
    const finalAssessment = attachPlanDates(
      { ...assessment, nutrition_focus: null, review: null },
      weekStartDate,
    );

    const generatedAt = new Date().toISOString();
    // upsert, not update: this route is only ever called after
    // completeOnboarding() has already written the fitness_profile row, but
    // update() silently no-ops (no error, no rows affected) if that row
    // were ever missing — upsert closes that silent-failure edge case.
    const { error: saveError } = await adminSupabase
      .from('fitness_profile')
      .upsert({ user_id: userId, ai_assessment: finalAssessment, ai_assessment_generated_at: generatedAt }, { onConflict: 'user_id' });

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    // Plan history (Part 4) — best-effort: a failure here must never block
    // onboarding from completing (the current plan is already saved above),
    // so it's deliberately not awaited-and-checked as a hard error.
    //
    // This route is called both for a brand-new user's first-ever plan
    // (based_on_plan_id null is correct there) and — reusing this same
    // architecture rather than a second one — when My Goals regenerates a
    // plan after a primary-goal change for an existing user. In the latter
    // case there's already an 'active' row; leaving it active alongside a
    // new one would leave two simultaneously-active plans and break the
    // "one current plan" invariant Home/My Plan/weekly-adaptation all rely
    // on. So: find any existing active row first, supersede it, and chain
    // the new row onto it — this is exactly how weekly-adaptation's own
    // history already works, just entered from a different trigger.
    const { data: existingActive } = await adminSupabase
      .from('fitness_plans')
      .select('plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingActive) {
      await adminSupabase
        .from('fitness_plans')
        .update({ status: 'superseded' })
        .eq('user_id', userId)
        .eq('plan_id', existingActive.plan_id);
    }

    await adminSupabase.from('fitness_plans').insert({
      user_id: userId,
      plan_id: generatedAt,
      based_on_plan_id: existingActive?.plan_id ?? null,
      week_start_date: finalAssessment.starting_plan.week_start_date,
      week_end_date: finalAssessment.starting_plan.week_end_date,
      assessment: finalAssessment,
      status: 'active',
    });

    logAcpEvent('initial_assessment_completed', {
      durationMs: Date.now() - startedAt,
      usedFallback: false,
      model: AI_ASSESSMENT_MODEL,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      // Beta Feedback #002 — non-sensitive count only (§31).
      scheduleDaysPerWeek: sanitizeTrainingDays((onboardingAnswers as Record<string, unknown>)?.preferredTrainingDays).length,
    });
    return NextResponse.json({ assessment: finalAssessment, generatedAt });
  } catch (err: any) {
    logAcpEvent('initial_assessment_failed', { failureCode: 'UNKNOWN_ERROR', httpStatus: 500 });
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
