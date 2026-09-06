import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findBannedPhrases, assertBriefSafe, assertBriefBundleSafe } from '../copy-safety.ts';

describe('§8 — allowed professional statements pass', () => {
  const OK = [
    'James completed 2 of 3 planned workouts this week.',
    'Last session focused on squat technique.',
    'Weight has remained broadly stable across the last three measurements.',
    'Breakfast was logged on 5 of the last 7 days.',
    'Two actions from your previous session are still open.',
    'Consider checking how recovery felt after the last two sessions.',
    "James's current goal is build strength.",
    '3 activities have been logged so far this week.',
    "James checked in 4 times in the last 14 days.",
  ];
  for (const s of OK) {
    test(JSON.stringify(s.slice(0, 40)), () => {
      assert.deepEqual(findBannedPhrases(s), []);
      assert.doesNotThrow(() => assertBriefSafe(s));
    });
  }
  test('bundle assert passes', () => {
    assert.doesNotThrow(() => assertBriefBundleSafe(OK));
  });
});

describe('§8 — disallowed statements fail copy safety', () => {
  const BAD: [string, string][] = [
    ['James is losing motivation.', 'motivation'],
    ['James needs discipline.', 'discipline'],
    ['James needs to try harder.', 'try harder'],
    ['His metabolism has slowed.', 'metabolism'],
    ['His back pain was caused by poor form.', 'pain caused'],
    ['Increase his calories by 400.', 'increase calories'],
    ['Increase calories by 400 per day.', 'increase calories'],
    ['He clearly has a shoulder injury.', 'injury diagnosis'],
    ['This proves the plan is working.', 'proves'],
    ['He definitely plateaued because of overtraining.', 'over-certain/detected'],
    ['James is disengaging from training.', 'disengaging'],
    ['You only completed 2 sessions.', 'only completed'],
    ['He should take creatine.', 'supplement'],
    ['His body has stopped responding.', 'body adapted'],
    ['He is lazy and not serious.', 'lazy'],
  ];
  for (const [s] of BAD) {
    test(JSON.stringify(s.slice(0, 40)), () => {
      assert.ok(findBannedPhrases(s).length > 0, `expected a hit for: ${s}`);
      assert.throws(() => assertBriefSafe(s));
    });
  }
});

describe('implementation terminology is blocked', () => {
  test('provenance / embedding / RAG leak', () => {
    assert.ok(findBannedPhrases('based on the embedding similarity score').length > 0);
    assert.ok(findBannedPhrases('internal provenance: measurement').length > 0);
  });
});
