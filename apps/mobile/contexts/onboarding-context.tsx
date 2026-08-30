import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  EMPTY_ANSWERS, deriveSupportStyle, resolveOnboardingResumeStep, sanitizeTrainingDays,
  MIN_TRAINING_DAYS, MAX_TRAINING_DAYS,
  type OnboardingAnswers, type PrimaryGoal, type ActivityLevel, type StrengthExperience,
  type Barrier, type PreferredActivity, type GoalDetails, type OnboardingStepRoute,
  type CanonicalWeekday,
} from '@/lib/onboarding';

interface OnboardingCtx {
  answers: OnboardingAnswers;
  /** True once the initial DB fetch (for resuming in-progress onboarding)
   *  has finished, whether or not it found anything to resume. */
  hydrated: boolean;
  /** Where an in-progress user should be sent back to, resolved once from
   *  their last-saved fitness_profile/health_profile rows. Null if there's
   *  nothing to resume (new user, or onboarding already completed). */
  resumeRoute: OnboardingStepRoute | null;
  /** Where "Start my journey" should land — set once on entry (from the
   *  ?redirect param that got the user into onboarding in the first
   *  place) so it survives every step push without being threaded through
   *  each route's params by hand. */
  redirectTo: string;
  setRedirectTo: (path: string) => void;
  /** First name resolved once on the goal screen (users.name -> auth
   *  metadata -> email prefix, same chain Home's greeting uses) so the rest
   *  of the flow can address the user by name without re-resolving it. */
  userName: string;
  setUserName: (name: string) => void;
  setGoal: (goal: PrimaryGoal) => void;
  setWeightGoal: (startingWeightKg: number, goalWeightKg: number, goalTargetDate: string) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setStrengthExperience: (level: StrengthExperience) => void;
  setGoalDetails: (patch: GoalDetails) => void;
  setGoalTargetDate: (date: string | null) => void;
  toggleBarrier: (barrier: Barrier) => void;
  togglePreferredActivity: (activity: PreferredActivity) => void;
  /** Beta Feedback #002 — toggle a preferred training weekday. Capped at
   *  MAX_TRAINING_DAYS; removing is always allowed. */
  togglePreferredTrainingDay: (day: CanonicalWeekday) => void;
  /** Best-effort save of whatever's been answered so far. Never throws —
   *  local state (and whatever was last saved to the DB) is the source of
   *  truth if the network call fails, so a step's Continue never blocks. */
  saveProgress: () => Promise<void>;
  /** The final, must-succeed write: marks onboarding done. Throws on
   *  failure so the plan screen can show a retry instead of silently
   *  losing the completion flag. */
  completeOnboarding: () => Promise<void>;
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingCtx | undefined>(undefined);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [redirectTo, setRedirectTo] = useState('/(tabs)');
  const [userName, setUserName] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [resumeRoute, setResumeRoute] = useState<OnboardingStepRoute | null>(null);

  // Resume in-progress onboarding: on first mount, pull back whatever was
  // last saved (via saveProgress, called on every step's Continue/Exit) so
  // skipping out mid-flow and coming back later resumes at the right step
  // with the right fields already filled in, instead of starting over.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setHydrated(true); return; }

      const [{ data: fp }, { data: hp }] = await Promise.all([
        supabase.from('fitness_profile')
          .select('goal, starting_weight_kg, goal_weight_kg, goal_target_date, activity_level, experience_level, goal_details, barriers, preferred_activities, preferred_training_days, onboarding_completed')
          .eq('user_id', userId).maybeSingle(),
        supabase.from('health_profile')
          .select('sleep_hours_per_night, hours_working_per_week, hours_exercising_per_week')
          .eq('user_id', userId).maybeSingle(),
      ]);
      if (cancelled) return;

      if (fp && fp.goal && !fp.onboarding_completed) {
        const restored: OnboardingAnswers = {
          goal: fp.goal,
          startingWeightKg: fp.starting_weight_kg,
          goalWeightKg: fp.goal_weight_kg,
          goalTargetDate: fp.goal_target_date,
          activityLevel: fp.activity_level,
          strengthExperience: fp.experience_level,
          goalDetails: fp.goal_details ?? {},
          barriers: fp.barriers ?? [],
          preferredActivities: fp.preferred_activities ?? [],
          preferredTrainingDays: sanitizeTrainingDays(fp.preferred_training_days),
        };
        const hasActivityHours = !!(hp?.sleep_hours_per_night && hp?.hours_working_per_week != null && hp?.hours_exercising_per_week != null);
        setAnswers(restored);
        setResumeRoute(resolveOnboardingResumeStep(restored, hasActivityHours));
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setGoal = useCallback((goal: PrimaryGoal) => {
    setAnswers(a => {
      if (a.goal === goal) return a;
      // Switching goals (e.g. after going back from step 2) drops whatever
      // was answered for the previous goal's step-2 questions — otherwise a
      // stale starting/target weight from an abandoned "lose weight" attempt
      // would still get saved alongside a newly-chosen "improve running" goal.
      return {
        ...a,
        goal,
        startingWeightKg: null,
        goalWeightKg: null,
        goalTargetDate: null,
        activityLevel: null,
        strengthExperience: null,
        goalDetails: {},
      };
    });
  }, []);

  const setWeightGoal = useCallback((startingWeightKg: number, goalWeightKg: number, goalTargetDate: string) => {
    setAnswers(a => ({ ...a, startingWeightKg, goalWeightKg, goalTargetDate }));
  }, []);

  const setActivityLevel = useCallback((activityLevel: ActivityLevel) => {
    setAnswers(a => ({ ...a, activityLevel }));
  }, []);

  const setStrengthExperience = useCallback((strengthExperience: StrengthExperience) => {
    setAnswers(a => ({ ...a, strengthExperience }));
  }, []);

  const setGoalDetails = useCallback((patch: GoalDetails) => {
    setAnswers(a => ({ ...a, goalDetails: { ...a.goalDetails, ...patch } }));
  }, []);

  const setGoalTargetDate = useCallback((goalTargetDate: string | null) => {
    setAnswers(a => ({ ...a, goalTargetDate }));
  }, []);

  const toggleBarrier = useCallback((barrier: Barrier) => {
    setAnswers(a => {
      if (a.barriers.includes(barrier)) {
        return { ...a, barriers: a.barriers.filter(b => b !== barrier) };
      }
      if (a.barriers.length >= 3) return a;
      return { ...a, barriers: [...a.barriers, barrier] };
    });
  }, []);

  const togglePreferredActivity = useCallback((activity: PreferredActivity) => {
    setAnswers(a => ({
      ...a,
      preferredActivities: a.preferredActivities.includes(activity)
        ? a.preferredActivities.filter(x => x !== activity)
        : [...a.preferredActivities, activity],
    }));
  }, []);

  const togglePreferredTrainingDay = useCallback((day: CanonicalWeekday) => {
    setAnswers(a => {
      if (a.preferredTrainingDays.includes(day)) {
        return { ...a, preferredTrainingDays: a.preferredTrainingDays.filter(d => d !== day) };
      }
      if (a.preferredTrainingDays.length >= MAX_TRAINING_DAYS) return a;
      return { ...a, preferredTrainingDays: sanitizeTrainingDays([...a.preferredTrainingDays, day]) };
    });
  }, []);

  const buildRow = useCallback((userId: string, current: OnboardingAnswers) => ({
    user_id: userId,
    goal: current.goal,
    goals: current.goal ? [current.goal] : [],
    starting_weight_kg: current.startingWeightKg,
    goal_weight_kg: current.goalWeightKg,
    goal_target_date: current.goalTargetDate,
    activity_level: current.activityLevel,
    experience_level: current.strengthExperience,
    goal_details: current.goalDetails,
    barriers: current.barriers,
    preferred_activities: current.preferredActivities,
    // Beta Feedback #002 — persist NULL (not []) below the valid range, so a
    // legacy/undecided profile keeps its exact existing planning behaviour.
    preferred_training_days: current.preferredTrainingDays.length >= MIN_TRAINING_DAYS
      ? current.preferredTrainingDays
      : null,
    updated_at: new Date().toISOString(),
  }), []);

  const saveProgress = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    try {
      await supabase.from('fitness_profile').upsert(buildRow(userId, answers), { onConflict: 'user_id' });
    } catch {
      // Best-effort — local state already holds the answer, and the next
      // successful step save (or the final completeOnboarding call) will
      // carry it forward. Never block navigation on this.
    }
  }, [answers, buildRow]);

  const completeOnboarding = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not signed in');

    // Snapshot the starting-weight reference point exactly once — same rule
    // Personal Details' save handler follows — so the Profile tab's weight
    // progress card has something fixed to measure against from the very
    // first completed onboarding, not just from a later manual edit.
    const { data: existing } = await supabase
      .from('fitness_profile')
      .select('initial_weight_kg')
      .eq('user_id', userId)
      .maybeSingle();
    const initialWeightKg = existing?.initial_weight_kg ?? answers.startingWeightKg;

    const supportStyle = deriveSupportStyle(answers.barriers);
    const row = {
      ...buildRow(userId, answers),
      initial_weight_kg: initialWeightKg,
      goal_details: { ...answers.goalDetails, support_style: supportStyle },
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('fitness_profile').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
  }, [answers, buildRow]);

  const reset = useCallback(() => setAnswers(EMPTY_ANSWERS), []);

  return (
    <OnboardingContext.Provider value={{
      answers, hydrated, resumeRoute, redirectTo, setRedirectTo, userName, setUserName, setGoal, setWeightGoal, setActivityLevel, setStrengthExperience,
      setGoalDetails, setGoalTargetDate, toggleBarrier, togglePreferredActivity, togglePreferredTrainingDay,
      saveProgress, completeOnboarding, reset,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}
