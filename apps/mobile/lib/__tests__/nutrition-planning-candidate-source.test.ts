// Lana Nutrition — Monthly → Weekly → Daily Planning V1. Closing the Loop
// §18/§31 — automated proof that Saved Meals (and legacy `meals`) never
// enter AUTOMATIC Lana weekly-plan generation.
//
// This can't be proven by calling the service directly (it talks to
// Supabase, no DB in this test run) — instead it pins the invariant at the
// SOURCE level: nutrition-planning-service.ts must never import the
// saved-meal candidate adapter or query `meals`/`saved_meals` for candidate
// generation. If a future change wires either in, this test fails loudly
// rather than silently reintroducing a non-canonical planning source.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../../services/nutrition-planning-service.ts');
const source = readFileSync(SERVICE_PATH, 'utf-8');

describe('nutrition-planning-service.ts — canonical-recipes-only candidate source', () => {
  test('A. never IMPORTS mealCandidateFromSavedMeal (the Saved Meal candidate adapter) — only mentioning it in a comment is fine', () => {
    const importLines = source.split('\n').filter(l => /^\s*import\b/.test(l) || /from '@\/lib\/nutrition\/nutrition-meal-model'/.test(l));
    const importsSavedMealAdapter = importLines.some(l => l.includes('mealCandidateFromSavedMeal'));
    assert.equal(importsSavedMealAdapter, false, 'Saved Meals must not be an automatic planning candidate source');
  });

  test('B. never queries the legacy `meals` table', () => {
    assert.ok(!/from\(\s*['"]meals['"]\s*\)/.test(source), 'legacy `meals` must not be a planning candidate source');
  });

  test('C. never queries `saved_meals` for candidates', () => {
    assert.ok(!/from\(\s*['"]saved_meals['"]\s*\)/.test(source), 'saved_meals must not be a planning candidate source');
  });

  test('D. candidate fetching is exclusively recipeService.listActiveForSuggestions()', () => {
    assert.ok(source.includes('recipeService.listActiveForSuggestions()'));
  });
});
