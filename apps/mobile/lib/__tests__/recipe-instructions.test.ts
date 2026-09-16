// Lana Recipes V1 — KFCT preparation-method import.
// Pure-logic tests for lib/nutrition/recipe-instructions.ts — the one
// deterministic, non-LLM parser that turns a KFCT source's raw
// `instructions_text` cell into structured ordered steps/sections.
//
// The Busara fixture below is copied VERBATIM from
// data/kfct/kenyan_recipes.csv (kfct_code 15018) — the task's required
// golden fixture. Every other fixture that claims to be "real source text"
// is likewise copied verbatim from that CSV; fixtures built only to exercise
// one corruption rule are marked SYNTHETIC and never claimed as real KFCT
// content.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseKfctInstructions } from '../nutrition/recipe-instructions.ts';

// Verbatim from data/kfct/kenyan_recipes.csv, kfct_code 15018 ("Busara").
const BUSARA_RAW =
  '1. Heat 1 ½ cups of water.\n' +
  '2. Put the sprouted finger millet flour and 1 ½ cups of\n' +
  '3. Mix the remaining dry ingredients (pure finger millet flour and whole maize flour).\n' +
  '4. Add 6 cups of water into the dry ingredients and stir to achieve a smooth paste.\n' +
  '5. In a cooking pot, add the rest of the water (13 cups) and bring to a boil.\n' +
  '6. Add the paste into the boiling water, stir and bring to a boil. Cook for 2 minutes.\n' +
  '7. Add the cooked porridge mixture to the sprouted millet mixture in the gourd and stir.\n' +
  '8. Cover the gourd and set it aside for 1 hour 30 minutes.\n' +
  '9. Serve cold.';

// Verbatim from data/kfct/kenyan_recipes.csv, kfct_code 15060 ("Githeri
// (Fresh Beans and Maize)") — the one genuine multi-part recipe among the
// 142 (a clean standalone "Stewing:" section heading, not glued corruption).
const GITHERI_RAW =
  '1. Remove fresh beans from pods. Put in a bowl or\n' +
  '2. Remove maize cobs with kernels from the husks.\n' +
  '3. Remove maize kernels from the cobs by hand.\n' +
  '4. Mix and wash the maize and beans.\n' +
  '5. Boil in 9 ¼ cups of water for 2 hours until cooked.\n' +
  '6. Prepare the onions and chop into a separate bowl.\n' +
  '7. Stewing:\n' +
  '8. Heat cooking fat into a pan and add the spring onions.\n' +
  '9. Cook the spring onions until they soften.\n' +
  '10. Add the boiled maize-beans mixture. Cover with a pan.\n' +
  '11. Add salt and continue cooking while stirring periodically.\n' +
  '12. Once ready, remove from fire and serve.';

// Verbatim from data/kfct/kenyan_recipes.csv, kfct_code 15026 ("Vegetable
// Samosa") — a real dangling-hyphen line-wrap artifact.
const VEG_SAMOSA_HYPHEN_STEP =
  '5. Soak the dried leek and mushrooms if using in cups of water for 15 min-';

// Verbatim from data/kfct/kenyan_recipes.csv, kfct_code 15025 ("Meat
// Samosa") — a real column-interleaved section header glued onto step 16.
const MEAT_SAMOSA_RAW_TAIL =
  '15. Make a thick long roll, cut into 9 pieces and the edges.\n' +
  '16. Roll out the balls, one at a time into desired Filling the Samosa:\n' +
  '17. Spoon the cooled meat filling into the casings and';

// SYNTHETIC — built only to exercise the truncation-ratio rule in
// isolation; not claimed as real KFCT text.
function syntheticStep(n: number, endsClean: boolean): string {
  return endsClean ? `${n}. Do the thing properly.` : `${n}. Do the thing and then`;
}

describe('parseKfctInstructions — golden fixture (§5)', () => {
  test('A. Busara (KFCT 15018) imports successfully from source', () => {
    const result = parseKfctInstructions(BUSARA_RAW);
    assert.equal(result.ok, true);
    assert.equal(result.reviewReason, undefined);
  });

  test('B. Busara step order and text are preserved exactly, source-verbatim', () => {
    const result = parseKfctInstructions(BUSARA_RAW);
    assert.equal(result.ok, true);
    const sections = result.instructions!.sections;
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, null);
    const steps = sections[0].steps;
    assert.equal(steps.length, 9);
    assert.deepEqual(steps.map(s => s.step), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(steps[0].text, 'Heat 1 ½ cups of water.');
    assert.equal(steps[1].text, 'Put the sprouted finger millet flour and 1 ½ cups of');
    assert.equal(steps[5].text, 'Add the paste into the boiling water, stir and bring to a boil. Cook for 2 minutes.');
    assert.equal(steps[8].text, 'Serve cold.');
    // The sequence required by §5: heating water, sprouted-flour prep,
    // mixing remaining dry ingredients, making the paste, boiling water,
    // cooking the paste, combining with the sprouted-millet mixture,
    // resting, serving cold.
    assert.match(steps[0].text, /heat/i);
    assert.match(steps[2].text, /mix the remaining dry ingredients/i);
    assert.match(steps[3].text, /smooth paste/i);
    assert.match(steps[4].text, /bring to a boil/i);
    assert.match(steps[6].text, /sprouted millet mixture/i);
    assert.match(steps[7].text, /set it aside/i);
    assert.match(steps[8].text, /serve cold/i);
  });

  test('a single truncated clause (Busara step 2) does not by itself trigger REVIEW_REQUIRED', () => {
    // Busara's own step 2 trails off with no terminal punctuation — this
    // must be TOLERATED (ratio 1/9 ≈ 11%, under the 25% threshold), not
    // treated as corruption, or the golden fixture itself would fail.
    const result = parseKfctInstructions(BUSARA_RAW);
    assert.equal(result.ok, true);
  });
});

describe('parseKfctInstructions — multi-part structure (§6)', () => {
  test('E. Githeri (KFCT 15060) preserves its two logical sections without flattening', () => {
    const result = parseKfctInstructions(GITHERI_RAW);
    assert.equal(result.ok, true);
    assert.equal(result.multiPart, true);
    const sections = result.instructions!.sections;
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, null);
    assert.equal(sections[0].steps.length, 6);
    assert.equal(sections[1].heading, 'Stewing');
    assert.equal(sections[1].steps.length, 5);
    // Numbering restarts at 1 within the new section, matching the source's
    // own per-part presentation.
    assert.deepEqual(sections[1].steps.map(s => s.step), [1, 2, 3, 4, 5]);
    assert.equal(sections[1].steps[0].text, 'Heat cooking fat into a pan and add the spring onions.');
  });

  test('single-part recipes report multiPart: false', () => {
    const result = parseKfctInstructions('1. Do the first thing.\n2. Do the second thing.');
    assert.equal(result.ok, true);
    assert.equal(result.multiPart, false);
    assert.equal(result.instructions!.sections.length, 1);
  });
});

describe('parseKfctInstructions — corruption detection, never guessed past (§9)', () => {
  test('F. a dangling-hyphen line-wrap (real Vegetable Samosa artifact) is REVIEW_REQUIRED, not reconstructed', () => {
    const result = parseKfctInstructions(`1. Prep the casings.\n${VEG_SAMOSA_HYPHEN_STEP}\n6. Fry until golden.`);
    assert.equal(result.ok, false);
    assert.match(result.reviewReason!, /ends mid-word/);
    assert.equal(result.instructions, undefined);
  });

  test('a section header glued onto another step (real Meat Samosa artifact) is REVIEW_REQUIRED', () => {
    const result = parseKfctInstructions(MEAT_SAMOSA_RAW_TAIL);
    assert.equal(result.ok, false);
    assert.match(result.reviewReason!, /section marker/);
    assert.match(result.reviewReason!, /Filling the Samosa/);
  });

  test('a genuinely standalone section heading is NOT corruption (must not be confused with the glued case)', () => {
    // Same label, but standing alone as its own complete step — this is
    // real source structure (as in Githeri, KFCT 15060), never a defect.
    const result = parseKfctInstructions('1. Prep the beans.\n2. Stewing:\n3. Add the beans and simmer.');
    assert.equal(result.ok, true);
    assert.equal(result.multiPart, true);
  });

  test('a high proportion of truncated steps degrades the whole recipe to REVIEW_REQUIRED', () => {
    // SYNTHETIC — 3 of 5 steps (60%) end with no terminal punctuation.
    const raw = [1, 2, 3, 4, 5].map(n => syntheticStep(n, n === 1 || n === 5)).join('\n');
    const result = parseKfctInstructions(raw);
    assert.equal(result.ok, false);
    assert.match(result.reviewReason!, /trail off with no terminal punctuation/);
  });

  test('exactly one truncated step out of many stays OK (matches the Busara tolerance)', () => {
    // SYNTHETIC — 1 of 6 steps (≈17%) truncated, under the 25% threshold.
    const raw = [1, 2, 3, 4, 5, 6].map(n => syntheticStep(n, n !== 3)).join('\n');
    const result = parseKfctInstructions(raw);
    assert.equal(result.ok, true);
  });

  test('blank source text is REVIEW_REQUIRED, never silently empty steps', () => {
    const result = parseKfctInstructions('   ');
    assert.equal(result.ok, false);
    assert.match(result.reviewReason!, /blank/);
  });

  test('text with no numbered steps at all is REVIEW_REQUIRED', () => {
    const result = parseKfctInstructions('Some descriptive prose with no numbered method.');
    assert.equal(result.ok, false);
  });
});

describe('parseKfctInstructions — formatting-artifact normalisation only (§3)', () => {
  test('internal newlines and repeated whitespace within a step are collapsed, never the words themselves', () => {
    const result = parseKfctInstructions('1. Mix   the\n   flour and\nwater.\n2. Serve hot.');
    assert.equal(result.ok, true);
    assert.equal(result.instructions!.sections[0].steps[0].text, 'Mix the flour and water.');
  });

  test('is a pure function: identical input always produces an identical result (no LLM, no randomness)', () => {
    const a = parseKfctInstructions(BUSARA_RAW);
    const b = parseKfctInstructions(BUSARA_RAW);
    assert.deepEqual(a, b);
  });
});
