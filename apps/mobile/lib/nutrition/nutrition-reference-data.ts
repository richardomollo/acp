// ACP Intelligence™ — Nutrition N3. Static, versioned, source-attributed
// nutrition REFERENCE data (§5/§6/§32).
//
// This file is the ONLY place nutrition reference numbers are defined. Every
// row carries: which nutrient, what kind of reference it is, its numeric
// value(s), the population it applies to, and full source provenance. No
// number in this file is invented — each is transcribed from the cited
// publication (see SOURCES below) and is source-year-stamped so a future
// refresh is auditable.
//
// N3 explicitly separates three concepts (§4) — do not blur them:
//   • POPULATION_REFERENCES        — EFSA Dietary Reference Values: population-
//     level intakes for an (age, sex) group. Not personalised beyond that.
//   • PROTEIN_PERFORMANCE_REFERENCE — a weight-based g/kg/day RANGE from a
//     sport-nutrition consensus source, resolved against the user's own
//     current body weight. This is the one "personalised performance target"
//     N3 supports (§8).
//   • Energy is explicitly NOT modelled here — see the Energy Decision Gate
//     in the N3 completion report. No BMR/TDEE numbers exist in this file.

export interface ReferenceSource {
  organisation: string;
  document: string;
  /** How the cited body itself classifies the value. */
  sourceType: 'PRI' | 'AI' | 'AR' | 'consensus_range';
  url: string;
  year: number;
}

export const SOURCES = {
  efsaDrv: {
    organisation: 'European Food Safety Authority (EFSA)',
    document: 'Summary of Dietary Reference Values — version 4 (NDA Panel)',
    sourceType: 'PRI' as const, // per-nutrient override below where the row is actually an AI
    url: 'https://www.efsa.europa.eu/sites/default/files/assets/DRV_Summary_tables_jan_17.pdf',
    year: 2017,
  },
  issnProtein: {
    organisation: 'International Society of Sports Nutrition (ISSN)',
    document: 'ISSN Position Stand: Protein and Exercise (Jäger et al.)',
    sourceType: 'consensus_range' as const,
    url: 'https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8',
    year: 2017,
  },
} satisfies Record<string, ReferenceSource>;

/** The nutrients N3 supports a reference for. A strict subset of N2's NUTRIENT_KEYS. */
export type NutrientRefKey =
  | 'proteinG' | 'fibreG'
  | 'potassiumMg' | 'calciumMg' | 'ironMg' | 'magnesiumMg'
  | 'vitaminAUg' | 'vitaminCMg' | 'vitaminDUg' | 'folateB9Ug' | 'vitaminB12Ug';

export const NUTRIENT_REF_KEYS: readonly NutrientRefKey[] = [
  'proteinG', 'fibreG', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg',
  'vitaminAUg', 'vitaminCMg', 'vitaminDUg', 'folateB9Ug', 'vitaminB12Ug',
];

/** §4: a reference is either a population-level DRV, or a personalised weight-based range. */
export type ReferenceKind = 'population_reference' | 'personalised_performance_target';

/** §6: exact single value (a floor, e.g. an AI/PRI) vs a min–max range. */
export type ReferenceValueShape =
  | { referenceType: 'exact'; value: number }
  | { referenceType: 'range'; min: number; max: number };

export type Sex = 'male' | 'female';

export interface PopulationCriteria {
  minAgeYears: number;
  maxAgeYears?: number;
  /** null = applies regardless of sex (the reference itself does not differ by sex). */
  sex: Sex | null;
}

export interface NutritionReferenceRow {
  nutrient: NutrientRefKey;
  kind: ReferenceKind;
  unit: 'g' | 'mg' | 'µg' | 'g_per_kg';
  population: PopulationCriteria;
  source: ReferenceSource;
  /** Set when this (nutrient, population) combination is deliberately withheld — e.g.
   *  the source's own reference depends on context ACP does not capture. The row still
   *  documents the source so the gap is auditable, but the engine must never resolve it. */
  unsupportedReason?: string;
  notes?: string;
}
export type NutritionReferenceDefinition = NutritionReferenceRow & ReferenceValueShape;

// ─────────────────────────────────────────────────────────────────────────
// POPULATION REFERENCES — EFSA Dietary Reference Values, adults ≥18y.
// Every value below is transcribed verbatim from SOURCES.efsaDrv (2017),
// "≥18" age band. EFSA gives no further adult age split for these nutrients
// (pregnancy/lactation excluded — ACP has no such state, see N3 report §26).
// ─────────────────────────────────────────────────────────────────────────
const efsaAI = (over: Partial<ReferenceSource> = {}) => ({ ...SOURCES.efsaDrv, sourceType: 'AI' as const, ...over });
const efsaPRI = (over: Partial<ReferenceSource> = {}) => ({ ...SOURCES.efsaDrv, sourceType: 'PRI' as const, ...over });

export const POPULATION_REFERENCES: readonly NutritionReferenceDefinition[] = [
  // Fibre — AI, unisex, ≥18y = 25 g/d (EFSA Table 3).
  {
    nutrient: 'fibreG', kind: 'population_reference', referenceType: 'exact', value: 25, unit: 'g',
    population: { minAgeYears: 18, sex: null }, source: efsaAI(),
    notes: 'Adequate Intake (AI), same for adult men and women.',
  },
  // Potassium — PRI, unisex ≥18y = 3500 mg/d (EFSA Table 5 & 7, identical for M/F).
  {
    nutrient: 'potassiumMg', kind: 'population_reference', referenceType: 'exact', value: 3500, unit: 'mg',
    population: { minAgeYears: 18, sex: null }, source: efsaPRI(),
  },
  // Calcium — PRI, unisex, 18–24y = 1000 mg/d; ≥25y = 950 mg/d (identical for M/F).
  {
    nutrient: 'calciumMg', kind: 'population_reference', referenceType: 'exact', value: 1000, unit: 'mg',
    population: { minAgeYears: 18, maxAgeYears: 24, sex: null }, source: efsaPRI(),
  },
  {
    nutrient: 'calciumMg', kind: 'population_reference', referenceType: 'exact', value: 950, unit: 'mg',
    population: { minAgeYears: 25, sex: null }, source: efsaPRI(),
  },
  // Iron — PRI, males ≥18y = 11 mg/d.
  {
    nutrient: 'ironMg', kind: 'population_reference', referenceType: 'exact', value: 11, unit: 'mg',
    population: { minAgeYears: 18, sex: 'male' }, source: efsaPRI(),
  },
  // Iron — females: EFSA sets 16 mg/d pre-menopausal vs 11 mg/d post-menopausal, a
  // physiological state ACP does not capture (no menopause field). Applying either
  // value without that context would be a guess (N3 §7/§25), so this is withheld.
  {
    nutrient: 'ironMg', kind: 'population_reference', referenceType: 'exact', value: 16, unit: 'mg',
    population: { minAgeYears: 18, sex: 'female' }, source: efsaPRI(),
    unsupportedReason: 'EFSA’s iron reference for women depends on menopausal status (16 mg/d pre-menopausal vs 11 mg/d post-menopausal), which Lana does not currently capture.',
  },
  // Magnesium — PRI, males ≥18y = 350 mg/d; females ≥18y = 300 mg/d.
  {
    nutrient: 'magnesiumMg', kind: 'population_reference', referenceType: 'exact', value: 350, unit: 'mg',
    population: { minAgeYears: 18, sex: 'male' }, source: efsaPRI(),
  },
  {
    nutrient: 'magnesiumMg', kind: 'population_reference', referenceType: 'exact', value: 300, unit: 'mg',
    population: { minAgeYears: 18, sex: 'female' }, source: efsaPRI(),
  },
  // Vitamin A — PRI, males ≥18y = 750 µg RE/d; females ≥18y = 650 µg RE/d.
  {
    nutrient: 'vitaminAUg', kind: 'population_reference', referenceType: 'exact', value: 750, unit: 'µg',
    population: { minAgeYears: 18, sex: 'male' }, source: efsaPRI(),
    notes: 'Retinol equivalents (RE).',
  },
  {
    nutrient: 'vitaminAUg', kind: 'population_reference', referenceType: 'exact', value: 650, unit: 'µg',
    population: { minAgeYears: 18, sex: 'female' }, source: efsaPRI(),
    notes: 'Retinol equivalents (RE).',
  },
  // Vitamin C — PRI, males ≥18y = 110 mg/d; females ≥18y = 95 mg/d.
  {
    nutrient: 'vitaminCMg', kind: 'population_reference', referenceType: 'exact', value: 110, unit: 'mg',
    population: { minAgeYears: 18, sex: 'male' }, source: efsaPRI(),
  },
  {
    nutrient: 'vitaminCMg', kind: 'population_reference', referenceType: 'exact', value: 95, unit: 'mg',
    population: { minAgeYears: 18, sex: 'female' }, source: efsaPRI(),
  },
  // Vitamin D — AI, unisex ≥18y = 15 µg/d (assumes minimal cutaneous synthesis).
  {
    nutrient: 'vitaminDUg', kind: 'population_reference', referenceType: 'exact', value: 15, unit: 'µg',
    population: { minAgeYears: 18, sex: null }, source: efsaAI(),
    notes: 'Assumes minimal cutaneous (sun-driven) synthesis, per EFSA.',
  },
  // Folate — PRI, unisex ≥18y = 330 µg DFE/d.
  {
    nutrient: 'folateB9Ug', kind: 'population_reference', referenceType: 'exact', value: 330, unit: 'µg',
    population: { minAgeYears: 18, sex: null }, source: efsaPRI(),
    notes: 'Dietary Folate Equivalents (DFE).',
  },
  // Vitamin B12 (cobalamin) — PRI, unisex ≥18y = 4.0 µg/d.
  {
    nutrient: 'vitaminB12Ug', kind: 'population_reference', referenceType: 'exact', value: 4.0, unit: 'µg',
    population: { minAgeYears: 18, sex: null }, source: efsaPRI(),
  },
];

// Zinc is deliberately NOT included: EFSA's zinc PRI depends on the level of
// dietary phytate intake (a 4-tier scale ACP has no way to estimate from
// logged foods), so no single defensible reference value exists without an
// unstated assumption. Deferred rather than guessed (N3 report §L).

// ─────────────────────────────────────────────────────────────────────────
// PROTEIN — personalised performance target (§8). A weight-based RANGE from
// the ISSN Position Stand's general recommendation for exercising adults
// (building/maintaining muscle mass): 1.4–2.0 g protein/kg body weight/day.
// Applied uniformly across ACP's goal categories: the ISSN consensus does not
// differentiate this general range by goal, so no goal→number mapping is
// invented (N3 §8 explicitly warns against inventing goal mappings).
// ─────────────────────────────────────────────────────────────────────────
export const PROTEIN_PERFORMANCE_REFERENCE: NutritionReferenceDefinition = {
  nutrient: 'proteinG', kind: 'personalised_performance_target',
  referenceType: 'range', min: 1.4, max: 2.0, unit: 'g_per_kg',
  population: { minAgeYears: 18, sex: null },
  source: SOURCES.issnProtein,
  notes: 'General range for exercising adults building/maintaining muscle mass. Resolved against current body weight.',
};
