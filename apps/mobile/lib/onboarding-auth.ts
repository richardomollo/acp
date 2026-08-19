import { supabase } from '@/lib/supabase';

/**
 * Resolves where to send a user right after they authenticate: into the
 * goal-setting onboarding flow if they haven't completed it, otherwise the
 * app's normal destination. Missing row (brand-new user, or pre-existing
 * account created before this flow existed) is treated as "not completed".
 */
export async function getPostAuthDestination(userId: string, fallback: string): Promise<string> {
  const { data } = await supabase
    .from('fitness_profile')
    .select('onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.onboarding_completed ? fallback : '/onboarding/goal';
}
