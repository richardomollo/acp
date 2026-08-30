// ACP Intelligence™ Day 4 — optional professional-support matching.
//
// Secondary to plan tracking. Only ever invoked after the user explicitly
// taps "Explore support" (see my-plan.tsx) — provider data is never
// preloaded, never sent to OpenAI, and never influences what the plan or
// recommendation.approach already said. Matching is deterministic keyword
// overlap against real personal_trainers.specialisations data — no LLM, no
// embeddings, no invented signals.
//
// Nutrition classification reuses ACP's own existing convention (see
// apps/mobile/app/nutrition-hub.tsx's `hasNutritionist` check:
// `specialisations.includes('Nutrition')`) rather than inventing a new bar
// for "is this a qualified nutritionist" — that's the one classification
// this codebase already relies on elsewhere.
import type { PrimaryGoal, PreferredActivity } from './onboarding';

export interface ProfessionalProvider {
  id: string;
  name: string;
  specialisations: string[];
  photoUrl?: string | null;
}

export interface ProviderMatch {
  id: string;
  name: string;
  matchReasons: string[];
  score: number;
  navigationTarget: { pathname: string; params: Record<string, string> };
  photoUrl?: string | null;
}

// Keyword tables built from the real, live distinct personal_trainers
// .specialisations values (Weight Loss, Strength Training, HIIT, CrossFit,
// Swimming, Rehabilitation, Sports Performance, Nutrition, Functional
// Training, Running, Dance, Yoga, Martial Arts, Pilates) — not invented.
// Exported (Day 7.3) so the unified supply-orchestration layer can reuse
// the exact same, already-live keyword vocabulary for its own per-dimension
// provider scoring instead of duplicating it — see lib/supply/provider-candidates.ts.
export const GOAL_SPECIALISM_KEYWORDS: Partial<Record<PrimaryGoal, string[]>> = {
  lose_weight: ['weight loss', 'hiit', 'functional training'],
  build_muscle: ['strength training', 'functional training', 'sports performance'],
  maintain_weight: ['functional training', 'sports performance'],
  reduce_stress: ['yoga', 'pilates'],
};

export const ACTIVITY_SPECIALISM_KEYWORDS: Partial<Record<PreferredActivity, string[]>> = {
  gym: ['strength training', 'functional training', 'crossfit'],
  running: ['running', 'sports performance'],
  cycling: ['sports performance'],
  yoga: ['yoga'],
  swimming: ['swimming'],
  boxing: ['martial arts'],
  football: ['sports performance'],
};

/**
 * Marketplace matching fulfils an independently generated
 * ACP Intelligence™ plan.
 *
 * Commercial terms must never influence organic ranking. Nothing in
 * ProfessionalProvider carries a commission/revenue/sponsorship field — the
 * scorer below has nothing such to read even if it wanted to.
 *
 * `isNutritionRequest` takes an entirely separate path (exact-match on the
 * "Nutrition" specialism only) rather than sharing the goal/activity
 * scoring — nutrition support should never surface a provider who merely
 * has an unrelated specialism.
 */
export function matchProfessionalProviders(
  goal: PrimaryGoal | null,
  preferredActivities: PreferredActivity[],
  isNutritionRequest: boolean,
  providers: ProfessionalProvider[],
): ProviderMatch[] {
  const scored = providers
    .map(provider => {
      if (isNutritionRequest) {
        const hasNutrition = provider.specialisations.some(s => s.toLowerCase() === 'nutrition');
        return hasNutrition ? { provider, score: 1, reasons: ['Nutrition'] } : null;
      }

      const reasons = new Set<string>();
      let score = 0;
      const goalKeywords = goal ? (GOAL_SPECIALISM_KEYWORDS[goal] ?? []) : [];

      for (const spec of provider.specialisations) {
        const specLower = spec.toLowerCase();
        if (goalKeywords.includes(specLower)) { score += 1; reasons.add(spec); }
        for (const activity of preferredActivities) {
          if ((ACTIVITY_SPECIALISM_KEYWORDS[activity] ?? []).includes(specLower)) {
            score += 1;
            reasons.add(spec);
          }
        }
      }
      return score > 0 ? { provider, score, reasons: Array.from(reasons) } : null;
    })
    .filter((x): x is { provider: ProfessionalProvider; score: number; reasons: string[] } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Day 4 spec: max 3 — never a provider marketplace

  return scored.map(({ provider, score, reasons }) => ({
    id: provider.id,
    name: provider.name,
    matchReasons: reasons,
    score,
    navigationTarget: { pathname: '/trainer-profile', params: { id: provider.id } },
    photoUrl: provider.photoUrl ?? null,
  }));
}
