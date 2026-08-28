// ACP Intelligence™ Day 6 — the one service boundary for human-support
// detection + PT matching. Reuses Day 4's professional-support matcher
// (lib/professional-support.ts) rather than building a second recommendation
// system — that matcher is already the real, tested, deterministic
// goal/specialisation scorer used elsewhere in the app (my-plan.tsx).
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import { getProgressSnapshot } from './progress-service';
import { evaluateHumanSupport, applySuppression, type DismissalRecord } from '@/lib/human-support-evaluator';
import type { HumanSupportSignal, RecentCheckInSummary, RecentAdaptationSummary } from '@/lib/human-support-types';
import { matchProfessionalProviders, type ProviderMatch, type ProfessionalProvider } from '@/lib/professional-support';
import type { PrimaryGoal, PreferredActivity } from '@/lib/onboarding';

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

const RECENT_WINDOW = 6;

// Maps Day 2's broader ProgrammeGoal onto the 4-value PrimaryGoal vocabulary
// lib/professional-support.ts's keyword table already understands, rather
// than duplicating/extending that table — 'improve_running' intentionally
// falls back to the neutral default here since the real running signal
// comes through preferredActivities ('running') in the existing matcher.
function mapGoalForMatching(goal: string): PrimaryGoal {
  if (goal === 'build_muscle' || goal === 'body_recomposition') return 'build_muscle';
  if (goal === 'lose_weight') return 'lose_weight';
  return 'maintain_weight';
}

export interface HumanSupportInsight {
  primary: HumanSupportSignal | null;
  trainerOwned: boolean;
  ptRecommendations: ProviderMatch[];
}

export async function getHumanSupportInsight(userId: string): Promise<HumanSupportInsight | null> {
  if (!(await assertOwnSession(userId))) return null;

  const [{ data: program }, { data: profile }, { data: trainerRelationship }] = await Promise.all([
    supabase.from('workout_programs').select('id, source, goal').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    supabase.from('fitness_profile').select('experience_level, goal, preferred_activities').eq('user_id', userId).maybeSingle(),
    supabase.from('pt_clients').select('id').eq('client_user_id', userId).eq('status', 'active').maybeSingle(),
  ]);

  const progress = await getProgressSnapshot(userId);
  if (!progress) return null;

  let recentCheckIns: RecentCheckInSummary[] = [];
  let recentAdaptations: RecentAdaptationSummary[] = [];
  if (program) {
    const [{ data: checkins }, { data: adaptations }] = await Promise.all([
      supabase.from('workout_program_checkins').select('week_number, difficulty, pain_reported').eq('user_id', userId).eq('program_id', program.id).order('week_number', { ascending: false }).limit(RECENT_WINDOW),
      supabase.from('workout_program_adaptations').select('week_number, decision_types').eq('user_id', userId).eq('program_id', program.id).order('week_number', { ascending: false }).limit(RECENT_WINDOW),
    ]);
    recentCheckIns = ((checkins as any[]) ?? []).map(c => ({ weekNumber: c.week_number, difficulty: c.difficulty, painReported: c.pain_reported }));
    recentAdaptations = ((adaptations as any[]) ?? []).map(a => ({ weekNumber: a.week_number, decisionTypes: a.decision_types }));
  }

  const evaluation = evaluateHumanSupport({
    progress,
    recentCheckIns,
    recentAdaptations,
    experienceLevel: profile?.experience_level ?? null,
    programmeSource: (program?.source as any) ?? null,
    hasActiveTrainerRelationship: !!trainerRelationship,
  });

  const { data: dismissalRows } = await supabase.from('human_support_dismissals').select('trigger, dismissed_at').eq('user_id', userId);
  const dismissals: DismissalRecord[] = ((dismissalRows as any[]) ?? []).map(d => ({ trigger: d.trigger, dismissedAt: d.dismissed_at }));
  const primary = applySuppression(evaluation.primary, dismissals, new Date());

  if (!primary || evaluation.trainerOwned) {
    return { primary, trainerOwned: evaluation.trainerOwned, ptRecommendations: [] };
  }

  const { data: trainerRows } = await supabase.from('personal_trainers').select('id, full_name, professional_name, specialisations, photo_url').eq('status', 'approved');
  const providers: ProfessionalProvider[] = ((trainerRows as any[]) ?? []).map(p => ({
    id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [], photoUrl: p.photo_url ?? null,
  }));
  const goal = (program?.goal ?? profile?.goal) as string | undefined;
  const ptRecommendations = matchProfessionalProviders(
    goal ? mapGoalForMatching(goal) : null,
    (profile?.preferred_activities ?? []) as PreferredActivity[],
    false,
    providers,
  );

  return { primary, trainerOwned: false, ptRecommendations };
}

export async function dismissHumanSupportInsight(userId: string, trigger: string): Promise<void> {
  if (!(await assertOwnSession(userId))) return;
  await supabase.from('human_support_dismissals').upsert(
    { user_id: userId, trigger, dismissed_at: new Date().toISOString() },
    { onConflict: 'user_id,trigger' },
  );
}
