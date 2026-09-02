import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCoachingOutput, hasBannedLanguage,
  type LlmCoachingOutput,
} from '../nutrition/nutrition-coaching-safety.ts';
import type { NutritionCoachingOpportunity } from '../nutrition/nutrition-coaching-opportunity.ts';

function opp(over: Partial<NutritionCoachingOpportunity> = {}): NutritionCoachingOpportunity {
  return {
    id: 'proteinG-below_range', nutrient: 'proteinG', nutrientLabel: 'Protein',
    comparison: 'below_range', readiness: 'high', eligibility: 'eligible', domain: 'macro',
    evidenceSummary: {
      averageLogged: 108, averageLoggedLabel: '108 g/day', referenceLabel: '115–165 g/day',
      loggedDays: 6, windowDays: 7, coverageBand: 'high',
    },
    eligibleFoods: [{ name: 'Greek yoghurt', mealSlots: ['breakfast'], occurrenceDays: 4, nutrientShare: 0.5 }],
    why: 'Across 6 logged days, your average logged protein was 108 g/day. Your current reference is 115–165 g/day.',
    deterministicTitle: 'A small protein opportunity',
    deterministicSuggestion: 'Your recent logs have been below your protein reference. Greek yoghurt already appears regularly in your logs at breakfast, so that could be a practical place to increase the protein contribution of a meal you already eat.',
    action: { label: 'Review recent nutrition', route: '/nutrition-history' },
    ...over,
  };
}

describe('validateCoachingOutput — structural allowlist (§16/§33)', () => {
  test('a clean, grounded LLM card is used', () => {
    const llm: LlmCoachingOutput = {
      summary: 'These are small optional adjustments based on your recent logs.',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'Your recent logged protein has been below your reference range.',
        suggestion: 'Greek yoghurt already appears at breakfast in your logs — that could be a practical place to add a little more protein.',
      }],
    };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards.length, 1);
    assert.equal(r.cards[0].source, 'llm');
    assert.equal(r.llmUsedCount, 1);
    assert.equal(r.summary, llm.summary);
  });

  test('an unknown opportunity id is dropped → deterministic fallback card kept', () => {
    const llm: LlmCoachingOutput = {
      summary: 'ok',
      opportunities: [{ id: 'sodiumMg-above_range', explanation: 'x', suggestion: 'y' }],
    };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards.length, 1);
    assert.equal(r.cards[0].source, 'deterministic');
    assert.equal(r.cards[0].body, opp().deterministicSuggestion);
  });

  test('a card that names a food NOT in the allowlist is rejected → deterministic fallback', () => {
    const llm: LlmCoachingOutput = {
      summary: 'ok',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'Protein has been below your reference range.',
        suggestion: 'Consider adding Cottage Cheese to your breakfast every day.',
      }],
    };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards[0].source, 'deterministic');
  });

  test('opportunities with no eligibleFoods: a card that names a food is rejected', () => {
    const noFoods = opp({ eligibleFoods: [], deterministicSuggestion: 'One practical place to start is choosing a single meal you already eat regularly and increasing its protein contribution.' });
    const llm: LlmCoachingOutput = {
      summary: 'ok',
      opportunities: [{ id: noFoods.id, explanation: 'Protein below reference range.', suggestion: 'Add Grilled Chicken to lunch.' }],
    };
    const r = validateCoachingOutput(llm, [noFoods]);
    assert.equal(r.cards[0].source, 'deterministic');
  });
});

describe('validateCoachingOutput — prohibited claims (§18/§20/§21/§33)', () => {
  const cases: [string, string][] = [
    ['diagnosis', 'You are protein deficient and should see a doctor.'],
    ['supplement', 'Consider a protein powder supplement with breakfast.'],
    ['calorie target', 'Aim for 2000 kcal and a small calorie deficit.'],
    ['restriction', 'Cut out carbs and restrict your intake.'],
    ['moralising', 'Swap the bad food for clean eating options.'],
    ['imperative judgement', 'You failed to hit protein. You must eat more.'],
    ['internal jargon', 'Your evidence tier and coverage ratio show readiness is high.'],
  ];
  for (const [name, bad] of cases) {
    test(`rejects "${name}" and falls back to the deterministic card`, () => {
      const llm: LlmCoachingOutput = {
        summary: 'ok', opportunities: [{ id: 'proteinG-below_range', explanation: bad, suggestion: 'ok suggestion' }],
      };
      const r = validateCoachingOutput(llm, [opp()]);
      assert.equal(r.cards[0].source, 'deterministic', name);
    });
  }

  test('an invented number (not among the supplied labels) is rejected', () => {
    const llm: LlmCoachingOutput = {
      summary: 'ok',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'Add 47 g of Greek yoghurt for an extra 12 g protein.',
        suggestion: 'ok',
      }],
    };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards[0].source, 'deterministic');
  });

  test('restating the SUPPLIED average / reference labels verbatim is allowed', () => {
    const llm: LlmCoachingOutput = {
      summary: 'Small optional adjustments.',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'Across your recent logs, average logged protein of 108 g/day has been under the 115–165 g/day reference.',
        suggestion: 'Greek yoghurt at breakfast could carry a little more protein.',
      }],
    };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards[0].source, 'llm');
  });
});

describe('validateCoachingOutput — never leaves the user with nothing (§24)', () => {
  test('LLM null → all deterministic cards, summary null', () => {
    const r = validateCoachingOutput(null, [opp(), opp({ id: 'fibreG-below_reference', nutrient: 'fibreG', nutrientLabel: 'Fibre' })]);
    assert.equal(r.cards.length, 2);
    assert.ok(r.cards.every(c => c.source === 'deterministic'));
    assert.equal(r.summary, null);
    assert.equal(r.llmUsedCount, 0);
  });
  test('every card always carries its deterministic "why" (never model text)', () => {
    const llm: LlmCoachingOutput = { summary: 's', opportunities: [{ id: 'proteinG-below_range', explanation: 'e', suggestion: 'x' }] };
    const r = validateCoachingOutput(llm, [opp()]);
    assert.equal(r.cards[0].why, opp().why);
  });
});

describe('hasBannedLanguage', () => {
  test('catches the core prohibited terms', () => {
    for (const b of ['You are deficient', 'take a supplement', 'calorie deficit', 'unhealthy diet', 'clean eating', 'N2 evidence', 'protein powder']) {
      assert.ok(hasBannedLanguage(b), b);
    }
  });
  test('passes ordinary coaching phrasing', () => {
    for (const ok of ['Consider adding a little more protein at breakfast.', 'Based on your recent logs this could be a practical place to start.']) {
      assert.ok(!hasBannedLanguage(ok), ok);
    }
  });
});
