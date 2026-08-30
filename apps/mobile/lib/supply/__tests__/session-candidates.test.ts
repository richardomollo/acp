import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionCandidates, type SessionCandidateRow } from '../session-candidates.ts';
import type { SupplyPlanActivityInput, SupplyUserContext } from '../types.ts';

const ANCHOR = new Date('2026-09-02T09:00:00Z'); // a Wednesday

function planActivity(overrides: Partial<SupplyPlanActivityInput> = {}): SupplyPlanActivityInput {
  return { day: 'Wednesday', category: 'strength', activity: 'Gym — strength', duration_minutes: 45, planned_date: '2026-09-02', ...overrides };
}

function userContext(overrides: Partial<SupplyUserContext> = {}): SupplyUserContext {
  return { goal: null, experience: null, preferredActivities: [], barriers: [], ...overrides };
}

function row(overrides: Partial<SessionCandidateRow> = {}): SessionCandidateRow {
  return {
    id: 's1', type: 'session', name: 'Strength Class', category: 'strength',
    date: '2026-09-02', startTime: '18:00:00', durationMinutes: 45,
    isActive: true, spotsLeft: 5, gym: { id: 'g1', name: 'Test Gym', area: 'Westlands', lat: -1.26, lng: 36.8 },
    ...overrides,
  };
}

describe('Test A — inactive supply excluded', () => {
  test('an inactive session never appears, regardless of how well it otherwise matches', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(), inventory: [row({ isActive: false })], userContext: userContext(), anchor: ANCHOR,
    });
    assert.equal(candidates.length, 0);
  });
});

describe('Test B — full session excluded', () => {
  test('spots_left = 0 is hard-excluded, never soft-ranked down', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(), inventory: [row({ spotsLeft: 0 })], userContext: userContext(), anchor: ANCHOR,
    });
    assert.equal(candidates.length, 0);
  });

  test('null spots_left is NOT treated as sold out (section 50)', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(), inventory: [row({ spotsLeft: null })], userContext: userContext(), anchor: ANCHOR,
    });
    assert.equal(candidates.length, 1);
  });
});

describe('Test C — activity match', () => {
  test('a strength-compatible session outranks/excludes an unrelated yoga session for a strength plan activity', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(),
      inventory: [
        row({ id: 'strength-1', name: 'Strength Class', category: 'strength' }),
        row({ id: 'yoga-1', name: 'Yoga Flow', category: 'yoga' }),
      ],
      userContext: userContext(), anchor: ANCHOR,
    });
    assert.deepEqual(candidates.map(c => c.id), ['strength-1']); // yoga never matched at all — no forced matches
  });
});

describe('Test D — same-day schedule fit', () => {
  test('two otherwise-equal sessions: same-day outranks alternate-day', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity({ planned_date: '2026-09-02' }),
      inventory: [
        row({ id: 'same-day', date: '2026-09-02' }),
        row({ id: 'alt-day', date: '2026-09-03' }),
      ],
      userContext: userContext(), anchor: ANCHOR,
    });
    assert.deepEqual(candidates.map(c => c.id), ['same-day', 'alt-day']);
  });
});

describe('Test E — duration fit', () => {
  test('a candidate whose duration is closer to the plan activity ranks above one further off, all else equal', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity({ duration_minutes: 45 }),
      inventory: [
        row({ id: 'close', date: '2026-09-03', durationMinutes: 50 }),
        row({ id: 'far', date: '2026-09-03', durationMinutes: 90 }),
      ],
      userContext: userContext(), anchor: ANCHOR,
    });
    assert.deepEqual(candidates.map(c => c.id), ['close', 'far']);
  });
});

describe('Test I — advanced open gym', () => {
  test('an advanced strength user still sees an eligible open-gym session — never excluded for being advanced', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(),
      inventory: [row({ id: 'open-gym', name: 'Open Gym Session', category: 'HIIT' })],
      userContext: userContext({ experience: 'advanced' }), anchor: ANCHOR,
    });
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].reasons.includes('open_gym'));
  });

  test('open gym is not forced to the top or bottom purely by name — it ranks by the same signals as any other session', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(),
      inventory: [
        row({ id: 'open-gym', name: 'Open Gym Session', category: 'strength', date: '2026-09-02' }),
        row({ id: 'coached', name: 'Strength Class', category: 'strength', date: '2026-09-03' }),
      ],
      userContext: userContext({ experience: 'advanced' }), anchor: ANCHOR,
    });
    assert.equal(candidates[0].id, 'open-gym'); // same-day wins on schedule fit, same as any session would
  });
});

describe('Test N — past session excluded', () => {
  test('a session dated before the anchor "now" is never returned', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(),
      inventory: [row({ id: 'past', date: '2026-08-01' })],
      userContext: userContext(), anchor: ANCHOR,
    });
    assert.equal(candidates.length, 0);
  });
});

describe('Test O — deterministic ordering', () => {
  test('identical inputs always produce the same candidate order, never Math.random()', () => {
    const inventory = [
      row({ id: 'a', date: '2026-09-03' }),
      row({ id: 'b', date: '2026-09-03' }),
      row({ id: 'c', date: '2026-09-02' }),
    ];
    const run1 = buildSessionCandidates({ planActivity: planActivity(), inventory, userContext: userContext(), anchor: ANCHOR }).map(c => c.id);
    const run2 = buildSessionCandidates({ planActivity: planActivity(), inventory, userContext: userContext(), anchor: ANCHOR }).map(c => c.id);
    assert.deepEqual(run1, run2);
    assert.deepEqual(run1, ['c', 'a', 'b']); // same-day first, then alphabetical tiebreak among equals
  });
});

describe('Goal fit signal', () => {
  test('a session matching the user goal-relevant activity key gets goal_match', () => {
    const candidates = buildSessionCandidates({
      planActivity: planActivity(),
      inventory: [row()],
      userContext: userContext({ goal: 'build_muscle' }), anchor: ANCHOR,
    });
    assert.ok(candidates[0].reasons.includes('goal_match'));
  });
});
