// ACP Intelligence™ — Nutrition N5. Camera-assisted logging: PURE layer.
//
// A meal photo is an INPUT ASSISTANT, never the nutrition source of truth
// (§2). This module:
//   • parses & hard-validates the vision model's structured output into a
//     small, safe list of textual food CANDIDATES (labels + detection
//     confidence only — no calories, no macros, ever);
//   • deterministically ranks canonical-food search results against a
//     candidate label (no LLM, no embeddings — §18);
//   • models the mandatory user-confirmation state (§19) and the operations
//     on it (accept / change / remove / add missed food).
//
// Nothing here calls a network or an LLM. The vision proposal is discarded
// once the user confirms; only the confirmed canonical food + portion is
// evidence (§32).

import type { CanonicalFood, FoodSearchResult, MealSlot } from './food-types.ts';

// ── Vision result ─────────────────────────────────────────────────────────

export type VisionConfidence = 'high' | 'medium' | 'low';

export interface VisionCandidate {
  label: string;
  confidence: VisionConfidence;
}

export interface VisionResult {
  foods: VisionCandidate[];
  /** the model itself flagged the image as hard to read / possibly not food */
  uncertain: boolean;
}

/** Server + client both enforce these before an image is analysed (§39). */
export const IMAGE_CONSTRAINTS = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  maxBytes: 5 * 1024 * 1024, // 5 MB decoded — a q0.4 phone photo is far under this
  maxCandidates: 8,          // §7 — 1–8 useful components
} as const;

export function isAllowedMimeType(mime: unknown): mime is (typeof IMAGE_CONSTRAINTS.allowedMimeTypes)[number] {
  return typeof mime === 'string' && (IMAGE_CONSTRAINTS.allowedMimeTypes as readonly string[]).includes(mime);
}

/**
 * The effective MIME type of a photo picked via expo-image-picker. Pure so it
 * can be unit-tested without the native module. N10 N5: an iPhone library
 * photo is frequently HEIC/HEIF — do NOT silently relabel it `image/jpeg`,
 * because the bytes really are HEIC and the vision model rejects them,
 * surfacing to the user as a misleading "couldn't read that photo". Returning
 * the real (unsupported) type lets the capture layer report an honest
 * `unsupported`. Re-encoding to JPEG would need expo-image-manipulator —
 * deferred.
 */
export function mimeFromPickedAsset(asset: { mimeType?: string | null; uri?: string | null }): string {
  const declared = asset.mimeType?.toLowerCase();
  if (declared && isAllowedMimeType(declared)) return declared;
  const uri = (asset.uri ?? '').toLowerCase();
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.heic') || uri.endsWith('.heif') || declared === 'image/heic' || declared === 'image/heif') {
    return 'image/heic';
  }
  return 'image/jpeg';
}

/** Approximate byte length of a base64 payload without decoding it. */
export function approxBase64Bytes(base64: string): number {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

function coerceConfidence(v: unknown): VisionConfidence | null {
  return v === 'high' || v === 'medium' || v === 'low' ? v : null;
}

/**
 * Strict parse of the vision model's JSON. Returns null when the payload is
 * not a usable food-candidate list. Blank/duplicate labels are dropped;
 * candidates are capped; a missing/invalid confidence downgrades to 'low'
 * (detection confidence, never nutrition confidence — §20).
 */
export function parseVisionResult(raw: unknown): VisionResult | null {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const r = obj as Record<string, unknown>;
  if (!Array.isArray(r.foods)) return null;

  const seen = new Set<string>();
  const foods: VisionCandidate[] = [];
  for (const item of r.foods) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const label = typeof it.label === 'string' ? it.label.trim().replace(/\s+/g, ' ') : '';
    if (label.length < 2 || label.length > 60) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;          // §47 — duplicate labels dropped
    seen.add(key);
    foods.push({ label, confidence: coerceConfidence(it.confidence) ?? 'low' });
    if (foods.length >= IMAGE_CONSTRAINTS.maxCandidates) break;
  }

  const uncertain = r.uncertain === true || foods.length === 0;
  return { foods, uncertain };
}

// ── Deterministic canonical matching (§16/§17/§18) ─────────────────────────

const STOPWORDS = new Set(['and', 'with', 'the', 'a', 'of', 'in', 'raw', 'fresh', 'cooked', 'plain']);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

export interface RankedMatch {
  result: FoodSearchResult;
  /** 0–1 lexical overlap of the candidate label with the canonical name */
  score: number;
}

/**
 * Ranks canonical search results against a vision label by word overlap.
 * Generic foods and higher overlap rank first. Never invents a food; an
 * empty `results` yields an empty list (the UI then asks the user to search
 * manually — §40).
 */
export function rankCanonicalMatches(label: string, results: FoodSearchResult[]): RankedMatch[] {
  const want = tokens(label);
  if (want.length === 0) return results.map(r => ({ result: r, score: 0 }));
  return results
    .map(r => {
      const have = new Set(tokens(r.name));
      const hits = want.filter(t => have.has(t)).length;
      let score = hits / want.length;
      if (score > 0 && r.isGeneric) score += 0.15;
      // exact-name bonus
      if (r.name.toLowerCase() === label.toLowerCase()) score = 1.5;
      return { result: r, score: Math.min(score, 1.5) };
    })
    .sort((a, b) => b.score - a.score || Number(b.result.isGeneric) - Number(a.result.isGeneric) || a.result.name.localeCompare(b.result.name));
}

/** A match is "confident" enough to pre-select for review, but the user still confirms (§17). */
export function isConfidentMatch(top: RankedMatch | undefined): boolean {
  return !!top && top.score >= 0.6;
}

// ── Confirmation state (§19/§21/§22) ──────────────────────────────────────

export type ConfirmationStatus =
  | 'matched'        // a canonical food is selected (pre-selected or user-chosen), pending portion
  | 'needs_match'    // detected, but no confident canonical match — user must choose
  | 'removed';       // user removed this detection (kept in state so it can be undone)

export interface PhotoConfirmationItem {
  /** stable within one photo session */
  id: string;
  /** the original vision label, kept for display context; NOT logged */
  visionLabel: string | null;
  visionConfidence: VisionConfidence | null;
  status: ConfirmationStatus;
  /** set once a canonical food is chosen */
  food: CanonicalFood | null;
  /** portion, mirrors the N1 Log-food step */
  quantity: string;
  unit: 'g' | 'ml' | 'serving';
  servingLabel: string | null;
  /** true when the user added this item manually via search (not from the photo) */
  addedManually: boolean;
}

let __seq = 0;
export function newItemId(): string { return `pci_${Date.now().toString(36)}_${(++__seq).toString(36)}`; }

/** Default portion fields for a chosen canonical food — same rules as Log-food's pickFood. */
export function defaultPortionFor(food: CanonicalFood): Pick<PhotoConfirmationItem, 'quantity' | 'unit' | 'servingLabel'> {
  if (food.servings.length > 0) {
    return { quantity: '1', unit: 'serving', servingLabel: food.defaultServingLabel ?? food.servings[0].label };
  }
  return { quantity: String(food.defaultServingGrams ?? 100), unit: 'g', servingLabel: null };
}

export function candidateToItem(c: VisionCandidate): PhotoConfirmationItem {
  return {
    id: newItemId(), visionLabel: c.label, visionConfidence: c.confidence,
    status: 'needs_match', food: null, quantity: '100', unit: 'g', servingLabel: null, addedManually: false,
  };
}

export function manualItem(): PhotoConfirmationItem {
  return {
    id: newItemId(), visionLabel: null, visionConfidence: null,
    status: 'needs_match', food: null, quantity: '100', unit: 'g', servingLabel: null, addedManually: true,
  };
}

/** Apply a chosen canonical food to an item (accept a match / change a match). */
export function setItemFood(item: PhotoConfirmationItem, food: CanonicalFood): PhotoConfirmationItem {
  return { ...item, food, status: 'matched', ...defaultPortionFor(food) };
}

export function removeItem(item: PhotoConfirmationItem): PhotoConfirmationItem {
  return { ...item, status: 'removed' };
}
export function restoreItem(item: PhotoConfirmationItem): PhotoConfirmationItem {
  return { ...item, status: item.food ? 'matched' : 'needs_match' };
}

/** The items that will actually be logged: matched, not removed, with a food. */
export function loggableItems(items: PhotoConfirmationItem[]): PhotoConfirmationItem[] {
  return items.filter(i => i.status === 'matched' && i.food != null);
}

/** True when every non-removed item has a confirmed canonical food (ready to pick portions). */
export function allItemsMatched(items: PhotoConfirmationItem[]): boolean {
  const active = items.filter(i => i.status !== 'removed');
  return active.length > 0 && active.every(i => i.status === 'matched' && i.food != null);
}

export type { MealSlot };
