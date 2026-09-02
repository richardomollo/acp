// ACP Intelligence™ — Nutrition N4. COACHING SAFETY VALIDATOR (§33).
//
// The language model's output is untrusted. This pure module reconciles it
// against the deterministic opportunities it was given, and drops anything
// that: references an opportunity that wasn't supplied, names a food that
// wasn't on that opportunity's allowlist, or contains a prohibited claim
// (diagnosis, supplement, calorie target, extreme restriction, food
// moralising). Structural checks are primary; the string scan is
// defence-in-depth. Whatever is dropped falls back to the opportunity's
// deterministic copy — the user never sees nothing.

import type { NutritionCoachingOpportunity } from './nutrition-coaching-opportunity.ts';

export interface LlmCoachingOpportunity {
  id: string;
  explanation: string;
  suggestion: string;
}
export interface LlmCoachingOutput {
  summary: string;
  opportunities: LlmCoachingOpportunity[];
}

export interface NutritionCoachingCard {
  id: string;
  nutrient: string;
  title: string;
  /** the body shown to the user — LLM text if it passed validation, else the deterministic template */
  body: string;
  why: string;
  action: { label: string; route: string };
  source: 'llm' | 'deterministic';
}

export interface CoachingValidationResult {
  summary: string | null;      // LLM summary, only if it passed; else null (UI omits it)
  cards: NutritionCoachingCard[];
  llmUsedCount: number;
  droppedCount: number;
}

// Prohibited regardless of structure. Lower-cased substring / simple word checks.
const BANNED_PATTERNS: RegExp[] = [
  /\bdeficien\w*/i, /\bdeficit\b/i, /\bmalnutr\w*/i, /\bdiagnos\w*/i,
  /\bsupplement\w*/i, /\bprotein powder\b/i, /\bmultivitamin\b/i, /\btablet\b/i, /\bpill\b/i, /\bcapsule\b/i,
  /\bcalorie target\b/i, /\bcalorie deficit\b/i, /\btdee\b/i, /\bbmr\b/i, /\bkcal\b/i, /\beat back\b/i,
  /\bunhealthy\b/i, /\bhealthy diet\b/i, /\bclean eating\b/i, /\bcheat meal\b/i, /\bjunk food\b/i,
  /\bgood food\b/i, /\bbad food\b/i, /\bmoral\w*/i,
  /\byou (?:failed|must|should)\b/i, /\bcut out\b/i, /\bstop eating\b/i, /\brestrict\w*/i, /\bfast\w* for\b/i,
  /\bmedical\b/i, /\bdoctor\b/i, /\bblood test\b/i,
  // internal vocabulary must never leak (§17)
  /\bcoverageRatio\b/i, /\bevidence tier\b/i, /\breadiness\b/i, /\bcomparison state\b/i, /\bN[1-5]\b/,
];

function hasBannedLanguage(text: string): boolean {
  return BANNED_PATTERNS.some(re => re.test(text));
}

/** A numeric nutrition claim the model was not handed (defence against invented quantities, §12). */
function hasUnsanctionedNumber(text: string, sanctioned: string[]): boolean {
  const nums = text.match(/\d[\d.,]*\s?(?:g|mg|µg|grams?)?/gi) ?? [];
  return nums.some(tok => {
    const norm = tok.replace(/\s+/g, ' ').trim().toLowerCase();
    // allow small structural counts like "1 meal", "one meal", day counts already in `sanctioned`
    if (/^\d{1,2}$/.test(norm)) return false;
    return !sanctioned.some(s => s.toLowerCase().includes(norm) || norm.includes(s.toLowerCase()));
  });
}

function mentionsDisallowedFood(text: string, allowedFoodNames: string[]): boolean {
  // The model may only name foods from this opportunity's eligibleFoods list.
  // Heuristic: if it contains a capitalised multi-word food-like token that is
  // NOT one of the allowed names, treat it as invented and reject the card.
  const allowedLower = allowedFoodNames.map(n => n.toLowerCase());
  // common non-food capitalised words we don't want to false-positive on
  const IGNORE = new Set(['your', 'you', 'a', 'the', 'consider', 'one', 'across', 'increasing', 'greek']);
  const candidates = text.match(/\b([A-Z][a-z]+(?:\s+[a-z]+){0,2})\b/g) ?? [];
  for (const cRaw of candidates) {
    const c = cRaw.toLowerCase().trim();
    if (IGNORE.has(c.split(' ')[0])) continue;
    // only worry about tokens that look like a food reference the allowlist should contain
    if (allowedLower.some(a => a.includes(c) || c.includes(a))) continue;
    // "Greek yoghurt" etc. — a two-word Capitalised phrase not in the allowlist
    if (/\s/.test(cRaw) && !allowedLower.some(a => a.includes(cRaw.toLowerCase()))) return true;
  }
  return false;
}

/**
 * Reconcile the model output with the deterministic opportunities.
 * `opportunities` is the exact, ordered list the model was given.
 */
export function validateCoachingOutput(
  llm: LlmCoachingOutput | null | undefined,
  opportunities: NutritionCoachingOpportunity[],
): CoachingValidationResult {
  const cards: NutritionCoachingCard[] = [];
  let llmUsedCount = 0;
  let droppedCount = 0;

  // Sanctioned tokens the model is allowed to echo: the average + reference
  // labels and logged-day counts already computed deterministically.
  const sanctionedNumbers: string[] = [];
  for (const o of opportunities) {
    sanctionedNumbers.push(o.evidenceSummary.averageLoggedLabel, o.evidenceSummary.referenceLabel,
      String(o.evidenceSummary.loggedDays), String(o.evidenceSummary.windowDays));
  }

  const llmById = new Map((llm?.opportunities ?? []).map(o => [o.id, o]));

  for (const o of opportunities) {
    const g = llmById.get(o.id);
    const allowedFoods = o.eligibleFoods.map(f => f.name);
    let body: string | null = null;

    if (g && typeof g.explanation === 'string' && typeof g.suggestion === 'string') {
      const combined = `${g.explanation}\n${g.suggestion}`;
      const ok =
        !hasBannedLanguage(combined)
        && !hasUnsanctionedNumber(combined, sanctionedNumbers)
        && !mentionsDisallowedFood(combined, allowedFoods);
      if (ok) {
        body = `${g.explanation.trim()} ${g.suggestion.trim()}`.trim();
        llmUsedCount += 1;
      } else {
        droppedCount += 1;
      }
    }

    cards.push({
      id: o.id,
      nutrient: o.nutrient,
      title: o.deterministicTitle,
      body: body ?? o.deterministicSuggestion,
      why: o.why,
      action: o.action,
      source: body ? 'llm' : 'deterministic',
    });
  }

  const summary = llm && typeof llm.summary === 'string' && llm.summary.trim()
    && !hasBannedLanguage(llm.summary)
    && !hasUnsanctionedNumber(llm.summary, sanctionedNumbers)
    ? llm.summary.trim()
    : null;

  return { summary, cards, llmUsedCount, droppedCount };
}

export { hasBannedLanguage };
