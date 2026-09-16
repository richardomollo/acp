// Lana Nutrition — Recipes V1: KFCT source-authored preparation methods.
//
// Pure, deterministic parsing of the KFCT source's `instructions_text`
// field (data/kfct/kenyan_recipes.csv) into ordered steps, optionally
// grouped into named sections for multi-part recipes (e.g. a filling,
// then a casing, then frying). NO LLM anywhere in this file — every
// decision here is a fixed regex/structural rule, reviewable line by line.
//
// The source PDF's method text was extracted with two known defect
// classes that this module must NOT silently paper over:
//   1. A hyphenated line-wrap whose second half was dropped
//      ("...into sep-" — "separate [bowls]" never recovered).
//   2. A genuine section heading (e.g. "Stewing:") glued onto the END of
//      the PRECEDING step's text by column-interleaved extraction,
//      instead of appearing on its own line — as opposed to a heading
//      that DOES appear as its own, standalone numbered line (which is
//      real source structure, not corruption, and must be preserved).
// Either defect makes the recipe's step TEXT unreliable — this module
// refuses to guess the missing word or the correct step order; it reports
// REVIEW_REQUIRED and the caller must leave `instructions` NULL rather
// than import a plausible-looking but wrong reconstruction.

export interface RecipeInstructionStep {
  step: number;
  text: string;
}

export interface RecipeInstructionSection {
  /** null for a single-part recipe; a short source-derived label (e.g.
   *  "Stewing", "Frying") for a named part of a multi-part recipe. */
  heading: string | null;
  steps: RecipeInstructionStep[];
}

export interface ParsedRecipeInstructions {
  sections: RecipeInstructionSection[];
}

export interface RecipeInstructionParseResult {
  ok: boolean;
  /** Present when ok=true. */
  instructions?: ParsedRecipeInstructions;
  /** Present when ok=false — why this recipe is REVIEW_REQUIRED, never guessed past. */
  reviewReason?: string;
  /** True when instructions had >1 section — surfaced for the data-quality report. */
  multiPart?: boolean;
}

// A standalone section heading: the ENTIRE step text (after our own
// whitespace normalisation) is just a short Title-Case label ending in a
// colon — e.g. "Stewing:", "Cooking:", "To make the paste:". This is
// deliberately conservative (short, capitalised, no other punctuation) so
// it can't accidentally match an ordinary instruction sentence.
const SECTION_HEADING_RE = /^[A-Z][a-zA-Z ]{2,40}:$/;
// The same shape of label, but found ANYWHERE inside a step's text — used
// only to DETECT the "glued onto another step" corruption case, never to
// extract a heading from mid-sentence.
const EMBEDDED_COLON_RE = /\b([A-Z][a-zA-Z ]{2,40}):(?!\d)/;
// A step ending mid-word on a bare hyphen — the classic dropped line-wrap.
const DANGLING_HYPHEN_RE = /[a-zA-Z]-\s*$/;
// A step with NO terminal punctuation at all (no hyphen either) is also
// commonly a dropped line-wrap that happened to break on a word boundary
// rather than mid-word (e.g. "...into a bowl and" — the rest of the
// clause never made it into the extraction). A SINGLE such step is
// common even in otherwise-clean recipes (the golden fixture, KFCT
// 15018 Busara, has exactly one — its step 2) and isn't on its own
// grounds for rejecting the whole recipe: the sequence stays coherent
// and every step still names the right action. A recipe where this
// happens on an unusually LARGE share of its steps, though, has
// degraded enough that the method as a whole is no longer trustworthy —
// that's what TRUNCATION_RATIO_THRESHOLD below catches.
const TERMINAL_PUNCT_RE = /[.!?]$/;
const TRUNCATION_RATIO_THRESHOLD = 0.25;

interface RawStep {
  num: number;
  text: string;
}

/** Splits the source's flat "1. ...\n2. ...\n3. ..." text into raw steps.
 *  Formatting-only normalisation (§3 of the task): collapses internal
 *  newlines/whitespace within a step to single spaces, trims. Never
 *  touches word content. */
function splitRawSteps(rawText: string): RawStep[] {
  const normalized = rawText.replace(/\r\n/g, '\n');
  // Capturing split: (?:^|\n) — start of string, or right after a
  // newline — followed by "N. ". Alternates [num, text, num, text, ...].
  const parts = normalized.split(/(?:^|\n)(\d+)\.\s*/);
  const steps: RawStep[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const num = Number(parts[i]);
    const text = (parts[i + 1] ?? '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) steps.push({ num, text });
  }
  return steps;
}

/** Returns a human-reviewable reason string if the step sequence shows
 *  either known corruption signature — null if it looks safe to import. */
function detectCorruption(steps: RawStep[]): string | null {
  for (const s of steps) {
    if (DANGLING_HYPHEN_RE.test(s.text)) {
      return `step ${s.num} ends mid-word: "…${s.text.slice(-24)}"`;
    }
  }
  for (const s of steps) {
    const m = s.text.match(EMBEDDED_COLON_RE);
    if (m && !SECTION_HEADING_RE.test(s.text)) {
      return `step ${s.num} has a section marker ("${m[1]}:") glued onto other text instead of standing alone: "…${s.text.slice(-40)}"`;
    }
  }
  const truncated = steps.filter(s => !TERMINAL_PUNCT_RE.test(s.text) && !SECTION_HEADING_RE.test(s.text));
  const ratio = truncated.length / steps.length;
  if (ratio > TRUNCATION_RATIO_THRESHOLD) {
    return `${truncated.length} of ${steps.length} steps (${Math.round(ratio * 100)}%) trail off with no terminal punctuation — degraded beyond a single dropped line-wrap (e.g. step ${truncated[0].num}: "…${truncated[0].text.slice(-30)}")`;
  }
  return null;
}

/** Groups raw steps into sections, splitting wherever a step's ENTIRE
 *  text is (only) a standalone heading like "Stewing:" — genuine source
 *  structure (§6), never flattened away. Numbering restarts at 1 within
 *  each section, matching how the source itself presents each part. */
function buildSections(steps: RawStep[]): RecipeInstructionSection[] {
  const sections: RecipeInstructionSection[] = [{ heading: null, steps: [] }];
  for (const s of steps) {
    if (SECTION_HEADING_RE.test(s.text)) {
      const heading = s.text.replace(/:\s*$/, '').trim();
      const current = sections[sections.length - 1];
      if (current.steps.length === 0 && current.heading === null && sections.length === 1) {
        current.heading = heading; // the very first thing in the recipe is a heading — labels part 1, no empty section left behind
      } else {
        sections.push({ heading, steps: [] });
      }
      continue;
    }
    const current = sections[sections.length - 1];
    current.steps.push({ step: current.steps.length + 1, text: s.text });
  }
  return sections.filter(sec => sec.steps.length > 0);
}

/**
 * The one entry point. Deterministic, pure, no LLM. `rawText` is the
 * source's `instructions_text` value verbatim (never blank per §1 audit —
 * all 142 KFCT recipes have it).
 */
export function parseKfctInstructions(rawText: string): RecipeInstructionParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { ok: false, reviewReason: 'source instructions_text is blank' };

  const steps = splitRawSteps(trimmed);
  if (steps.length === 0) {
    return { ok: false, reviewReason: 'no numbered steps could be parsed from the source text' };
  }

  const corruption = detectCorruption(steps);
  if (corruption) return { ok: false, reviewReason: corruption };

  const sections = buildSections(steps);
  if (sections.length === 0 || sections.every(sec => sec.steps.length === 0)) {
    return { ok: false, reviewReason: 'parsing produced no usable steps' };
  }

  return { ok: true, instructions: { sections }, multiPart: sections.length > 1 };
}
