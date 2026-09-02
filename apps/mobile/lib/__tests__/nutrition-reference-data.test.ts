import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  POPULATION_REFERENCES, PROTEIN_PERFORMANCE_REFERENCE, NUTRIENT_REF_KEYS, SOURCES,
} from '../nutrition/nutrition-reference-data.ts';

describe('reference data — provenance (§5/§32)', () => {
  test('every population reference row carries full source metadata', () => {
    for (const row of POPULATION_REFERENCES) {
      assert.ok(row.source.organisation.length > 0, row.nutrient);
      assert.ok(row.source.document.length > 0, row.nutrient);
      assert.ok(row.source.url.startsWith('https://'), row.nutrient);
      assert.ok(Number.isInteger(row.source.year) && row.source.year > 2000, row.nutrient);
      assert.ok(['PRI', 'AI', 'AR', 'consensus_range'].includes(row.source.sourceType), row.nutrient);
    }
  });

  test('protein performance reference carries full source metadata', () => {
    const r = PROTEIN_PERFORMANCE_REFERENCE;
    assert.equal(r.source.organisation, 'International Society of Sports Nutrition (ISSN)');
    assert.ok(r.source.url.startsWith('https://'));
    assert.equal(r.source.year, 2017);
    assert.equal(r.kind, 'personalised_performance_target');
  });

  test('every population row declares an age floor', () => {
    for (const row of POPULATION_REFERENCES) {
      assert.equal(typeof row.population.minAgeYears, 'number');
      assert.ok(row.population.minAgeYears >= 18, `${row.nutrient} should not silently cover minors`);
    }
  });
});

describe('reference data — category separation (§4)', () => {
  test('population references are all "population_reference" kind, protein is "personalised_performance_target"', () => {
    for (const row of POPULATION_REFERENCES) assert.equal(row.kind, 'population_reference');
    assert.equal(PROTEIN_PERFORMANCE_REFERENCE.kind, 'personalised_performance_target');
  });
  test('protein reference is a RANGE, not a single value (§6)', () => {
    assert.equal(PROTEIN_PERFORMANCE_REFERENCE.referenceType, 'range');
    assert.equal(PROTEIN_PERFORMANCE_REFERENCE.min, 1.4);
    assert.equal(PROTEIN_PERFORMANCE_REFERENCE.max, 2.0);
    assert.equal(PROTEIN_PERFORMANCE_REFERENCE.unit, 'g_per_kg');
  });
});

describe('deliberate omissions / withheld rows', () => {
  test('zinc has no reference row at all (phytate-dependent, no clean single value)', () => {
    assert.ok(!NUTRIENT_REF_KEYS.includes('zincMg' as any));
    assert.ok(!POPULATION_REFERENCES.some(r => r.nutrient === ('zincMg' as any)));
  });

  test('female iron row exists but is explicitly withheld with a reason', () => {
    const femaleIron = POPULATION_REFERENCES.find(r => r.nutrient === 'ironMg' && r.population.sex === 'female');
    assert.ok(femaleIron, 'female iron row should exist (documents the source gap)');
    assert.ok(femaleIron!.unsupportedReason && femaleIron!.unsupportedReason.length > 0);
    assert.match(femaleIron!.unsupportedReason!, /menopaus/i);
  });

  test('male iron IS supported (no unsupportedReason)', () => {
    const maleIron = POPULATION_REFERENCES.find(r => r.nutrient === 'ironMg' && r.population.sex === 'male');
    assert.ok(maleIron);
    assert.equal(maleIron!.unsupportedReason, undefined);
    assert.equal(maleIron!.value, 11);
  });
});

describe('EFSA values transcribed correctly (spot check against source table)', () => {
  test('fibre AI = 25 g/d, unisex', () => {
    const r = POPULATION_REFERENCES.find(x => x.nutrient === 'fibreG')!;
    assert.equal(r.value, 25); assert.equal(r.unit, 'g'); assert.equal(r.population.sex, null);
    assert.equal(r.source.sourceType, 'AI');
  });
  test('potassium PRI = 3500 mg/d, unisex', () => {
    const r = POPULATION_REFERENCES.find(x => x.nutrient === 'potassiumMg')!;
    assert.equal(r.value, 3500);
  });
  test('calcium PRI: 1000 mg/d (18-24), 950 mg/d (25+)', () => {
    const young = POPULATION_REFERENCES.find(x => x.nutrient === 'calciumMg' && x.population.maxAgeYears === 24)!;
    const older = POPULATION_REFERENCES.find(x => x.nutrient === 'calciumMg' && x.population.minAgeYears === 25)!;
    assert.equal(young.value, 1000);
    assert.equal(older.value, 950);
  });
  test('vitamin D AI = 15 µg/d, unisex', () => {
    const r = POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminDUg')!;
    assert.equal(r.value, 15); assert.equal(r.population.sex, null);
  });
  test('folate PRI = 330 µg/d, unisex', () => {
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'folateB9Ug')!.value, 330);
  });
  test('B12 PRI = 4.0 µg/d, unisex', () => {
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminB12Ug')!.value, 4.0);
  });
  test('vitamin A PRI: male 750, female 650 µg/d', () => {
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminAUg' && x.population.sex === 'male')!.value, 750);
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminAUg' && x.population.sex === 'female')!.value, 650);
  });
  test('vitamin C PRI: male 110, female 95 mg/d', () => {
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminCMg' && x.population.sex === 'male')!.value, 110);
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'vitaminCMg' && x.population.sex === 'female')!.value, 95);
  });
  test('magnesium PRI: male 350, female 300 mg/d', () => {
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'magnesiumMg' && x.population.sex === 'male')!.value, 350);
    assert.equal(POPULATION_REFERENCES.find(x => x.nutrient === 'magnesiumMg' && x.population.sex === 'female')!.value, 300);
  });
});

describe('SOURCES registry', () => {
  test('efsaDrv and issnProtein are both present and well-formed', () => {
    assert.ok(SOURCES.efsaDrv.url.startsWith('https://'));
    assert.ok(SOURCES.issnProtein.url.startsWith('https://'));
  });
});
