// Beta Feedback #020 — weekly measurement check-in.
//
// TWO layers (§2):
//   A. IN-APP DUE STATE  — the source of truth, derived from real
//      client_measurements history + the 7-day rolling cadence. Always
//      computed; shown on Home regardless of notification permission.
//   B. DEVICE NOTIFICATION — supplemental. One local notification per due
//      window, only when permission is already granted, scheduled
//      idempotently so repeated Home opens never stack duplicates (§21/§22).
//
// No new table, no Firebase/APNs plumbing — reuses expo-notifications
// (services/notifications.ts) and the existing client_measurements evidence
// (§14/§24).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { localISODate } from '@/lib/fulfilment';
import {
  getMeasurementCheckinStatus, isMeasurementCheckinActionable,
  MEASUREMENT_CHECKIN_NOTIFICATION, DEFAULT_CHECKIN_WEEKDAY,
  type MeasurementCheckinStatus,
} from '@/lib/progress/measurement-checkin';

const SCHEDULE_KEY = '@lana/measurement-checkin/scheduled';
const REMINDER_HOUR = 18; // 6pm local — never overnight (§16)
const ANDROID_CHANNEL = 'measurement-checkin';

export interface MeasurementCheckinState {
  ok: true;
  status: MeasurementCheckinStatus;
  lastMeasurementLocalDate: string | null;
  /** the anchored check-in weekday date this verdict is about — used as the
   *  stable idempotency key for the supplemental notification (§7). */
  currentAnchorLocalDate: string;
  nextDueLocalDate: string;
  daysSinceLast: number | null;
}
export type MeasurementCheckinResult = MeasurementCheckinState | { ok: false; error: 'load_failed' };

/**
 * The in-app due state (§3/§18). Reads the single most-recent measurement
 * row and resolves its LOCAL calendar date (the device tz), then the pure
 * contract decides due/overdue/completed/not-due. On a load failure returns
 * `{ ok: false }` — the caller shows nothing / a neutral retry, never a
 * fabricated "due" (§19).
 */
export async function getMeasurementCheckinState(userId: string, now: Date = new Date()): Promise<MeasurementCheckinResult> {
  try {
    const [measurementRes, profileRes] = await Promise.all([
      supabase
        .from('client_measurements')
        .select('logged_at, weight_kg')
        .eq('user_id', userId)
        .not('weight_kg', 'is', null) // §11 — weight alone is a valid check-in; the entry flow requires it
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('fitness_profile')
        .select('measurement_checkin_weekday')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (measurementRes.error) throw measurementRes.error;

    const lastMeasurementLocalDate = measurementRes.data?.logged_at
      ? localISODate(new Date(measurementRes.data.logged_at))
      : null;
    // #020B — anchored weekday (Friday MVP default). Falls back to Friday if
    // the column is null / a profile row doesn't exist yet.
    const checkinWeekday = typeof profileRes.data?.measurement_checkin_weekday === 'number'
      ? profileRes.data.measurement_checkin_weekday
      : DEFAULT_CHECKIN_WEEKDAY;
    const todayLocalDate = localISODate(now);
    const res = getMeasurementCheckinStatus({ lastMeasurementLocalDate, todayLocalDate, checkinWeekday });

    return {
      ok: true,
      status: res.status,
      lastMeasurementLocalDate,
      currentAnchorLocalDate: res.currentAnchorLocalDate,
      nextDueLocalDate: res.nextDueLocalDate,
      daysSinceLast: res.daysSinceLast,
    };
  } catch {
    return { ok: false, error: 'load_failed' };
  }
}

interface StoredSchedule {
  /** the due-window key this notification belongs to (nextDueLocalDate, or
   *  'no-history' when the user has never measured) */
  window: string;
  notificationId: string;
}

async function readStored(): Promise<StoredSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.window === 'string' && typeof p?.notificationId === 'string' ? p : null;
  } catch { return null; }
}

async function clearScheduled(): Promise<void> {
  const stored = await readStored();
  if (stored) {
    try { await Notifications.cancelScheduledNotificationAsync(stored.notificationId); } catch { /* already gone */ }
  }
  try { await AsyncStorage.removeItem(SCHEDULE_KEY); } catch { /* ignore */ }
}

/** Next local `REMINDER_HOUR`:00 that is at least a few minutes in the future. */
function nextReminderDate(now: Date): Date {
  const d = new Date(now);
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  if (d.getTime() <= now.getTime() + 5 * 60_000) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Idempotently reconcile the ONE supplemental notification with the current
 * due state (§21/§22):
 *   • actionable (due_today | overdue) + permission granted + not already
 *     scheduled for this window → schedule one, remember its id + window
 *   • not actionable, or window changed, or permission gone → cancel + forget
 *
 * Never requests permission (that's the tab layout's existing
 * registerForPushNotifications flow) — §20: no permission ⇒ no notification,
 * the Home card still shows.
 */
export async function syncMeasurementCheckinNotification(
  state: MeasurementCheckinResult,
  now: Date = new Date(),
): Promise<void> {
  if (!state.ok) return; // load failed — leave any existing schedule untouched

  const actionable = isMeasurementCheckinActionable(state.status);
  // #020B — key by the anchored check-in weekday date (the scheduled Friday),
  // never from the last-measurement date, so a late log never reschedules.
  const window = state.currentAnchorLocalDate;

  if (!actionable) { await clearScheduled(); return; }

  let granted = false;
  try { granted = (await Notifications.getPermissionsAsync()).granted; } catch { granted = false; }
  if (!granted) { await clearScheduled(); return; }

  const stored = await readStored();
  if (stored && stored.window === window) return; // already scheduled for this window — no duplicate

  if (stored) {
    try { await Notifications.cancelScheduledNotificationAsync(stored.notificationId); } catch { /* ignore */ }
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: 'Weekly check-in',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch { /* ignore */ }
  }

  try {
    const fireDate = nextReminderDate(now);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: MEASUREMENT_CHECKIN_NOTIFICATION.title,
        body: MEASUREMENT_CHECKIN_NOTIFICATION.body,
        sound: true,
        data: { type: 'measurement_checkin', url: '/log-progress' },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
    await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify({ window, notificationId } satisfies StoredSchedule));
  } catch { /* scheduling is best-effort; the in-app card is the source of truth */ }
}

/** Cancel + forget any scheduled measurement reminder — used on sign-out. */
export async function clearMeasurementCheckinNotification(): Promise<void> {
  await clearScheduled();
}
