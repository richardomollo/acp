// LANA — Phase 4.5: professional → consumer continuity (PURE, deterministic).
//
// Turns the Phase-4.4 consumer contract (get_client_session_feed + client_tasks
// joined by session_record_id) into models Home / the coach-update screen /
// the "From your coach" list render — without ever touching the Lana plan,
// fabricating domain evidence, or re-voicing a professional instruction as
// Lana's. No React, no network, no Supabase. Unit-tested with `node --test`.

export type Recurrence = 'once' | 'daily' | 'weekly';
export type ProfessionalFlavour = 'training' | 'nutrition' | 'therapy' | 'general';

// ── inputs (shapes the service produces from the RPC + client_tasks) ─────

export interface ContinuitySessionRow {
  sessionId: string;
  serviceType: string | null;
  professionalFlavour: ProfessionalFlavour | null;
  focus: string | null;
  clientSummary: string | null;
  followUpAt: string | null; // YYYY-MM-DD
  completedAt: string | null; // ISO
  professionalName: string | null;
}

export interface ContinuityTaskRow {
  id: string;
  title: string;
  status: 'pending' | 'done';
  dueDate: string | null; // YYYY-MM-DD
  recurrence: Recurrence;
  weekdays: number[]; // 0=Sun … 6=Sat (matches client_tasks.weekdays)
  lastCompletedDate: string | null;
  sessionRecordId: string | null;
  /** resolved once by the service; never trusted from the client */
  professionalName: string | null;
}

// ── session recency (§3A) ──────────────────────────────────────────────

export type SessionRecency = 'completed_today' | 'recent' | 'historical' | 'none';

/** completed today → completed_today; 1–3 days ago → recent; >3 → historical.
 *  Wall-clock string compare on the DATE portion — no timezone math. */
export function sessionRecency(completedAtIso: string | null, todayLocalDate: string): SessionRecency {
  if (!completedAtIso) return 'none';
  const d = completedAtIso.slice(0, 10);
  if (d === todayLocalDate) return 'completed_today';
  const diff = dayDiff(d, todayLocalDate);
  if (diff < 0) return 'none'; // completed in the future — treat as nothing to surface
  return diff <= 3 ? 'recent' : 'historical';
}

function dayDiff(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

// ── task period + done-state (lifted from trainer-tasks.tsx — ONE impl) ──

/** The date-string a recurring task is "for" right now (date granularity;
 *  tasks have no time-of-day). `once` → its due_date (or today). */
export function taskPeriod(task: Pick<ContinuityTaskRow, 'recurrence' | 'weekdays' | 'dueDate'>, todayLocalDate: string): string {
  if (task.recurrence === 'daily') return todayLocalDate;
  if (task.recurrence === 'weekly') {
    const dow = weekdayOf(todayLocalDate);
    if (task.weekdays.includes(dow)) return todayLocalDate;
    for (let back = 1; back <= 7; back++) {
      const d = shiftDate(todayLocalDate, -back);
      if (task.weekdays.includes(weekdayOf(d))) return d;
    }
  }
  return task.dueDate ?? todayLocalDate;
}

export function isTaskDoneForPeriod(task: ContinuityTaskRow, todayLocalDate: string): boolean {
  return task.recurrence === 'once'
    ? task.status === 'done'
    : task.lastCompletedDate === taskPeriod(task, todayLocalDate);
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
}
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

// ── Today eligibility (§3B) ────────────────────────────────────────────

export interface TodayAction {
  task: ContinuityTaskRow;
  overdue: boolean;
}

/**
 * A professional task enters Today's Focus iff unfinished for the current
 * period AND (daily) OR (weekly & today ∈ weekdays) OR (once & due_date set &
 * due_date ≤ today). A `once` task with no due_date is list-only. An overdue
 * `once` task is included and flagged.
 */
export function isEligibleForToday(task: ContinuityTaskRow, todayLocalDate: string): TodayAction | null {
  if (isTaskDoneForPeriod(task, todayLocalDate)) return null;
  if (task.recurrence === 'daily') return { task, overdue: false };
  if (task.recurrence === 'weekly') {
    return task.weekdays.includes(weekdayOf(todayLocalDate)) ? { task, overdue: false } : null;
  }
  // once
  if (!task.dueDate) return null; // list-only
  if (task.dueDate > todayLocalDate) return null; // future — not yet
  return { task, overdue: task.dueDate < todayLocalDate };
}

export interface TodayActionsResult {
  /** what Home renders in Today's Focus */
  shown: TodayAction[];
  /** how many more exist beyond `shown` (drives the "View all" affordance) */
  overflow: number;
  /** every eligible action (for the "View all" target / list screen) */
  all: TodayAction[];
}

/** Cap Today professional actions at 3; if there are >3, show the first 2 and
 *  an overflow affordance for the rest (§3B). Overdue first, then by due date,
 *  then title — fully deterministic. */
export function selectTodayActions(tasks: readonly ContinuityTaskRow[], todayLocalDate: string): TodayActionsResult {
  const all = tasks
    .map((t) => isEligibleForToday(t, todayLocalDate))
    .filter((a): a is TodayAction => a !== null)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const ad = a.task.dueDate ?? '9999-12-31';
      const bd = b.task.dueDate ?? '9999-12-31';
      return ad.localeCompare(bd) || a.task.title.localeCompare(b.task.title);
    });

  if (all.length <= 3) return { shown: all, overflow: 0, all };
  return { shown: all.slice(0, 2), overflow: all.length - 2, all };
}

// ── attribution grouping (§3D) ────────────────────────────────────────

export const FALLBACK_PROFESSIONAL_LABEL = 'your coach';

export function professionalDisplayName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n.length > 0 ? n : FALLBACK_PROFESSIONAL_LABEL;
}

export function attributionLabel(name: string | null | undefined): string {
  return `From ${professionalDisplayName(name)}`;
}

export function flavourNoun(flavour: ProfessionalFlavour | null | undefined): string {
  switch (flavour) {
    case 'nutrition':
      return 'nutritionist';
    case 'therapy':
      return 'wellness professional';
    case 'training':
      return 'trainer';
    default:
      return 'coach';
  }
}

export interface ContinuityGroup {
  /** stable key: pt_id isn't in the client-safe model, so we key on the
   *  resolved name + flavour (good enough for grouping a list). */
  key: string;
  professionalName: string;
  tasks: ContinuityTaskRow[];
}

/** Group open tasks by professional name for the "From your coach" list. Done
 *  tasks are excluded from the pending groups (still shown in a Done section by
 *  the screen). */
export function groupOpenTasksByProfessional(
  tasks: readonly ContinuityTaskRow[],
  todayLocalDate: string,
): ContinuityGroup[] {
  const byName = new Map<string, ContinuityTaskRow[]>();
  for (const t of tasks) {
    if (isTaskDoneForPeriod(t, todayLocalDate)) continue;
    const name = professionalDisplayName(t.professionalName);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(t);
  }
  return Array.from(byName.entries())
    .map(([professionalName, ts]) => ({
      key: professionalName.toLowerCase(),
      professionalName,
      tasks: ts.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.professionalName.localeCompare(b.professionalName));
}

// ── the assembled continuity model ───────────────────────────────────

export interface ContinuityModel {
  /** true when there is ANY professional session or task — gates every 4.5 UI */
  hasAny: boolean;
  /** most recent completed session, if any */
  latestSession: ContinuitySessionRow | null;
  latestRecency: SessionRecency;
  /** show the transient Home "From your coach" card? (only completed_today) */
  showHomeCard: boolean;
  /** tasks linked to `latestSession` (for the Home card's "N next steps" + the
   *  coach-update screen) */
  latestSessionTasks: ContinuityTaskRow[];
  /** Today's Focus professional-action selection */
  today: TodayActionsResult;
  /** all completed sessions (recent-first) for the list screen */
  sessions: ContinuitySessionRow[];
  /** open tasks grouped by professional, for the list screen */
  groups: ContinuityGroup[];
}

export interface BuildContinuityInput {
  sessions: readonly ContinuitySessionRow[];
  tasks: readonly ContinuityTaskRow[];
  todayLocalDate: string;
}

export function buildContinuityModel(input: BuildContinuityInput): ContinuityModel {
  const sessions = [...input.sessions].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const latestSession = sessions[0] ?? null;
  const latestRecency = latestSession ? sessionRecency(latestSession.completedAt, input.todayLocalDate) : 'none';
  const latestSessionTasks = latestSession
    ? input.tasks.filter((t) => t.sessionRecordId === latestSession.sessionId)
    : [];

  return {
    hasAny: sessions.length > 0 || input.tasks.length > 0,
    latestSession,
    latestRecency,
    showHomeCard: latestRecency === 'completed_today',
    latestSessionTasks,
    today: selectTodayActions(input.tasks, input.todayLocalDate),
    sessions,
    groups: groupOpenTasksByProfessional(input.tasks, input.todayLocalDate),
  };
}

/** The empty model — Home never has to understand raw RPC/DB state (§3E). */
export const EMPTY_CONTINUITY_MODEL: ContinuityModel = {
  hasAny: false,
  latestSession: null,
  latestRecency: 'none',
  showHomeCard: false,
  latestSessionTasks: [],
  today: { shown: [], overflow: 0, all: [] },
  sessions: [],
  groups: [],
};
