// ACP Intelligence™ — Nutrition N3. Resolves a user's REFERENCE CONTEXT
// (age, sex, current weight) from Supabase and runs it through the pure
// reference engine. This is the only file that touches the network for N3 —
// everything downstream (lib/nutrition/nutrition-reference-*) is pure.
//
// Weight source hierarchy (§23), most-authoritative first:
//   1. client_measurements.weight_kg — explicit user-entered log, has a true
//      logged_at timestamp.
//   2. health_daily_stats.weight_kg — HealthKit-synced (only present if the
//      user has connected Apple Health; an explicit, existing consent flow).
//   3. fitness_profile.starting_weight_kg — the value log-progress.tsx keeps
//      as "current weight" (see that file's own comment); no per-field
//      timestamp, so the profile's updated_at is recorded as an approximate
//      date, clearly labelled by source.
// NEVER goal_weight_kg or initial_weight_kg — those are a target and a fixed
// baseline, not current weight (§8/§23).
//
// No staleness cutoff is invented (§23) — the recorded date is always
// returned so the UI can show it; the caller decides how to present it.

import { supabase } from '@/lib/supabase';
import {
  computeAgeYears, type UserReferenceContext, type ContextField, type WeightContextValue,
} from '@/lib/nutrition/nutrition-reference-engine';
import type { Sex } from '@/lib/nutrition/nutrition-reference-data';

async function resolveWeight(userId: string): Promise<ContextField<WeightContextValue>> {
  const { data: cm } = await supabase
    .from('client_measurements')
    .select('weight_kg, logged_at')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('logged_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cm?.weight_kg != null) {
    return { status: 'available', value: { kg: Number(cm.weight_kg), source: 'client_measurement', recordedAt: cm.logged_at } };
  }

  const { data: hds } = await supabase
    .from('health_daily_stats')
    .select('weight_kg, date')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (hds?.weight_kg != null) {
    return { status: 'available', value: { kg: Number(hds.weight_kg), source: 'health_daily_stats', recordedAt: hds.date } };
  }

  const { data: fp } = await supabase
    .from('fitness_profile')
    .select('starting_weight_kg, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (fp?.starting_weight_kg != null) {
    return { status: 'available', value: { kg: Number(fp.starting_weight_kg), source: 'fitness_profile', recordedAt: fp.updated_at ?? null } };
  }

  return { status: 'insufficient_context', reason: 'No current weight is on file yet.' };
}

function resolveSex(biologicalSex: string | null | undefined): ContextField<Sex> {
  if (biologicalSex === 'male' || biologicalSex === 'female') return { status: 'available', value: biologicalSex };
  // 'other', 'not set', null, or anything else: the reference standard's
  // sex-specific values assume a male/female distinction ACP cannot silently
  // infer here (N3 §25) — never guess.
  return { status: 'insufficient_context', reason: 'Sex is not on file, or is recorded as a value that does not map to the male/female categories these references use.' };
}

function resolveAge(dateOfBirth: string | null | undefined): ContextField<number> {
  if (!dateOfBirth) return { status: 'insufficient_context', reason: 'Date of birth is not on file.' };
  return { status: 'available', value: computeAgeYears(dateOfBirth) };
}

export const nutritionReferenceService = {
  /** Resolves age/sex/weight for one user. Read-only; no writes. */
  async resolveUserReferenceContext(userId: string): Promise<UserReferenceContext> {
    const [{ data: hp }, weight] = await Promise.all([
      supabase.from('health_profile').select('date_of_birth, biological_sex').eq('user_id', userId).maybeSingle(),
      resolveWeight(userId),
    ]);
    return {
      age: resolveAge(hp?.date_of_birth),
      sex: resolveSex(hp?.biological_sex),
      weight,
    };
  },
};
