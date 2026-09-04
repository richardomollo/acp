// ACP Intelligence™ Day 7.3 — candidate diversification (spec section 32/58).
//
// Two-phase, deliberately simple (not a real diversity optimizer, section
// 32's own "implement a simple diversification layer"):
//  1. Guarantee one slot to every type that produced at least one eligible
//     candidate (so a single strong PT/open-gym result is never entirely
//     crowded out by five near-identical classes).
//  2. Fill every remaining slot up to the overall cap by pure global score,
//     regardless of type — a genuinely superior candidate is never bumped
//     just to force variety (spec: "do not sacrifice clearly superior
//     candidates purely for diversity").
import type { SupplyCandidate, SupplyCandidateType } from './types.ts';

export interface DiversifyOptions {
  limitPerType?: number;
  overallCap?: number;
}

const DEFAULT_LIMIT_PER_TYPE = 5;
const DEFAULT_OVERALL_CAP = 6;

export function diversifySupplyCandidates(
  candidates: SupplyCandidate[],
  options: DiversifyOptions = {},
): SupplyCandidate[] {
  const limitPerType = options.limitPerType ?? DEFAULT_LIMIT_PER_TYPE;
  const overallCap = options.overallCap ?? DEFAULT_OVERALL_CAP;

  const byType = new Map<SupplyCandidateType, SupplyCandidate[]>();
  for (const c of candidates) {
    const list = byType.get(c.type) ?? [];
    list.push(c);
    byType.set(c.type, list);
  }
  // Truncate each type's pool first (already sorted best-first by each builder).
  for (const [type, list] of byType) {
    byType.set(type, list.slice(0, limitPerType));
  }

  const selected: SupplyCandidate[] = [];
  const selectedIds = new Set<string>();
  const remaining = new Map(byType);

  // Phase 1 — one guaranteed slot per non-empty type, in a fixed,
  // deterministic type order (never Math.random(), never input order).
  const TYPE_ORDER: SupplyCandidateType[] = ['session', 'experience', 'personal_trainer', 'nutritionist', 'venue', 'class'];
  for (const type of TYPE_ORDER) {
    if (selected.length >= overallCap) break;
    const list = remaining.get(type);
    if (!list || list.length === 0) continue;
    const [best, ...rest] = list;
    selected.push(best);
    selectedIds.add(`${best.type}:${best.id}`);
    remaining.set(type, rest);
  }

  // Phase 2 — fill the rest by pure global score, deterministic tiebreak.
  const pool = Array.from(remaining.values()).flat()
    .filter(c => !selectedIds.has(`${c.type}:${c.id}`))
    .sort((a, b) => b.scoring.overall - a.scoring.overall || a.id.localeCompare(b.id));

  for (const c of pool) {
    if (selected.length >= overallCap) break;
    selected.push(c);
    selectedIds.add(`${c.type}:${c.id}`);
  }

  return selected;
}
