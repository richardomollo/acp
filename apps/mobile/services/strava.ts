import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

export type StravaConnectResult = 'connected' | 'denied' | 'error' | 'cancelled';

export interface StravaStatus {
  connected: boolean;
  athleteId?: number;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
}

// Opens Strava's authorize page in an in-app browser and waits for the
// redirect back into the app — the same pattern already used for Pesapal
// card checkout (WebBrowser.openAuthSessionAsync + a custom URL scheme),
// so no extra deep-link route registration is needed here.
export async function connectStrava(): Promise<StravaConnectResult> {
  const { data, error } = await supabase.functions.invoke('strava-oauth-start', {
    body: { platform: 'mobile' },
  });
  if (error || !data?.url) {
    console.error('[strava] failed to start connection:', error?.message);
    return 'error';
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'acitypass://strava-callback');
  if (result.type !== 'success' || !result.url) {
    return 'cancelled';
  }

  const status = new URL(result.url).searchParams.get('status');
  if (status === 'connected') return 'connected';
  if (status === 'denied') return 'denied';
  return 'error';
}

export async function getStravaStatus(): Promise<StravaStatus> {
  const { data, error } = await supabase.functions.invoke('strava-status', { body: {} });
  if (error || !data) {
    console.error('[strava] failed to get status:', error?.message);
    return { connected: false };
  }
  return data;
}

export async function syncStravaNow(): Promise<{ imported: number; skipped: number }> {
  const { data, error } = await supabase.functions.invoke('strava-sync-activities', { body: {} });
  if (error || !data) {
    throw new Error(error?.message ?? 'Sync failed');
  }
  return data;
}

export async function disconnectStrava(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('strava-disconnect', { body: {} });
  if (error) {
    console.error('[strava] failed to disconnect:', error.message);
    return false;
  }
  return !!data?.disconnected;
}

// Strava's API has no step-count field at all (it's a distance/GPS tracker,
// not a pedometer) — this is a rough estimate from today's walk/run distance
// using an average adult stride length, for use only when a real step count
// (e.g. from HealthKit) isn't available.
const AVG_STRIDE_METERS = 0.762;

export async function estimateTodayStepsFromStrava(userId: string, dateStr: string): Promise<number | null> {
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('activities')
    .select('distance_meters')
    .eq('user_id', userId)
    .eq('source', 'strava')
    .in('activity_type', ['walk', 'run'])
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);
  if (error || !data || data.length === 0) return null;
  const totalMeters = data.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0);
  if (totalMeters <= 0) return null;
  return Math.round(totalMeters / AVG_STRIDE_METERS);
}
