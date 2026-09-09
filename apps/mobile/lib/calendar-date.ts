// LH-26 — calendar-date (date-only) values at UI ⇄ persistence boundaries.
//
// A target date, a date of birth, a chosen "by when" — these are CALENDAR
// DATES: a year / month / day the user picked off a calendar, not an instant
// in time. They must round-trip byte-identical in every timezone.
//
// A JS `Date` is an instant (ms since the epoch). The moment you serialise one
// with `toISOString()` you get its UTC wall-clock — which is a DIFFERENT
// calendar day for anyone east or west of UTC near the edges of the day. In
// Africa/Nairobi (UTC+3) the picker hands back `2026-12-08T00:00:00` local =
// `2026-12-07T21:00:00Z`, and `toISOString().split('T')[0]` is "2026-12-07".
// That one-day loss is LH-26.
//
// The fix is NOT an offset add/subtract and NOT a hardcoded zone. It is to
// read the LOCAL calendar components on the way out, and reconstruct LOCAL
// midnight on the way back. These two functions are the only sanctioned
// conversion between a picker `Date` and the canonical `YYYY-MM-DD` string for
// date-only fields.
//
// Scope: date-only fields whose semantics are a calendar day. NOT for
// timestamps/instants (created_at, logged_at, session expiry, …) — those are
// genuine moments in time and belong in UTC.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `new Date(y, m-1, d)`, but `null` if the components rolled over (e.g.
 *  month 13, or Feb 30) rather than naming a real calendar day. */
function buildLocalMidnight(y: number, m: number, d: number): Date | null {
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  // JS silently rolls invalid components forward (Feb 30 → Mar 2); reject that.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * A picker `Date` → the canonical `YYYY-MM-DD` calendar-date string, using the
 * date's LOCAL year/month/day (i.e. the day the user actually tapped). Never
 * `toISOString()` — that would shift the day for non-UTC zones.
 */
export function toCalendarDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The canonical `YYYY-MM-DD` string → a `Date` at LOCAL midnight of that
 * calendar day, so a date picker seeded with it shows the same day the user
 * chose. Built from numeric components via `new Date(y, m-1, d)` — never
 * `new Date("YYYY-MM-DD")`, which the spec (and Hermes) parse as UTC midnight.
 *
 * Throws on anything that is not a `YYYY-MM-DD` string — a calendar-date field
 * should never hold anything else, and silently coercing hides upstream bugs.
 */
export function parseCalendarDate(iso: string): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new RangeError(`Not a YYYY-MM-DD calendar date: ${JSON.stringify(iso)}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  const dt = buildLocalMidnight(y, m, d);
  if (!dt) throw new RangeError(`Not a valid calendar date: ${JSON.stringify(iso)}`);
  return dt;
}

/**
 * Render-safe variant of {@link parseCalendarDate}: returns `null` instead of
 * throwing for a missing or malformed value, so a display/`value=` site can
 * fall back without a crash.
 */
export function parseCalendarDateOrNull(iso: string | null | undefined): Date | null {
  if (!iso || !ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return buildLocalMidnight(y, m, d);
}

/** Whole calendar days from `fromIso` to `toIso` (may be negative). Both must
 *  be canonical `YYYY-MM-DD`. DST-safe: computed from local-midnight Dates and
 *  rounded, so a 23h/25h transition day never miscounts. */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = parseCalendarDate(fromIso).getTime();
  const b = parseCalendarDate(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}
