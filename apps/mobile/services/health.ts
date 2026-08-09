import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import type * as HealthKitModule from '@kingstinct/react-native-healthkit';

const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount' as const;
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;
const RESTING_ENERGY = 'HKQuantityTypeIdentifierBasalEnergyBurned' as const;
const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const;
const BODY_FAT = 'HKQuantityTypeIdentifierBodyFatPercentage' as const;
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass' as const;
const HEIGHT = 'HKQuantityTypeIdentifierHeight' as const;
const WAIST = 'HKQuantityTypeIdentifierWaistCircumference' as const;
const DATE_OF_BIRTH = 'HKCharacteristicTypeIdentifierDateOfBirth' as const;
const BIOLOGICAL_SEX = 'HKCharacteristicTypeIdentifierBiologicalSex' as const;

const BIOLOGICAL_SEX_LABEL = ['not set', 'female', 'male', 'other'] as const;

// TestFlight/production builds have no visible console — surface the last
// failure reason here so the UI can display something actionable instead of
// a generic "couldn't connect" message.
let lastError: string | null = null;
export function getHealthSyncError(): string | null {
  return lastError;
}

// @kingstinct/react-native-healthkit uses Nitro Modules, which don't exist in
// Expo Go — merely importing the package throws immediately, before any
// function runs. So the import itself must be deferred (dynamic `import()`)
// and skipped entirely when running in Expo Go, rather than statically
// imported at the top of this file like every other service module here.
const isExpoGo = Constants.appOwnership === 'expo';

function isHealthKitUsable(): boolean {
  return Platform.OS === 'ios' && Device.isDevice && !isExpoGo;
}

async function loadHealthKit(): Promise<typeof HealthKitModule | null> {
  if (!isHealthKitUsable()) return null;
  try {
    return await import('@kingstinct/react-native-healthkit');
  } catch (e) {
    console.error('[health] failed to load HealthKit module:', e);
    return null;
  }
}

// Apple deliberately never reveals whether READ permission was granted or
// denied (to prevent inferring sensitive conditions from the response), so
// there's no reliable "is connected" check — we just request, then sync;
// if denied, the sync simply returns no data and the Analytics page falls
// back to its empty state.
export async function ensureHealthPermission(): Promise<boolean> {
  lastError = null;
  const HealthKit = await loadHealthKit();
  if (!HealthKit) {
    lastError = isExpoGo
      ? 'Apple Health requires a development/production build — not available in Expo Go.'
      : Platform.OS !== 'ios'
        ? 'Apple Health is only available on iOS.'
        : !Device.isDevice
          ? 'Apple Health is not available in the simulator.'
          : 'Could not load the HealthKit module.';
    return false;
  }
  try {
    const available = await HealthKit.isHealthDataAvailableAsync();
    if (!available) {
      lastError = 'Health data is not available on this device.';
      return false;
    }
    await HealthKit.requestAuthorization({
      toRead: [
        STEP_COUNT, ACTIVE_ENERGY, RESTING_ENERGY, HEART_RATE,
        BODY_FAT, BODY_MASS, HEIGHT, WAIST,
        DATE_OF_BIRTH, BIOLOGICAL_SEX,
        HealthKit.WorkoutTypeIdentifier,
      ],
    });
    return true;
  } catch (e: any) {
    lastError = `Permission request failed: ${e?.message ?? String(e)}`;
    console.error('[health] permission request failed:', e);
    return false;
  }
}

async function syncDailyStats(HealthKit: typeof HealthKitModule, userId: string, days: number) {
  const anchorDate = new Date();
  anchorDate.setDate(anchorDate.getDate() - days);
  anchorDate.setHours(0, 0, 0, 0);

  const [stepsResults, caloriesResults, restingResults, heartRateResults, weightResults] = await Promise.all([
    HealthKit.queryStatisticsCollectionForQuantity(STEP_COUNT, ['cumulativeSum'], anchorDate, { day: 1 }, { unit: 'count' }),
    HealthKit.queryStatisticsCollectionForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], anchorDate, { day: 1 }, { unit: 'kcal' }),
    HealthKit.queryStatisticsCollectionForQuantity(RESTING_ENERGY, ['cumulativeSum'], anchorDate, { day: 1 }, { unit: 'kcal' }),
    HealthKit.queryStatisticsCollectionForQuantity(HEART_RATE, ['discreteAverage'], anchorDate, { day: 1 }, { unit: 'count/min' }),
    HealthKit.queryStatisticsCollectionForQuantity(BODY_MASS, ['mostRecent'], anchorDate, { day: 1 }, { unit: 'kg' }),
  ]);

  type DayRow = {
    steps: number | null; calories: number | null; restingEnergy: number | null;
    heartRateAvg: number | null; weight: number | null;
  };
  const byDate = new Map<string, DayRow>();
  const get = (key: string): DayRow =>
    byDate.get(key) ?? { steps: null, calories: null, restingEnergy: null, heartRateAvg: null, weight: null };

  for (const r of stepsResults) {
    if (!r.startDate) continue;
    const key = r.startDate.toISOString().slice(0, 10);
    const cur = get(key);
    // steps is an integer column, but HealthKit can return a fractional sum
    // (e.g. when merging samples from multiple sources with unit conversion).
    cur.steps = r.sumQuantity?.quantity != null ? Math.round(r.sumQuantity.quantity) : null;
    byDate.set(key, cur);
  }
  for (const r of caloriesResults) {
    if (!r.startDate) continue;
    const key = r.startDate.toISOString().slice(0, 10);
    const cur = get(key);
    cur.calories = r.sumQuantity?.quantity ?? null;
    byDate.set(key, cur);
  }
  for (const r of restingResults) {
    if (!r.startDate) continue;
    const key = r.startDate.toISOString().slice(0, 10);
    const cur = get(key);
    cur.restingEnergy = r.sumQuantity?.quantity ?? null;
    byDate.set(key, cur);
  }
  for (const r of heartRateResults) {
    if (!r.startDate) continue;
    const key = r.startDate.toISOString().slice(0, 10);
    const cur = get(key);
    cur.heartRateAvg = r.averageQuantity?.quantity ?? null;
    byDate.set(key, cur);
  }
  for (const r of weightResults) {
    if (!r.startDate) continue;
    const key = r.startDate.toISOString().slice(0, 10);
    const cur = get(key);
    cur.weight = r.mostRecentQuantity?.quantity ?? null;
    byDate.set(key, cur);
  }

  const rows = [...byDate.entries()].map(([date, v]) => ({
    user_id: userId,
    date,
    steps: v.steps,
    calories_burned: v.calories,
    resting_energy_kcal: v.restingEnergy,
    heart_rate_avg: v.heartRateAvg,
    weight_kg: v.weight,
    synced_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return true;

  const { error } = await supabase.from('health_daily_stats').upsert(rows, { onConflict: 'user_id,date' });
  if (error) {
    lastError = `Daily stats sync failed: ${error.message}`;
    console.error('[health] daily stats upsert failed:', error.message);
    return false;
  }
  return true;
}

async function syncProfile(HealthKit: typeof HealthKitModule, userId: string) {
  const [dob, sex, height, bodyFat, waist] = await Promise.all([
    HealthKit.getDateOfBirthAsync().catch(() => undefined),
    HealthKit.getBiologicalSexAsync().catch(() => 0),
    HealthKit.getMostRecentQuantitySample(HEIGHT, 'cm').catch(() => undefined),
    HealthKit.getMostRecentQuantitySample(BODY_FAT, '%').catch(() => undefined),
    HealthKit.getMostRecentQuantitySample(WAIST, 'cm').catch(() => undefined),
  ]);

  const row = {
    user_id: userId,
    date_of_birth: dob ? dob.toISOString().slice(0, 10) : null,
    biological_sex: sex ? BIOLOGICAL_SEX_LABEL[sex] ?? null : null,
    height_cm: height?.quantity ?? null,
    body_fat_percentage: bodyFat?.quantity ?? null,
    waist_circumference_cm: waist?.quantity ?? null,
    synced_at: new Date().toISOString(),
  };

  // Nothing at all came back — skip writing an all-null row.
  if (!row.date_of_birth && !row.biological_sex
    && row.height_cm == null && row.body_fat_percentage == null && row.waist_circumference_cm == null) {
    return true;
  }

  const { error } = await supabase.from('health_profile').upsert(row, { onConflict: 'user_id' });
  if (error) {
    lastError = `Profile sync failed: ${error.message}`;
    console.error('[health] profile upsert failed:', error.message);
    return false;
  }
  return true;
}

async function syncWorkouts(HealthKit: typeof HealthKitModule, userId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const workouts = await HealthKit.queryWorkoutSamples({
    filter: { date: { startDate } },
    limit: 50,
    ascending: false,
  });

  if (workouts.length === 0) return true;

  const rows = workouts.map(w => ({
    user_id: userId,
    hk_uuid: w.uuid,
    activity_type: HealthKit.WorkoutActivityType[w.workoutActivityType] ?? String(w.workoutActivityType),
    start_date: w.startDate.toISOString(),
    end_date: w.endDate.toISOString(),
    duration_seconds: w.duration?.quantity ?? null,
    total_energy_kcal: w.totalEnergyBurned?.quantity ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('health_workouts').upsert(rows, { onConflict: 'user_id,hk_uuid' });
  if (error) {
    lastError = `Workouts sync failed: ${error.message}`;
    console.error('[health] workouts upsert failed:', error.message);
    return false;
  }
  return true;
}

export async function syncHealthData(days = 14): Promise<boolean> {
  lastError = null;
  const HealthKit = await loadHealthKit();
  if (!HealthKit) {
    lastError = 'Could not load the HealthKit module.';
    return false;
  }
  try {
    const session = await authService.getSession();
    if (!session?.user.id) {
      lastError = 'Not signed in.';
      return false;
    }
    const userId = session.user.id;

    const results = await Promise.all([
      syncDailyStats(HealthKit, userId, days),
      syncProfile(HealthKit, userId),
      syncWorkouts(HealthKit, userId, days),
    ]);
    return results.every(Boolean);
  } catch (e: any) {
    lastError = `Sync failed: ${e?.message ?? String(e)}`;
    console.error('[health] sync failed:', e);
    return false;
  }
}
