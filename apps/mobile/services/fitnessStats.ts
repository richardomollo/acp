// Shared streak/achievement computation — used by both the Fitness Journey
// page and the home tab's streak/achievement badges, so the numbers always
// match exactly.

export interface HistoryRow {
  completed_at: string;
}

export interface Stats {
  totalWorkouts: number;
  totalMinutes: number;
  streakDays: number;
  longestStreak: number;
}

export interface Achievement {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  unlocked: boolean;
}

function decrementDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeStreak(history: HistoryRow[]): { current: number; longest: number } {
  if (history.length === 0) return { current: 0, longest: 0 };

  const days = Array.from(
    new Set(history.map(h => h.completed_at.slice(0, 10)))
  ).sort().reverse();

  let current = 0;
  let longest = 0;
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let cursor = today;

  for (const day of days) {
    if (day === cursor || day === decrementDay(cursor)) {
      streak++;
      cursor = day;
    } else {
      if (streak > longest) longest = streak;
      streak = 1;
      cursor = day;
    }
  }
  if (streak > longest) longest = streak;

  // Current streak must start today or yesterday
  const first = days[0];
  if (first === today || first === decrementDay(today)) {
    let s = 1;
    let c2 = first;
    for (let i = 1; i < days.length; i++) {
      if (days[i] === decrementDay(c2)) { s++; c2 = days[i]; }
      else break;
    }
    current = s;
  }

  return { current, longest };
}

export function buildAchievements(stats: Stats): Achievement[] {
  return [
    {
      id: 'first',
      title: 'First Step',
      subtitle: 'Complete your first workout',
      icon: 'footsteps-outline',
      iconBg: '#16a34a',
      unlocked: stats.totalWorkouts >= 1,
    },
    {
      id: 'week',
      title: 'Week Warrior',
      subtitle: '7-day workout streak',
      icon: 'flame-outline',
      iconBg: '#f97316',
      unlocked: stats.longestStreak >= 7,
    },
    {
      id: 'ten',
      title: 'Ten Sessions',
      subtitle: 'Complete 10 workouts',
      icon: 'star-outline',
      iconBg: '#EAB308',
      unlocked: stats.totalWorkouts >= 10,
    },
    {
      id: 'hour',
      title: 'Hour Club',
      subtitle: '60 minutes of total exercise',
      icon: 'time-outline',
      iconBg: '#7c3aed',
      unlocked: stats.totalMinutes >= 60,
    },
    {
      id: 'month',
      title: 'Month Grind',
      subtitle: '30-day workout streak',
      icon: 'trophy-outline',
      iconBg: '#b45309',
      unlocked: stats.longestStreak >= 30,
    },
    {
      id: 'fifty',
      title: 'Fifty Strong',
      subtitle: 'Complete 50 workouts',
      icon: 'medal-outline',
      iconBg: '#dc2626',
      unlocked: stats.totalWorkouts >= 50,
    },
  ];
}
