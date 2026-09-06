// LANA PRO — Phase 6: human labels for raw consumer/DB codes.
//
// ONE shared implementation. Both the consent-aware aggregator and the
// pre-session brief route their `fitness_profile` reads through here so a code
// like `build_muscle` / `intermediate` never reaches rendered copy.
//
// Pure. Unit-tested with `node --test`.

/** consumer `fitness_profile.goal` is a closed code set. */
const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose weight',
  build_muscle: 'Build muscle',
  improve_mobility: 'Improve mobility',
  general_fitness: 'General fitness',
  maintain_weight: 'Maintain weight',
  eat_healthier: 'Eat healthier',
  improve_running: 'Improve running',
  improve_health: 'Improve health',
  healthy_lifestyle: 'Build a healthy lifestyle',
  body_recomposition: 'Body recomposition',
  reduce_stress: 'Reduce stress',
};

/** `code` → a readable phrase. Unknown / free-text input is prettified, never
 *  dropped. */
export function humanGoal(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (!c) return '';
  return GOAL_LABELS[c] ?? titleFromCode(c);
}

/** `beginner` → `Beginner`; `assigned_by` → `Assigned by`. Also used for
 *  activity / training-day chips. */
export function humaniseLevel(code: string | null | undefined): string {
  return titleFromCode(code ?? '');
}

function titleFromCode(v: string): string {
  const s = v.trim().replace(/[_-]+/g, ' ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** session-outcome codes (professional_session_records.client_response). */
export function clientResponseLabel(code: string | null | undefined): string | null {
  switch (code) {
    case 'great':
      return 'Great';
    case 'good':
      return 'Good';
    case 'difficult':
      return 'Difficult';
    default:
      return null;
  }
}

/** session-plan codes (professional_session_records.plan_intent). */
export function planIntentLabel(code: string | null | undefined): string | null {
  switch (code) {
    case 'progress':
      return 'Progress';
    case 'keep':
      return 'Keep similar';
    case 'adjust':
      return 'Adjust';
    default:
      return null;
  }
}
