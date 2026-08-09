import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type Recurrence = 'once' | 'daily' | 'weekly';

export interface ScheduleWorkoutParams {
  workoutTitle: string;
  startDate: Date;   // calendar date of the first occurrence
  timeOfDay: Date;   // only hours/minutes are read from this
  recurrence: Recurrence;
  weekdays: number[]; // 0=Sun..6=Sat, used when recurrence === 'weekly'
}

export interface WorkoutScheduleLite {
  start_date: string;  // 'YYYY-MM-DD'
  time_of_day: string; // 'HH:MM:SS'
  recurrence: Recurrence;
  weekdays: number[];  // 0=Sun..6=Sat
}

function stripTime(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Returns the next future Date this schedule fires, or null if it has no future occurrence. */
export function computeNextOccurrence(schedule: WorkoutScheduleLite, from: Date = new Date()): Date | null {
  const [hour, minute] = schedule.time_of_day.split(':').map(Number);
  const start = new Date(`${schedule.start_date}T00:00:00`);

  if (schedule.recurrence === 'once') {
    const at = new Date(start);
    at.setHours(hour, minute, 0, 0);
    return at.getTime() > from.getTime() ? at : null;
  }

  if (schedule.recurrence === 'daily') {
    const candidate = new Date(Math.max(start.getTime(), stripTime(from).getTime()));
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  // weekly
  if (schedule.weekdays.length === 0) return null;
  let best: Date | null = null;
  for (const day of schedule.weekdays) {
    const candidate = new Date(Math.max(start.getTime(), stripTime(from).getTime()));
    candidate.setHours(hour, minute, 0, 0);
    const diff = (day - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (candidate.getTime() <= from.getTime()) candidate.setDate(candidate.getDate() + 7);
    if (!best || candidate.getTime() < best.getTime()) best = candidate;
  }
  return best;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('workout-reminders', {
      name: 'Workout reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return true;
}

/** Schedules local reminders for a workout and returns the notification ids so they can be cancelled later. */
export async function scheduleWorkoutNotifications(params: ScheduleWorkoutParams): Promise<string[]> {
  const { workoutTitle, startDate, timeOfDay, recurrence, weekdays } = params;
  const hour = timeOfDay.getHours();
  const minute = timeOfDay.getMinutes();

  const content = {
    title: 'Workout time 💪',
    body: workoutTitle,
    sound: true,
  };

  if (recurrence === 'once') {
    const fireDate = new Date(startDate);
    fireDate.setHours(hour, minute, 0, 0);
    if (fireDate.getTime() <= Date.now()) return [];

    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
    return [id];
  }

  if (recurrence === 'daily') {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour, minute,
      },
    });
    return [id];
  }

  // weekly on specific weekdays — expo-notifications weekday is 1=Sun..7=Sat
  const ids = await Promise.all(
    weekdays.map(day =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1,
          hour, minute,
        },
      }),
    ),
  );
  return ids;
}

export async function cancelWorkoutNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
}

/**
 * Fires a local notification `seconds` from now, so a rest timer still alerts
 * the user with a tone/banner even if they've backgrounded the app or
 * switched to another one during the rest period.
 */
export async function scheduleRestEndNotification(seconds: number, exerciseName: string): Promise<string | null> {
  const granted = await ensureNotificationPermission();
  if (!granted || seconds <= 0) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Rest's over 💪",
      body: `Time for your next set of ${exerciseName}`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * Registers this device for push notifications and saves the Expo push
 * token against the signed-in user, so server-side events (a trainer
 * assigning a task or workout) can reach it even when the app is closed.
 * Safe to call repeatedly — upserts on the token, a no-op if unchanged.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    const granted = await ensureNotificationPermission();
    if (!granted) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })).data;

    await supabase.from('user_push_tokens').upsert({
      user_id: user.id,
      expo_push_token: token,
      device_id: Constants.deviceId ?? null,
      platform: Platform.OS,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'expo_push_token' });

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}
