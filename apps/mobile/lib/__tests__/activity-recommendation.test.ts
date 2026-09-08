import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfessionalSupport, isSupportedActivity, matchesExistingSession, selectExistingSessionMatch, findReusableSuggestedSession,
  classifyActivityStrategy, isValidSuggestedSession, SUPPORTED_ACTIVITY_KEYS, classifyRunSlot, needsExperienceHeal,
  type HumanSupportInsightLike,
} from '../activity-recommendation.ts';
import type { HumanSupportSignal } from '../human-support-types.ts';
import type { NormalizedActivityKey } from '../fulfilment.ts';

function signal(overrides: Partial<HumanSupportSignal> = {}): HumanSupportSignal {
  return { trigger: 'PROGRESS_PLATEAU', severity: 'RECOMMENDED', reason: 'x', evidence: {}, ...overrides };
}

describe('buildProfessionalSupport', () => {
  test('no primary signal -> no professional support section at all', () => {
    const insight: HumanSupportInsightLike = { primary: null, trainerOwned: false, ptRecommendations: [] };
    assert.equal(buildProfessionalSupport(insight), undefined);
    assert.equal(buildProfessionalSupport(null), undefined);
  });

  test('beginner opportunity -> OPTIONAL_SUPPORT, still carries PT matches', () => {
    const trainers = [{ id: 't1', name: 'George', matchReasons: ['Strength'], score: 1, navigationTarget: { pathname: '/trainer-profile', params: { id: 't1' } } }];
    const insight: HumanSupportInsightLike = { primary: signal({ trigger: 'BEGINNER_TECHNIQUE_SUPPORT', severity: 'INFO' }), trainerOwned: false, ptRecommendations: trainers };
    const result = buildProfessionalSupport(insight);
    assert.equal(result?.mode, 'OPTIONAL_SUPPORT');
    assert.equal(result?.trainers, trainers);
  });

  test('evidence-driven signal (plateau/difficulty/adherence) -> HUMAN_SUPPORT_TRIGGER with the real reason, not generic copy', () => {
    const insight: HumanSupportInsightLike = { primary: signal({ trigger: 'PROGRESS_PLATEAU', reason: "You've been consistent, but your strength has stayed stable." }), trainerOwned: false, ptRecommendations: [] };
    const result = buildProfessionalSupport(insight);
    assert.equal(result?.mode, 'HUMAN_SUPPORT_TRIGGER');
    assert.equal(result?.reason, "You've been consistent, but your strength has stayed stable.");
  });

  test('trainer-owned -> CURRENT_TRAINER_REVIEW, never a trainer list (no replacement offered)', () => {
    const trainers = [{ id: 't1', name: 'George', matchReasons: [], score: 1, navigationTarget: { pathname: '/trainer-profile', params: {} } }];
    const insight: HumanSupportInsightLike = { primary: signal({ trigger: 'TRAINER_REVIEW_RECOMMENDED' }), trainerOwned: true, ptRecommendations: trainers };
    const result = buildProfessionalSupport(insight);
    assert.equal(result?.mode, 'CURRENT_TRAINER_REVIEW');
    assert.equal(result?.trainers, undefined);
  });

  test('pain -> non-diagnostic wording preserved verbatim, never overridden with generic copy', () => {
    const insight: HumanSupportInsightLike = {
      primary: signal({ trigger: 'PAIN_REPORTED', severity: 'HIGH', reason: "You reported pain or discomfort during training. ACP won't increase your training automatically. Consider getting appropriate professional guidance before progressing." }),
      trainerOwned: false, ptRecommendations: [],
    };
    const result = buildProfessionalSupport(insight);
    assert.equal(result?.mode, 'HUMAN_SUPPORT_TRIGGER');
    assert.match(result!.reason, /won't increase your training automatically/);
    assert.doesNotMatch(result!.reason, /injur|diagnos|treat/i);
  });
});

// Generalization task (section 30) — the activity-agnostic routing rules
// factored out into pure functions so "does an existing session satisfy
// this activity" and "should a same-day suggested session be reused" are
// independently testable without mocking Supabase.
describe('isSupportedActivity', () => {
  test('gym/mobility/running/walking are ACP-generatable; everything else is not', () => {
    assert.deepEqual(SUPPORTED_ACTIVITY_KEYS.sort(), ['gym', 'mobility', 'running', 'walking'].sort());
    for (const key of ['yoga', 'football', 'swimming', 'boxing', 'cycling', 'other'] as const) {
      assert.equal(isSupportedActivity(key), false, `${key} should not be supported`);
    }
  });
});

describe('matchesExistingSession', () => {
  test('gym: matches the generator\'s own full_body_a/b workout_type structurally', () => {
    assert.equal(matchesExistingSession({ title: 'Full Body A', description: null, workout_type: 'full_body_a' }, 'gym'), true);
    assert.equal(matchesExistingSession({ title: 'Full Body B', description: null, workout_type: 'full_body_b' }, 'gym'), true);
  });

  test('running: matches run_easy/run_intervals structurally even though the title says nothing about running', () => {
    assert.equal(matchesExistingSession({ title: 'Easy Run', description: 'conversational pace', workout_type: 'run_easy' }, 'running'), true);
    assert.equal(matchesExistingSession({ title: 'Interval Run', description: null, workout_type: 'run_intervals' }, 'running'), true);
  });

  test('a trainer-created, untyped workout falls back to text-keyword matching', () => {
    assert.equal(matchesExistingSession({ title: 'Strength Circuit', description: null, workout_type: null }, 'gym'), true);
    assert.equal(matchesExistingSession({ title: 'Brisk Walk', description: 'comfortable pace', workout_type: null }, 'walking'), true);
    assert.equal(matchesExistingSession({ title: 'Hip Mobility Flow', description: null, workout_type: null }, 'mobility'), true);
  });

  test('does not cross-match an unrelated activity', () => {
    assert.equal(matchesExistingSession({ title: 'Full Body A', description: null, workout_type: 'full_body_a' }, 'running'), false);
    assert.equal(matchesExistingSession({ title: 'Yoga Flow', description: null, workout_type: null }, 'gym'), false);
  });
});

// Workout Prescription durable fix — Lana Intelligence precedence over the
// legacy System-1 generic full_body_a/full_body_b programme generator.
describe('matchesExistingSession — allowLegacyGenericMatch (Lana precedence, Test D — no fallback leakage)', () => {
  test('default (omitted opts) preserves the original structural match, unchanged', () => {
    assert.equal(matchesExistingSession({ title: 'Full Body A', description: null, workout_type: 'full_body_a' }, 'gym'), true);
    assert.equal(matchesExistingSession({ title: 'Full Body B', description: null, workout_type: 'full_body_b' }, 'gym'), true);
  });

  test('allowLegacyGenericMatch: false suppresses the structural full_body_a/b match', () => {
    assert.equal(matchesExistingSession({ title: 'Full Body A', description: null, workout_type: 'full_body_a' }, 'gym', { allowLegacyGenericMatch: false }), false);
    assert.equal(matchesExistingSession({ title: 'Full Body B', description: null, workout_type: 'full_body_b' }, 'gym', { allowLegacyGenericMatch: false }), false);
  });

  test('a valid Lana activity resolution can never land on workout_type full_body_a or full_body_b (Test D invariant)', () => {
    for (const workout_type of ['full_body_a', 'full_body_b']) {
      assert.equal(
        matchesExistingSession({ title: workout_type === 'full_body_a' ? 'Full Body A' : 'Full Body B', description: null, workout_type }, 'gym', { allowLegacyGenericMatch: false }),
        false,
        `${workout_type} must never match when a Lana weekly activity exists`,
      );
    }
  });

  test('genuinely custom/trainer-authored content still matches via the text-keyword fallback, even with allowLegacyGenericMatch: false — trainer ownership is unaffected', () => {
    assert.equal(matchesExistingSession({ title: 'Coach Assigned Strength', description: null, workout_type: null }, 'gym', { allowLegacyGenericMatch: false }), true);
    assert.equal(matchesExistingSession({ title: 'Strength Circuit', description: null, workout_type: 'full_body_a' }, 'gym', { allowLegacyGenericMatch: false }), true); // title keyword-matches independent of the (now-suppressed) structural branch
  });

  test('run_easy/run_intervals structural matching is untouched — this fix targets only the generic strength types', () => {
    assert.equal(matchesExistingSession({ title: 'Easy Run', description: null, workout_type: 'run_easy' }, 'running', { allowLegacyGenericMatch: false }), true);
  });
});

describe('selectExistingSessionMatch — the Richard collision, at the selection layer (Test A/D)', () => {
  const richardLegacyCandidates = [
    { id: 'legacy-full-body-a', title: 'Full Body A', description: null, workout_type: 'full_body_a' },
    { id: 'legacy-full-body-b', title: 'Full Body B', description: null, workout_type: 'full_body_b' },
  ];

  test('BEFORE the fix (allowLegacyGenericMatch left at its default true) — every one of 3 distinct activities collides on the same legacy row, reproducing the production bug', () => {
    const monday = selectExistingSessionMatch(richardLegacyCandidates, 'gym');
    const wednesday = selectExistingSessionMatch(richardLegacyCandidates, 'gym');
    const friday = selectExistingSessionMatch(richardLegacyCandidates, 'gym');
    assert.ok(monday);
    // The bug: identical selection for every distinct activity, because
    // nothing here can tell them apart.
    assert.equal(monday!.id, wednesday!.id);
    assert.equal(monday!.id, friday!.id);
  });

  test('AFTER the fix (allowLegacyGenericMatch: false, the real call-site behaviour) — none of the 3 activities resolve to the legacy row at all', () => {
    const opts = { allowLegacyGenericMatch: false };
    const monday = selectExistingSessionMatch(richardLegacyCandidates, 'gym', opts);
    const wednesday = selectExistingSessionMatch(richardLegacyCandidates, 'gym', opts);
    const friday = selectExistingSessionMatch(richardLegacyCandidates, 'gym', opts);
    assert.equal(monday, undefined);
    assert.equal(wednesday, undefined);
    assert.equal(friday, undefined);
    // Falling through to undefined is exactly what makes
    // getActivityRecommendation proceed to System 2's structure-aware
    // classifyStrengthStructure/fitStrengthSessionForStructure path.
  });

  test('a genuine trainer-owned session (untyped, real title) is still found and still wins — precedence for real human coaching is preserved', () => {
    const candidates = [
      ...richardLegacyCandidates,
      { id: 'trainer-row', title: 'Coach Assigned Strength', description: null, workout_type: null },
    ];
    const match = selectExistingSessionMatch(candidates, 'gym', { allowLegacyGenericMatch: false });
    assert.equal(match?.id, 'trainer-row');
  });

  test('empty candidate list (no legacy programme at all) — no match, no error', () => {
    assert.equal(selectExistingSessionMatch([], 'gym', { allowLegacyGenericMatch: false }), undefined);
  });
});

describe('findReusableSuggestedSession — idempotency (section 13/32)', () => {
  const now = new Date('2026-08-28T18:00:00');

  test('a session created earlier today is reused, regardless of completion state (completion is not tracked here — caller never even fetches it as a separate signal)', () => {
    const sessions = [{ id: 's1', title: 'Full-body strength', createdAt: '2026-08-28T07:15:00' }];
    assert.deepEqual(findReusableSuggestedSession(sessions, now), sessions[0]);
  });

  test('a session from a prior day never blocks a fresh generation today', () => {
    const sessions = [{ id: 's1', title: 'Full-body strength', createdAt: '2026-08-27T07:15:00' }];
    assert.equal(findReusableSuggestedSession(sessions, now), undefined);
  });

  test('picks the same-day row even when it is not first in the list', () => {
    const sessions = [
      { id: 'old', title: 'x', createdAt: '2026-08-20T07:15:00' },
      { id: 'today', title: 'y', createdAt: '2026-08-28T05:00:00' },
    ];
    assert.equal(findReusableSuggestedSession(sessions, now)?.id, 'today');
  });

  test('an empty list has nothing to reuse', () => {
    assert.equal(findReusableSuggestedSession([], now), undefined);
  });
});

// Chunk 4 (section 28) — every NormalizedActivityKey the repo actually
// produces (lib/fulfilment.ts's normalizeActivity) must map to exactly one
// execution strategy. This is what my-plan.tsx/weekly-plan.tsx/
// (tabs)/index.tsx ultimately rely on via getActivityRecommendation to
// decide "generate a concrete session" vs "leave the existing fulfilment
// route alone" — covering every key here means a newly-added activity can
// never silently fall through un-classified.
describe('classifyActivityStrategy — every real activity taxonomy value', () => {
  const EXPECTED: Record<NormalizedActivityKey, ReturnType<typeof classifyActivityStrategy>> = {
    gym: 'EXERCISE_SESSION',
    mobility: 'EXERCISE_SESSION',
    running: 'ACTIVITY_BLOCK',
    walking: 'ACTIVITY_BLOCK',
    cycling: 'GENERIC_FALLBACK',
    yoga: 'GENERIC_FALLBACK',
    football: 'GENERIC_FALLBACK',
    swimming: 'GENERIC_FALLBACK',
    boxing: 'GENERIC_FALLBACK',
    other: 'GENERIC_FALLBACK',
  };

  for (const [key, expected] of Object.entries(EXPECTED) as [NormalizedActivityKey, string][]) {
    test(`${key} -> ${expected}`, () => {
      assert.equal(classifyActivityStrategy(key), expected);
    });
  }

  test('every strategy-classified-as-supported key matches isSupportedActivity, and only those', () => {
    for (const key of Object.keys(EXPECTED) as NormalizedActivityKey[]) {
      const supported = classifyActivityStrategy(key) !== 'GENERIC_FALLBACK';
      assert.equal(isSupportedActivity(key), supported, `mismatch for ${key}`);
    }
  });
});

// Chunk 4 (section 33) — matchesExistingSession is deliberately
// ownership-agnostic (it never reads ProgrammeSource at all), so a
// TRAINER_CREATED or TRAINER_MODIFIED workout matches identically to an
// ACP_GENERATED one — this is what gives trainer-owned sessions precedence
// with zero special-casing. Covering Strength, Running, and Mobility here
// per section 33's "at least Strength, Running, one additional category".
describe('matchesExistingSession — trainer ownership never affects matching (section 23/33)', () => {
  test('a TRAINER_CREATED-style strength workout (structural workout_type, no ownership field involved) matches gym', () => {
    assert.equal(matchesExistingSession({ title: 'Coach Assigned Strength', description: null, workout_type: 'full_body_a' }, 'gym'), true);
  });

  test('a TRAINER_MODIFIED-style running workout (structural workout_type) matches running', () => {
    assert.equal(matchesExistingSession({ title: 'Race Prep Run', description: null, workout_type: 'run_intervals' }, 'running'), true);
  });

  test('a trainer-titled, untyped mobility session matches via the same text-fallback a member\'s own would', () => {
    assert.equal(matchesExistingSession({ title: 'Recovery Mobility Flow', description: null, workout_type: null }, 'mobility'), true);
  });
});

// Chunk 4.5A — an atomically-claimed workouts row can exist yet still not be
// a genuinely reusable session if exercise generation/persistence failed or
// never ran. isValidSuggestedSession is the one predicate that decides
// whether a same-day row is safe to return as a successful recommendation.
describe('isValidSuggestedSession', () => {
  test('strength (exercise_workout) with persisted exercises is valid', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: false, exerciseCount: 4 }), true);
  });

  test('strength (exercise_workout) with zero exercises is invalid — generation failed/never finished', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: false, exerciseCount: 0 }), false);
  });

  test('strength with an undefined exerciseCount (never counted) is treated as invalid, not silently trusted', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: false, exerciseCount: undefined }), false);
  });

  test('mobility (exercise_workout) with persisted movements is valid', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: false, exerciseCount: 3 }), true);
  });

  test('mobility (exercise_workout) with zero movements is invalid', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: false, exerciseCount: 0 }), false);
  });

  test('running (activity_block) is valid with zero exercises — exercises never apply to it', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: true, exerciseCount: 0 }), true);
  });

  test('walking (activity_block) is valid even with exerciseCount undefined (never computed for activity blocks)', () => {
    assert.equal(isValidSuggestedSession({ isActivityBlock: true, exerciseCount: undefined }), true);
  });
});

// ── Beta Feedback #006 — run-type fidelity ────────────────────────────────
describe('classifyRunSlot (Beta #006)', () => {
  test('a prescribed interval / speed session maps to run_intervals', () => {
    for (const a of [
      { activity: 'Run intervals', title: 'Run intervals', description: '5–6 × 1–2 minute faster efforts with easy jog recoveries.' },
      { activity: 'Interval run', title: 'Interval run', description: '' },
      { activity: 'Tempo run', title: 'Tempo run', description: '' },
      { activity: 'Fartlek session', title: '', description: '' },
      { activity: 'Run', title: 'Speed work', description: 'hill repeats' },
      { activity: 'Threshold run', title: '', description: '' },
    ]) {
      assert.equal(classifyRunSlot(a), 'run_intervals', JSON.stringify(a));
    }
  });

  test('easy / steady / long / recovery / run-walk all read as continuous (run_easy)', () => {
    for (const a of [
      { activity: 'Easy run', title: 'Easy run', description: 'Conversational pace for 25 minutes.' },
      { activity: 'Steady run', title: 'Steady run', description: '' },
      { activity: 'Long run', title: 'Long run', description: '45–60 minutes at an easy effort.' },
      { activity: 'Recovery jog', title: '', description: '' },
      { activity: 'Run/walk', title: 'Run/walk', description: 'Alternate 2 min jog, 1 min walk.' },
      { activity: 'Run', title: 'Your run', description: '' },
    ]) {
      assert.equal(classifyRunSlot(a), 'run_easy', JSON.stringify(a));
    }
  });

  test('the keyword can appear in any of activity / title / description', () => {
    assert.equal(classifyRunSlot({ description: 'interval session' }), 'run_intervals');
    assert.equal(classifyRunSlot({ title: 'Intervals' }), 'run_intervals');
    assert.equal(classifyRunSlot({ activity: null, title: null, description: null }), 'run_easy');
  });
});

// ── Beta Feedback #007 — experience-label fidelity ────────────────────────
describe('needsExperienceHeal (Beta #007)', () => {
  test('A/C — a persisted row difficulty that disagrees with the canonical profile experience is healed', () => {
    assert.equal(needsExperienceHeal('beginner', 'advanced'), true);   // the reported bug
    assert.equal(needsExperienceHeal('advanced', 'beginner'), true);
    assert.equal(needsExperienceHeal('intermediate', 'advanced'), true);
  });

  test('B — a row that already matches the canonical experience is left untouched', () => {
    assert.equal(needsExperienceHeal('advanced', 'advanced'), false);
    assert.equal(needsExperienceHeal('beginner', 'beginner'), false);
  });

  test('D — never heals from a missing/blank row difficulty or a missing canonical experience (no silent "beginner" flip)', () => {
    assert.equal(needsExperienceHeal(null, 'advanced'), false);
    assert.equal(needsExperienceHeal(undefined, 'advanced'), false);
    assert.equal(needsExperienceHeal('', 'advanced'), false);
    assert.equal(needsExperienceHeal('beginner', null), false);
    assert.equal(needsExperienceHeal('beginner', undefined), false);
  });
});
