// ACP Intelligence™ Day 7.2 — deterministic, conservative goal-fit scoring
// for meal ranking (section 19-22, 53-57). Pure, framework-free. Uses only
// the macro/fibre fields the real `meals` table actually has — no invented
// precision, no medical claims, no causal language encoded anywhere (a meal
// is described as "goal-supportive"/"balanced", never "will build muscle").
//
// Deliberately conservative: no goal ever reduces to a single extreme
// (section 20) — lose_weight is NOT "lowest calories wins" (section 54),
// build_muscle is NOT "every meal must be high-protein" (section 53).
export interface GoalFitMeal {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g?: number | null;
}

export interface GoalFitBreakdown {
  proteinSignal: number; // 0 | 0.5 | 1
  fibreSignal: number;   // 0 | 0.5 | 1
  balanceSignal: number; // 0 | 0.5 | 1 — no single macro dominates the meal's energy
  overall: number;       // 0..1, goal-weighted combination of the above
}

// Simple bands, not medical thresholds (section 21's "prefer simple
// bands/weights" over pseudo-scientific precision).
const HIGH_PROTEIN_G = 20;
const MODERATE_PROTEIN_G = 10;
const HIGH_FIBRE_G = 5;
const MODERATE_FIBRE_G = 2;

function proteinSignal(meal: GoalFitMeal): number {
  if (meal.protein_g >= HIGH_PROTEIN_G) return 1;
  if (meal.protein_g >= MODERATE_PROTEIN_G) return 0.5;
  return 0;
}

function fibreSignal(meal: GoalFitMeal): number {
  const fibre = meal.fibre_g ?? 0;
  if (fibre >= HIGH_FIBRE_G) return 1;
  if (fibre >= MODERATE_FIBRE_G) return 0.5;
  return 0;
}

// A meal where one macro supplies the large majority of total energy reads
// as unbalanced (e.g. an almost-pure-fat or almost-pure-sugar dish) —
// generously tolerant (75%) since many legitimate whole meals lean toward
// one macro without being unbalanced in any meaningful sense.
function balanceSignal(meal: GoalFitMeal): number {
  const proteinKcal = meal.protein_g * 4;
  const carbKcal = meal.carbs_g * 4;
  const fatKcal = meal.fat_g * 9;
  const macroKcal = proteinKcal + carbKcal + fatKcal;
  if (macroKcal <= 0) return 0.5; // no usable macro data — neutral, never penalised (section 73)
  const dominant = Math.max(proteinKcal, carbKcal, fatKcal) / macroKcal;
  return dominant < 0.75 ? 1 : 0.5;
}

/**
 * Every goal's formula stays a WEIGHTED BLEND of the same three signals —
 * never a single-signal cliff (section 20) — differing only in emphasis.
 * Unknown/unmapped goals fall back to the same balanced formula as
 * maintain_weight, matching section 56/57's "no unsupported claims" for
 * goals like reduce_stress that have no real nutrition-specific signal.
 */
export function scoreMealForGoal(meal: GoalFitMeal, goal: string | null | undefined): GoalFitBreakdown {
  const protein = proteinSignal(meal);
  const fibre = fibreSignal(meal);
  const balance = balanceSignal(meal);

  let overall: number;
  switch (goal) {
    case 'build_muscle':
    case 'body_recomposition':
      overall = 0.5 * protein + 0.2 * fibre + 0.3 * balance;
      break;
    case 'lose_weight':
      // NOT calorie-minimizing (section 54) — protein/fibre/balance only.
      overall = 0.35 * protein + 0.35 * fibre + 0.3 * balance;
      break;
    case 'maintain_weight':
    case 'general_fitness':
    case 'improve_mobility':
    case 'improve_running':
    case 'eat_healthier':
    case 'reduce_stress':
    default:
      overall = 0.25 * protein + 0.25 * fibre + 0.5 * balance;
      break;
  }

  return { proteinSignal: protein, fibreSignal: fibre, balanceSignal: balance, overall };
}
