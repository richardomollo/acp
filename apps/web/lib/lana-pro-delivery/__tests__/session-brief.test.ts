import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfessionalSessionBrief,
  briefStrings,
  type SessionBriefInput,
} from '../session-brief.ts';
import { assertBriefBundleSafe } from '../copy-safety.ts';

const base = (over: Partial<SessionBriefInput> = {}): SessionBriefInput => ({
  clientFirstName: 'James Mwangi',
  serviceName: 'Strength coaching',
  professionalFlavour: 'training',
  consent: { relationshipStatus: 'active', shareProgress: true },
  ...over,
});

describe('§17.1 — first-ever session: no fake "since last time"', () => {
  test('no previousSession → no previous_session observation, state reflects what exists', () => {
    const b = buildProfessionalSessionBrief(base({ previousSession: null, openActions: [] }));
    assert.equal(b.observations.some((o) => o.kind === 'previous_session'), false);
    assert.equal(b.suggestedFocus, null); // nothing to anchor a "continue" suggestion to
  });

  test('brand new client, consent, zero evidence → insufficient_evidence but still an object', () => {
    const b = buildProfessionalSessionBrief(base({ previousSession: null }));
    assert.equal(b.state, 'insufficient_evidence');
    assert.deepEqual(b.observations, []);
  });
});

describe('§17.2 — returning client', () => {
  test('previous session focus + open actions surface, priority-ordered', () => {
    const b = buildProfessionalSessionBrief(
      base({
        previousSession: { focus: 'squat technique', completedAtDate: '2026-09-07' },
        openActions: [{ title: 'Two strength sessions' }, { title: 'Recovery Wednesday' }],
      }),
    );
    assert.equal(b.observations[0].kind, 'previous_session');
    assert.match(b.observations[0].text, /Last session on 2026-09-07 focused on squat technique\./);
    assert.equal(b.observations[1].kind, 'open_action');
    assert.match(b.observations[1].text, /2 actions from your previous session are still open\./);
    assert.match(b.suggestedFocus ?? '', /Consider continuing on squat technique/);
    assert.equal(b.state, 'evidence');
  });
});

describe('§17.3 / §21 — share_progress = false', () => {
  test('active but not sharing → no protected evidence, no_shared_progress state, still useful', () => {
    const b = buildProfessionalSessionBrief(
      base({
        consent: { relationshipStatus: 'active', shareProgress: false },
        previousSession: { focus: 'squat technique', completedAtDate: '2026-09-07' },
        openActions: [{ title: 'Recovery Wednesday' }],
        goal: { label: 'build strength' },
        workoutAdherence: { completed: 2, planned: 3, windowDays: 7 },
        recentWeightsKg: [80, 80.2, 79.9],
        activityCountThisWeek: 4,
      }),
    );
    assert.equal(b.state, 'no_shared_progress');
    assert.equal(b.progressWithheld, true);
    // previous session + open action remain (professional's own data)
    assert.deepEqual(b.observations.map((o) => o.kind), ['previous_session', 'open_action']);
    // NOTHING protected
    assert.equal(b.observations.some((o) => ['goal', 'progress', 'activity', 'nutrition', 'check_in'].includes(o.kind)), false);
  });
});

describe('§17.4 — share_progress = true + active: allowed evidence appears', () => {
  test('goal + adherence + weight + activity, capped at 4, priority order', () => {
    const b = buildProfessionalSessionBrief(
      base({
        previousSession: { focus: 'squat technique', completedAtDate: '2026-09-07' },
        openActions: [{ title: 'Recovery Wednesday' }],
        goal: { label: 'build strength' },
        workoutAdherence: { completed: 2, planned: 3, windowDays: 7 },
        recentWeightsKg: [80, 80.4, 79.8],
        activityCountThisWeek: 3,
        checkInCount: { count: 4, windowDays: 14 },
      }),
    );
    assert.equal(b.observations.length, 4);
    assert.deepEqual(b.observations.map((o) => o.kind), ['previous_session', 'open_action', 'goal', 'progress']);
    const progress = b.observations[3].text;
    assert.match(progress, /James completed 2 of 3 planned workouts this week\./);
  });

  test('weight stability language only when spread ≤ 1.5kg', () => {
    const stable = buildProfessionalSessionBrief(base({ recentWeightsKg: [80, 80.5, 79.7] }));
    assert.match(stable.observations.find((o) => o.kind === 'progress')!.text, /broadly stable/);
    const moved = buildProfessionalSessionBrief(base({ recentWeightsKg: [78, 79.5, 81] }));
    assert.match(moved.observations.find((o) => o.kind === 'progress')!.text, /lower than three measurements ago/);
  });
});

describe('§17.16-17 — no fabrication from missing data', () => {
  test('< 3 weights → no weight observation', () => {
    const b = buildProfessionalSessionBrief(base({ recentWeightsKg: [80, 80.1] }));
    assert.equal(b.observations.some((o) => o.provenance.source === 'measurement'), false);
  });
  test('planned = 0 → no adherence observation', () => {
    const b = buildProfessionalSessionBrief(base({ workoutAdherence: { completed: 0, planned: 0, windowDays: 7 } }));
    assert.equal(b.observations.some((o) => o.provenance.source === 'workout_adherence'), false);
  });
  test('activityCountThisWeek = 0 is stated factually, not as a judgement', () => {
    const b = buildProfessionalSessionBrief(base({ activityCountThisWeek: 0 }));
    const a = b.observations.find((o) => o.kind === 'activity')!;
    assert.match(a.text, /No completed activity has been logged so far this week\./);
  });
});

describe('§11 / §21 — professional flavour changes evidence, not authorization', () => {
  test('nutrition flavour surfaces nutrition evidence, not workout adherence copy style', () => {
    const b = buildProfessionalSessionBrief(
      base({
        professionalFlavour: 'nutrition',
        serviceName: 'Nutrition consultation',
        nutrition: { daysWithAnyLog: 6, windowDays: 7, breakfastDays: 5 },
        workoutAdherence: { completed: 2, planned: 3, windowDays: 7 },
      }),
    );
    assert.match(b.observations.find((o) => o.kind === 'nutrition')!.text, /Breakfast was logged on 5 of the last 7 days\./);
  });
  test('training flavour ignores nutrition input entirely', () => {
    const b = buildProfessionalSessionBrief(base({ nutrition: { daysWithAnyLog: 6, windowDays: 7 } }));
    assert.equal(b.observations.some((o) => o.kind === 'nutrition'), false);
  });
});

describe('§21 — inactive relationship blocks protected evidence', () => {
  test('inactive → no protected evidence even with shareProgress true', () => {
    const b = buildProfessionalSessionBrief(
      base({
        consent: { relationshipStatus: 'inactive', shareProgress: true },
        goal: { label: 'build strength' },
        workoutAdherence: { completed: 2, planned: 3, windowDays: 7 },
        previousSession: { focus: 'squat technique', completedAtDate: '2026-09-07' },
      }),
    );
    assert.equal(b.observations.some((o) => ['goal', 'progress'].includes(o.kind)), false);
    assert.equal(b.observations[0].kind, 'previous_session'); // own record still fine
  });
});

describe('every rendered string passes copy-safety', () => {
  const inputs: SessionBriefInput[] = [
    base({ previousSession: { focus: 'recovery and mobility', completedAtDate: '2026-09-01' }, openActions: [{ title: 'x' }, { title: 'y' }], goal: { label: 'lose weight' }, workoutAdherence: { completed: 1, planned: 4, windowDays: 7 }, recentWeightsKg: [90, 92, 94], activityCountThisWeek: 0, checkInCount: { count: 1, windowDays: 14 } }),
    base({ professionalFlavour: 'nutrition', nutrition: { daysWithAnyLog: 2, windowDays: 7, breakfastDays: 1 }, goal: { label: 'improve energy' } }),
    base({ consent: { relationshipStatus: 'active', shareProgress: false }, previousSession: { focus: 'lower-body strength', completedAtDate: null } }),
  ];
  for (let i = 0; i < inputs.length; i++) {
    test(`input ${i}`, () => {
      const b = buildProfessionalSessionBrief(inputs[i]);
      assert.doesNotThrow(() => assertBriefBundleSafe(briefStrings(b)));
    });
  }
});
