import { createContext, useCallback, useContext, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  EMPTY_ANSWERS, deriveSupportStyle,
  type OnboardingAnswers, type PrimaryGoal, type ActivityLevel, type StrengthExperience,
  type Barrier, type PreferredActivity, type GoalDetails,
} from '@/lib/onboarding';

interface OnboardingCtx {
  answers: OnboardingAnswers;
  /** Where "Start my journey" should land — set once on entry (from the
   *  ?redirect param that got the user into onboarding in the first
   *  place) so it survives every step push without being threaded through
   *  each route's params by hand. */
  redirectTo: string;
  setRedirectTo: (path: string) => void;
  setGoal: (goal: PrimaryGoal) => void;
  setWeightGoal: (startingWeightKg: number, goalWeightKg: number, goalTargetDate: string) => void;
  setActivityLevel: (level: ActivityLevel) => void;
  setStrengthExperience: (level: StrengthExperience) => void;
  setGoalDetails: (patch: GoalDetails) => void;
  setGoalTargetDate: (date: string | null) => void;
  toggleBarrier: (barrier: Barrier) => void;
  togglePreferredActivity: (activity: PreferredActivity) => void;
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

    const supportStyle = deriveSupportStyle(answers.barriers);
    const row = {
      ...buildRow(userId, answers),
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
      answers, redirectTo, setRedirectTo, setGoal, setWeightGoal, setActivityLevel, setStrengthExperience,
      setGoalDetails, setGoalTargetDate, toggleBarrier, togglePreferredActivity,
      saveProgress, completeOnboarding, reset,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}
