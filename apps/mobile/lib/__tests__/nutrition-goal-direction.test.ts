import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPoolReference,
  directionalFitScore,
  type DirectionalFitMeal,
  type WeightDirection,
} from '../nutrition-goal-direction.ts';

function dMeal(overrides: Partial<DirectionalFitMeal> = {}): DirectionalFitMeal {
  return { calories: 400, protein_g: 15, fibre_g: 3, balanceSignal: 1, ...overrides };
}

const POOL = [
  { calories: 200, protein_g: 5, fibre_g: 1 },
  { calories: 400, protein_g: 15, fibre_g: 3 },
  { calories: 800, protein_g: 35, fibre_g: 7 },
];

describe('buildPoolReference', () => {
  test('medians are a pure function of the pool (odd count → middle value)', () => {
    const ref = buildPoolReference(POOL);
    assert.equal(ref.medianCalories, 400);
    assert.equal(ref.medianProtein, 15);
    assert.equal(ref.medianFibre, 3);
    assert.equal(ref.hasData, true);
  });

  test('even count → mean of the two middle values', () => {
    const ref = buildPoolReference([
      { calories: 100, protein_g: 0, fibre_g: 0 },
      { calories: 300, protein_g: 10, fibre_g: 2 },
      { calories: 500, protein_g: 20, fibre_g: 4 },
      { calories: 900, protein_g: 40, fibre_g: 8 },
    ]);
    assert.equal(ref.medianCalories, 400); // (300 + 500) / 2
    assert.equal(ref.medianProtein, 15);
    assert.equal(ref.medianFibre, 3);
  });

  test('nullable macro columns are read as 0, never dropped', () => {
    const ref = buildPoolReference([
      { calories: null, protein_g: null, fibre_g: null },
      { calories: 400, protein_g: 20, fibre_g: 4 },
      { calories: 600, protein_g: 30, fibre_g: 6 },
    ]);
    assert.equal(ref.medianCalories, 400);
    assert.equal(ref.medianProtein, 20);
    assert.equal(ref.medianFibre, 4);
  });

  test('empty pool → hasData false', () => {
    const ref = buildPoolReference([]);
    assert.equal(ref.hasData, false);
  });
});

describe('directionalFitScore — neutral cases leave ranking untouched', () => {
  const ref = buildPoolReference(POOL);

  test("'none' and 'unknown' always score exactly 0.5 regardless of the meal", () => {
    for (const dir of ['none', 'unknown'] as WeightDirection[]) {
      assert.equal(directionalFitScore(dMeal({ calories: 100 }), dir, ref), 0.5);
      assert.equal(directionalFitScore(dMeal({ calories: 2000, protein_g: 90 }), dir, ref), 0.5);
    }
  });

  test('no pool data → 0.5 even for a real direction (graceful degradation)', () => {
    const empty = buildPoolReference([]);
    assert.equal(directionalFitScore(dMeal(), 'gain', empty), 0.5);
    assert.equal(directionalFitScore(dMeal(), 'loss', empty), 0.5);
  });
});

describe("directionalFitScore — 'gain' direction", () => {
  const ref = buildPoolReference(POOL);

  test('a substantial, protein-forward, balanced meal outranks a light one', () => {
    const substantial = dMeal({ calories: 800, protein_g: 35, fibre_g: 7, balanceSignal: 1 });
    const light = dMeal({ calories: 200, protein_g: 5, fibre_g: 1, balanceSignal: 1 });
    assert.ok(directionalFitScore(substantial, 'gain', ref) > directionalFitScore(light, 'gain', ref));
  });

  test('a light meal still scores a meaningful non-zero — never excluded (LH-39 §5)', () => {
    const light = dMeal({ calories: 150, protein_g: 3, fibre_g: 0, balanceSignal: 0.5 });
    const score = directionalFitScore(light, 'gain', ref);
    assert.ok(score >= 0.3, `expected >= 0.3, got ${score}`);
  });

  test('NOT "highest calorie wins": a huge but unbalanced, low-protein meal does not beat a balanced protein-forward one', () => {
    const junkDense = dMeal({ calories: 1200, protein_g: 4, fibre_g: 0, balanceSignal: 0.5 });
    const balancedDense = dMeal({ calories: 800, protein_g: 35, fibre_g: 7, balanceSignal: 1 });
    assert.ok(directionalFitScore(balancedDense, 'gain', ref) > directionalFitScore(junkDense, 'gain', ref));
  });

  test('score stays within the documented [0.325, 1] band', () => {
    for (const m of [
      dMeal({ calories: 0, protein_g: 0, fibre_g: 0, balanceSignal: 0 }),
      dMeal({ calories: 5000, protein_g: 200, fibre_g: 50, balanceSignal: 1 }),
      dMeal(),
    ]) {
      const s = directionalFitScore(m, 'gain', ref);
      assert.ok(s >= 0.324 && s <= 1, `out of band: ${s}`);
    }
  });
});

describe("directionalFitScore — 'loss' direction", () => {
  const ref = buildPoolReference(POOL);

  test('a protein- and fibre-forward lighter meal outranks a calorie-dense low-protein one', () => {
    const leanHighProtein = dMeal({ calories: 300, protein_g: 35, fibre_g: 7, balanceSignal: 1 });
    const denseLowProtein = dMeal({ calories: 800, protein_g: 5, fibre_g: 1, balanceSignal: 0.5 });
    assert.ok(directionalFitScore(leanHighProtein, 'loss', ref) > directionalFitScore(denseLowProtein, 'loss', ref));
  });

  test('NOT "lowest calorie wins": a calorie-dense meal that is high protein AND high fibre still scores strongly', () => {
    const denseButQuality = dMeal({ calories: 800, protein_g: 35, fibre_g: 7 });
    const score = directionalFitScore(denseButQuality, 'loss', ref);
    assert.ok(score >= 0.7, `expected a strong score for a dense high-quality meal, got ${score}`);
  });

  test('a tiny nutrient-poor meal is not automatically the winner', () => {
    const tinyPoor = dMeal({ calories: 120, protein_g: 2, fibre_g: 0 });
    const midQuality = dMeal({ calories: 450, protein_g: 30, fibre_g: 6 });
    assert.ok(directionalFitScore(midQuality, 'loss', ref) > directionalFitScore(tinyPoor, 'loss', ref));
  });

  test('score stays within the documented [0.46, 1] band', () => {
    for (const m of [
      dMeal({ calories: 0, protein_g: 0, fibre_g: 0, balanceSignal: 0 }),
      dMeal({ calories: 5000, protein_g: 200, fibre_g: 50, balanceSignal: 1 }),
      dMeal(),
    ]) {
      const s = directionalFitScore(m, 'loss', ref);
      assert.ok(s >= 0.459 && s <= 1, `out of band: ${s}`);
    }
  });
});

describe('determinism', () => {
  test('identical inputs always produce an identical score', () => {
    const ref = buildPoolReference(POOL);
    const m = dMeal({ calories: 610, protein_g: 22, fibre_g: 4 });
    const first = directionalFitScore(m, 'gain', ref);
    for (let i = 0; i < 20; i++) {
      assert.equal(directionalFitScore(m, 'gain', ref), first);
    }
  });
});
