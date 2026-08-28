import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAssessment, checkAuthorization, upgradeLegacyPlanDates, type AIAssessment } from '../onboarding-assessment/assessment';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Day 5.5 Problem C — brings an existing, otherwise-valid current plan that
// predates Day 5 (no week_start_date/week_end_date/planned_date) into the
// dated review loop. Deliberately NOT a bulk backfill: this is called
// lazily/opportunistically by My Plan and Home whenever such a plan is
// naturally loaded (Part 21), never proactively for every user. Makes no
// OpenAI call — purely a deterministic date transform (upgradeLegacyPlanDates).
// A no-op (returns the plan unchanged) when it's already dated, so calling
// this repeatedly is always safe.
export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken } = await req.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authResult = checkAuthorization(user, userId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: profile } = await adminSupabase
      .from('fitness_profile')
      .select('ai_assessment, ai_assessment_generated_at')
      .eq('user_id', userId)
      .maybeSingle();

    const current = profile?.ai_assessment as AIAssessment | undefined;
    const currentPlanId = profile?.ai_assessment_generated_at as string | undefined;
    // Not this route's concern if it's missing or genuinely stale-shaped
    // (old approach enum / missing support_opportunities) — the existing
    // "treat as stale, regenerate" mechanism already handles that case.
    if (!current || !currentPlanId || !validateAssessment(current)) {
      return NextResponse.json({ upgraded: false });
    }
    if (current.starting_plan.week_end_date) {
      return NextResponse.json({ upgraded: false, assessment: current, generatedAt: currentPlanId }); // already dated
    }

    const upgraded = upgradeLegacyPlanDates(current, currentPlanId);

    const { error: saveError } = await adminSupabase
      .from('fitness_profile')
      .update({ ai_assessment: upgraded })
      .eq('user_id', userId);
    if (saveError) {
      return NextResponse.json({ upgraded: false });
    }

    // Ensure exactly one history row for this plan — never a duplicate
    // (Part 24).
    const { data: existingHistoryRow } = await adminSupabase
      .from('fitness_plans').select('id').eq('user_id', userId).eq('plan_id', currentPlanId).maybeSingle();
    if (!existingHistoryRow) {
      await adminSupabase.from('fitness_plans').insert({
        user_id: userId, plan_id: currentPlanId, based_on_plan_id: null,
        week_start_date: upgraded.starting_plan.week_start_date, week_end_date: upgraded.starting_plan.week_end_date,
        assessment: upgraded, status: 'active',
      });
    }

    return NextResponse.json({ upgraded: true, assessment: upgraded, generatedAt: currentPlanId });
  } catch (err: any) {
    // Fails safe — the caller keeps showing whatever plan it already has.
    return NextResponse.json({ upgraded: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
