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
// redirect back into the app — same expo-web-browser + custom-scheme
// pattern used across ACP's apps for provider redirects.
export async function connectStrava(): Promise<StravaConnectResult> {
  const { data, error } = await supabase.functions.invoke('strava-oauth-start', {
    body: { platform: 'partners' },
  });
  if (error || !data?.url) {
    console.error('[strava] failed to start connection:', error?.message);
    return 'error';
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'partners://strava-callback');
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
