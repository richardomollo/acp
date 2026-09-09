// LANA MOBILE — Home marketplace search entry point.
//
// Pure, framework-free (no React Native, no Supabase, no navigation import):
// the deterministic core the Home search bottom sheet is built on. It decides
//   • the header action order (Check-in | Search | Notifications),
//   • the sheet's category tabs and their order,
//   • when a keystroke should browse / search / do nothing,
//   • what counts as a text match for each marketplace type (mirrors the
//     existing dedicated tab screens — classes.tsx / venues.tsx / trainers.tsx
//     — rather than inventing a second definition), and
//   • the canonical detail route each result opens.
//
// It does NOT fetch anything. The sheet still reuses the app's existing
// Supabase reads (sessions / gyms / personal_trainers) and the existing
// MarketplaceLocationProvider geo-scoping — this module only shapes and
// routes what those return, so there is no parallel search backend.

// ── Home header actions ─────────────────────────────────────────────────────
// The Home header shows exactly these three icon buttons, in this order. The
// screen renders by mapping this list, so the order is defined in one place
// and is testable without rendering.
export type HomeHeaderActionKey = 'check-in' | 'search' | 'notifications';

export interface HomeHeaderAction {
  key: HomeHeaderActionKey;
  /** Ionicons glyph name — same icon family as the rest of the header. */
  icon: string;
  accessibilityLabel: string;
}

export const HOME_HEADER_ACTIONS: readonly HomeHeaderAction[] = [
  { key: 'check-in', icon: 'scan-outline', accessibilityLabel: 'Check in' },
  { key: 'search', icon: 'search-outline', accessibilityLabel: 'Search classes, venues and trainers' },
  { key: 'notifications', icon: 'notifications-outline', accessibilityLabel: 'Notifications' },
] as const;

// ── Search sheet marketplace types ─────────────────────────────────────────
// The sheet shows all three together in one list with section headers (the
// category-tab UI was removed). This list still defines the section ORDER and
// the labels, and backs the homeSearchResultRoute overloads.
export type HomeSearchCategory = 'classes' | 'venues' | 'trainers';

export interface HomeSearchCategoryInfo {
  key: HomeSearchCategory;
  label: string;
  /** Ionicons glyph name for the result fallback thumbnail. */
  icon: string;
}

export const HOME_SEARCH_CATEGORIES: readonly HomeSearchCategoryInfo[] = [
  { key: 'classes', label: 'Classes', icon: 'barbell' },
  { key: 'venues', label: 'Venues', icon: 'business' },
  { key: 'trainers', label: 'Personal Trainers', icon: 'body' },
] as const;

/** Placeholder for the sheet's search input. */
export const HOME_SEARCH_PLACEHOLDER = 'Search activities, venues or trainers';

/** Below this many non-space characters a query is "still typing" — the sheet
 *  keeps whatever it was already showing instead of firing a fetch per
 *  keystroke. Matches the threshold the pre-existing Home search used. */
export const HOME_SEARCH_MIN_QUERY = 2;

/** How many rows a browse / search fetch asks for. Compact V1 (spec §7). */
export const HOME_SEARCH_LIMIT = 20;

export type HomeSearchMode = 'browse' | 'typing' | 'search';

/**
 * What a given query string should do:
 *   ''        → 'browse'  (empty query: show that marketplace type, unfiltered)
 *   'a'       → 'typing'  (1 char: do nothing, keep the current list)
 *   'ab'…     → 'search'  (>= HOME_SEARCH_MIN_QUERY: text search)
 * Whitespace-only is treated as empty.
 */
export function homeSearchMode(query: string): HomeSearchMode {
  const q = query.trim();
  if (q.length === 0) return 'browse';
  if (q.length < HOME_SEARCH_MIN_QUERY) return 'typing';
  return 'search';
}

export function isValidHomeSearchCategory(value: unknown): value is HomeSearchCategory {
  return value === 'classes' || value === 'venues' || value === 'trainers';
}

// ── Text matching (mirrors the dedicated tab screens) ──────────────────────
function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

function tokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Every whitespace-separated token must appear somewhere in `fields`. An
 *  empty query matches everything (browse). */
export function matchesAllTokens(query: string, fields: (string | null | undefined)[]): boolean {
  const ts = tokens(query);
  if (ts.length === 0) return true;
  const hay = fields.map(norm).join('  ');
  return ts.every(t => hay.includes(t));
}

// Minimal row shapes — only the fields these filters read. The caller's real
// rows (with image_url etc.) are structurally compatible.
export interface ClassSearchRow {
  id: string;
  name: string;
  instructor?: string | null;
  gyms?: { name?: string | null } | null;
}
export interface VenueSearchRow {
  id: string;
  name: string;
  location?: string | null;
}
export interface TrainerSearchRow {
  id: string;
  full_name: string;
  professional_name?: string | null;
  specialisations?: string[] | null;
  service_areas?: string[] | null;
}

/** classes.tsx: name / instructor / gym name. */
export function filterClassesLocally<T extends ClassSearchRow>(rows: T[], query: string): T[] {
  return rows.filter(r => matchesAllTokens(query, [r.name, r.instructor, r.gyms?.name]));
}

/** venues.tsx: name / location. */
export function filterVenuesLocally<T extends VenueSearchRow>(rows: T[], query: string): T[] {
  return rows.filter(r => matchesAllTokens(query, [r.name, r.location]));
}

/** trainers.tsx: professional/display name / specialisations / service areas. */
export function filterTrainersLocally<T extends TrainerSearchRow>(rows: T[], query: string): T[] {
  return rows.filter(r => matchesAllTokens(query, [
    r.professional_name ?? r.full_name,
    r.full_name,
    ...(r.specialisations ?? []),
    ...(r.service_areas ?? []),
  ]));
}

/** Convenience dispatcher (used by tests and any caller that already has a
 *  category in hand). Component code can also call the specific
 *  filter*Locally helpers directly to keep its concrete row type. */
export function filterHomeSearchResults<T extends Record<string, unknown>>(
  category: HomeSearchCategory,
  rows: T[],
  query: string,
): T[] {
  if (category === 'classes') return filterClassesLocally(rows as unknown as ClassSearchRow[], query) as unknown as T[];
  if (category === 'venues') return filterVenuesLocally(rows as unknown as VenueSearchRow[], query) as unknown as T[];
  return filterTrainersLocally(rows as unknown as TrainerSearchRow[], query) as unknown as T[];
}

// ── Canonical detail routing ──────────────────────────────────────────────
// These MUST match the routes the dedicated marketplace screens already use
// (classes.tsx → /session-details, venues.tsx → /gym-details, trainers.tsx →
// /trainer-profile). The sheet never renders its own detail screen.
export interface HomeSearchRoute {
  pathname: '/session-details' | '/gym-details' | '/trainer-profile';
  params: Record<string, string>;
}

export interface ClassRouteRow { id: string; gyms?: { name?: string | null } | null }
export interface VenueRouteRow { id: string }
export interface TrainerRouteRow { id: string }

export function homeSearchResultRoute(
  category: 'classes',
  row: ClassRouteRow,
): HomeSearchRoute;
export function homeSearchResultRoute(
  category: 'venues',
  row: VenueRouteRow,
): HomeSearchRoute;
export function homeSearchResultRoute(
  category: 'trainers',
  row: TrainerRouteRow,
): HomeSearchRoute;
export function homeSearchResultRoute(
  category: HomeSearchCategory,
  row: { id: string; gyms?: { name?: string | null } | null },
): HomeSearchRoute {
  switch (category) {
    case 'classes':
      return { pathname: '/session-details', params: { sessionId: row.id, gymName: row.gyms?.name ?? 'Gym' } };
    case 'venues':
      return { pathname: '/gym-details', params: { gymId: row.id } };
    case 'trainers':
      return { pathname: '/trainer-profile', params: { id: row.id } };
  }
}
