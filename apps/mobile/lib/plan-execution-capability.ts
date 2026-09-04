// ACP Intelligence™ — Beta #017 §12B/§13.
//
// A canonical plan activity can describe a shape the workout player /
// activity-block model cannot actually execute. The planner (and the LLM
// behind it) must not persist an execution promise ACP can't fulfil — so
// deterministic validation strips / rewrites the unsupported part BEFORE
// generation, rather than leaving a half-model (a 60-min label over 47 min
// of real content).
//
// Pure lib — relative imports only, unit-tested under `node --test`.
import { titleImpliesConditioning } from './programme-generator.ts';

export type ExecutableFeature =
  | 'strength_structure' // full_body / upper / lower — workout_exercises + player
  | 'support'            // #013/#014 — same machinery, lighter base
  | 'mobility'           // MOBILITY_REQUIREMENTS + player
  | 'run_block'          // is_activity_block cardio + player
  | 'walk_block'
  | 'conditioning_block'; // §9 — DETECTED but NOT executable: no timed-circuit /
                          //      interval-of-movements construct exists yet.

const EXECUTABLE: Record<ExecutableFeature, boolean> = {
  strength_structure: true,
  support: true,
  mobility: true,
  run_block: true,
  walk_block: true,
  conditioning_block: false,
};

export function isExecutableFeature(f: ExecutableFeature): boolean {
  return EXECUTABLE[f];
}

/**
 * Deterministic plan→execution sanitiser for a strength activity. Beta #016's
 * `titleImpliesConditioning` can DETECT a conditioning tail; the execution
 * layer has no way to run one. Rather than a 60-min label over ~47 min of
 * content (or #016 §8's honest-but-short session), strip the unfulfillable
 * conditioning clause from the persisted title/description so the activity
 * generates as an ordinary strength session — #015B then fills its window
 * truthfully, #016 keeps it unique. The removal is surfaced by the caller
 * (`strippedConditioning`), never silent.
 */
const CONDITIONING_CLAUSE_RE =
  /[\s,;–—-]*(?:\+|&|and|plus|with|then|finish(?:ing)?\s+with|followed by)?\s*(?:a\s+)?(?:short\s+|quick\s+|brief\s+|light\s+|optional\s+)?(?:conditioning|metcon|finisher|circuit|interval(?:s)?(?:\s*(?:work|training|block))?|amrap|emom|wod)(?:\s+(?:block|work|finisher|piece|session))?\s*\.?\s*$/i;

export function sanitizeStrengthActivity<T extends { title?: string | null; description?: string | null }>(
  activity: T,
): { activity: T; strippedConditioning: boolean } {
  if (isExecutableFeature('conditioning_block') || !titleImpliesConditioning(activity.title, activity.description)) {
    return { activity, strippedConditioning: false };
  }
  const strip = (s?: string | null): string => {
    let out = (s ?? '').replace(CONDITIONING_CLAUSE_RE, '');
    // A mid-sentence mention ("... then a short conditioning finisher.")
    // that the trailing-clause regex missed — drop the sentence fragment.
    if (titleImpliesConditioning(out, '')) {
      out = out.replace(/[^.]*\b(conditioning|metcon|finisher|circuit|intervals?|amrap|emom|wod)\b[^.]*\.?/i, '');
    }
    return out.replace(/\s{2,}/g, ' ').replace(/[\s,;+&-]+$/, '').trim();
  };
  const title = strip(activity.title);
  return {
    activity: { ...activity, title: title || (activity.title ?? ''), description: strip(activity.description) },
    strippedConditioning: true,
  };
}
