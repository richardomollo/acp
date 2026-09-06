// LANA PRO — Phase 4.1: "what's on today" normalisation (PURE).
//
// The workspace has several existing booking sources with different shapes:
//   pt_bookings   → 1-to-1 professional appointments
//   sessions      → business classes (capacity + booked count)
//   experience_bookings / access → not surfaced in 4.1, but the shape allows it
//
// This flattens them to ONE deterministic `TodayItem` shape for Home's
// "TODAY / NEXT / YOUR DAY" sections. No new booking table, no DB — just a
// presentation adapter. Unit-tested with `node --test`.

export type TodayKind = 'appointment' | 'class' | 'access';

export interface TodayItem {
  id: string;
  kind: TodayKind;
  title: string;
  /** ISO 8601. */
  startAt: string;
  /** ISO 8601, when known. */
  endAt?: string;
  clientName?: string;
  providerName?: string;
  bookedCount?: number;
  capacity?: number;
  /** Where a click should go (relative path). */
  href: string;
  /** Passthrough status for a subtle badge (e.g. 'pending', 'confirmed'). */
  status?: string;
}

// ── source rows (only the fields we read) ──────────────────────────────────

export interface PtBookingRow {
  id: string;
  scheduled_date: string; // 'YYYY-MM-DD'
  scheduled_time: string | null; // 'HH:MM[:SS]'
  status?: string | null;
  users?: { full_name?: string | null; email?: string | null } | null;
  pt_offerings?: { title?: string | null; duration_minutes?: number | null } | null;
}

export interface SessionRow {
  id: string;
  date: string; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM[:SS]'
  name?: string | null;
  duration_minutes?: number | null;
  max_capacity?: number | null;
  is_active?: boolean | null;
  instructor?: string | null;
}

/** Combine a plain date + wall-clock time into an ISO string, no timezone math
 *  (the app is single-market; dates/times are already local). Missing time →
 *  midnight. */
export function toIso(date: string, time: string | null | undefined): string {
  const t = (time ?? '').trim();
  const hhmmss = t.length === 0 ? '00:00:00' : t.length === 5 ? `${t}:00` : t.slice(0, 8);
  return `${date}T${hhmmss}`;
}

function addMinutesIso(iso: string, minutes: number | null | undefined): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  // Parse as UTC and format as UTC so there is NO timezone shift — the app is
  // single-market and these strings are wall-clock, not instants.
  const d = new Date(`${iso}Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 19);
}

export function ptBookingToTodayItem(row: PtBookingRow): TodayItem {
  const startAt = toIso(row.scheduled_date, row.scheduled_time);
  return {
    id: row.id,
    kind: 'appointment',
    title: row.pt_offerings?.title?.trim() || 'Session',
    startAt,
    endAt: addMinutesIso(startAt, row.pt_offerings?.duration_minutes ?? null),
    clientName: row.users?.full_name?.trim() || row.users?.email?.split('@')[0] || undefined,
    href: `/lana-pro/bookings#${row.id}`,
    status: row.status ?? undefined,
  };
}

export function sessionToTodayItem(row: SessionRow, bookedCount: number): TodayItem {
  const startAt = toIso(row.date, row.time);
  return {
    id: row.id,
    kind: 'class',
    title: row.name?.trim() || 'Class',
    startAt,
    endAt: addMinutesIso(startAt, row.duration_minutes ?? null),
    providerName: row.instructor?.trim() || undefined,
    bookedCount,
    capacity: row.max_capacity ?? undefined,
    href: `/lana-pro/schedule#${row.id}`,
  };
}

/** Chronological, id-tiebroken so the order is fully deterministic. */
export function sortTodayItems(items: readonly TodayItem[]): TodayItem[] {
  return [...items].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
  );
}

/** Same calendar day as `nowIso` in the app's local frame (string prefix
 *  compare — no timezone conversion). */
export function isSameDay(iso: string, nowIso: string): boolean {
  return iso.slice(0, 10) === nowIso.slice(0, 10);
}

export interface TodaySplit {
  /** Every item on the current calendar day, sorted. */
  today: TodayItem[];
  /** The next item that has not yet started (today or later), or null. */
  next: TodayItem | null;
  /** Count of today's items still upcoming (start > now). */
  remainingToday: number;
}

export function splitToday(items: readonly TodayItem[], nowIso: string): TodaySplit {
  const sorted = sortTodayItems(items);
  const today = sorted.filter((i) => isSameDay(i.startAt, nowIso));
  const next =
    sorted.find((i) => i.startAt >= nowIso) ??
    // everything today is in the past → fall back to the last thing today so
    // "NEXT" still shows something meaningful rather than going blank
    (today.length > 0 ? today[today.length - 1] : null);
  const remainingToday = today.filter((i) => i.startAt > nowIso).length;
  return { today, next, remainingToday };
}
