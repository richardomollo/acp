// LANA PRO onboarding — service-area capture (Phase 3 hardening).
//
// Phase 2 leaned on `NEIGHBOURHOOD_LABELS` (a fixed Nairobi-only list) to let a
// professional pick the areas they cover. That baked a single city into the new
// Lana Pro architecture and would force another frontend rewrite the first time
// Lana onboards a professional outside Nairobi.
//
// This replaces it with free-text tags: the professional types an area name
// ("Kilimani", "Brooklyn", "Lisbon — Alfama", …) and it becomes a chip. No
// country list, no geocoding, no Places dependency. The values land in the
// existing `personal_trainers.service_areas text[]` column, which is already
// uncontrolled free text — consumers substring-match and display it verbatim,
// so arbitrary strings are safe.
//
// Pure: no React, no DOM. Unit-tested with `node --test`.

/** Longest area label we keep — long enough for "City — Neighbourhood" style
 *  entries, short enough to reject pasted paragraphs. */
export const MAX_AREA_LABEL_LENGTH = 60;

/** Most areas a professional can stage. A soft cap that keeps the chip list and
 *  the stored array sane; not a product rule. */
export const MAX_SERVICE_AREAS = 20;

/** Collapse internal whitespace, trim, and clip to the max length. Returns ''
 *  for anything that isn't usable (empty, whitespace-only). */
export function normalizeAreaInput(raw: string): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '';
  return collapsed.slice(0, MAX_AREA_LABEL_LENGTH);
}

/** Case-insensitive membership test against the already-staged areas. */
export function areaAlreadyPresent(existing: readonly string[], candidate: string): boolean {
  const norm = normalizeAreaInput(candidate).toLowerCase();
  if (norm.length === 0) return false;
  return existing.some((a) => a.toLowerCase() === norm);
}

/**
 * Add one typed area to the list. Pure — returns a NEW array.
 * - normalises the input
 * - drops empties
 * - de-dupes case-insensitively (keeps the existing casing)
 * - respects MAX_SERVICE_AREAS
 * A comma or newline in the input splits it into several areas, so pasting
 * "Kilimani, Lavington, Karen" stages three chips.
 */
export function addServiceArea(existing: readonly string[], raw: string): string[] {
  const parts = String(raw ?? '')
    .split(/[,\n]/)
    .map(normalizeAreaInput)
    .filter((p) => p.length > 0);

  const out = [...existing];
  for (const part of parts) {
    if (out.length >= MAX_SERVICE_AREAS) break;
    if (!areaAlreadyPresent(out, part)) out.push(part);
  }
  return out;
}

/** Remove one area (case-insensitive match). Pure — returns a NEW array. */
export function removeServiceArea(existing: readonly string[], raw: string): string[] {
  const norm = normalizeAreaInput(raw).toLowerCase();
  return existing.filter((a) => a.toLowerCase() !== norm);
}

/** Final sanitiser before persistence: normalise every entry, drop empties and
 *  case-insensitive duplicates, cap the count. Safe on untrusted draft data. */
export function sanitizeServiceAreas(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (out.length >= MAX_SERVICE_AREAS) break;
    const norm = normalizeAreaInput(typeof raw === 'string' ? raw : '');
    if (norm.length === 0) continue;
    if (!areaAlreadyPresent(out, norm)) out.push(norm);
  }
  return out;
}
