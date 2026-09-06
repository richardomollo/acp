import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  relationshipWeeks,
  relationshipLengthFact,
  newClientFact,
  sessionsCompletedFact,
  nextSessionFact,
  followUpDueFact,
  experienceFact,
  preferenceFacts,
  secondaryGoalsFact,
  assignedWorkoutAdherence,
  activityVsRecentPattern,
  measurementRecency,
  talkingPointsFor,
  addDays,
} from '../signals.ts';
import { findBannedPhrases } from '../../lana-pro-delivery/copy-safety.ts';

const TODAY = '2026-09-06';

describe('signals — relationship facts (never consent-gated)', () => {
  test('relationshipWeeks: whole weeks, null below one week / on bad input', () => {
    assert.equal(relationshipWeeks(addDays(TODAY, -21) + 'T00:00:00Z', TODAY), 3);
    assert.equal(relationshipWeeks(addDays(TODAY, -21) + 'T09:00:00Z', TODAY), 2); // time-of-day eats into the week
    assert.equal(relationshipWeeks(addDays(TODAY, -6) + 'T09:00:00Z', TODAY), null);
    assert.equal(relationshipWeeks(null, TODAY), null);
    assert.equal(relationshipWeeks('not-a-date', TODAY), null);
  });

  test('relationshipLengthFact tagged fact, or null under a week', () => {
    const f = relationshipLengthFact(addDays(TODAY, -56) + 'T00:00:00Z', TODAY);
    assert.equal(f?.tag, 'fact');
    assert.match(f!.text, /Working together for 8 weeks\./);
    assert.equal(relationshipLengthFact(addDays(TODAY, -3) + 'T00:00:00Z', TODAY), null);
  });

  test('newClientFact only within the new-client window', () => {
    assert.equal(newClientFact(addDays(TODAY, -2) + 'T00:00:00Z', TODAY)?.kind, 'new_client');
    assert.match(newClientFact(TODAY + 'T00:00:00Z', TODAY)!.text, /connected today/);
    assert.equal(newClientFact(addDays(TODAY, -40) + 'T00:00:00Z', TODAY), null);
    assert.equal(newClientFact(null, TODAY), null);
  });

  test('sessionsCompletedFact: positive only, correct plural', () => {
    assert.equal(sessionsCompletedFact(0), null);
    assert.equal(sessionsCompletedFact(-3), null);
    assert.match(sessionsCompletedFact(1)!.text, /completed 1 session together/);
    assert.match(sessionsCompletedFact(9)!.text, /completed 9 sessions together/);
  });

  test('nextSessionFact: today / tomorrow / dated, null without a booking', () => {
    assert.equal(nextSessionFact(null, TODAY), null);
    assert.match(nextSessionFact({ atIso: `${TODAY}T10:00:00`, serviceName: 'Strength' }, TODAY)!.text, /is today — Strength/);
    assert.match(
      nextSessionFact({ atIso: `${addDays(TODAY, 1)}T10:00:00`, serviceName: 'PT' }, TODAY)!.text,
      /is tomorrow — PT/,
    );
    assert.match(
      nextSessionFact({ atIso: `${addDays(TODAY, 5)}T10:00:00`, serviceName: 'PT' }, TODAY)!.text,
      /on 2026-09-11/,
    );
  });

  test('followUpDueFact: only when due on/before today', () => {
    assert.equal(followUpDueFact(null, TODAY), null);
    assert.equal(followUpDueFact(addDays(TODAY, 3), TODAY), null);
    assert.equal(followUpDueFact(addDays(TODAY, -1), TODAY)?.kind, 'follow_up_due');
    assert.equal(followUpDueFact(addDays(TODAY, -1), TODAY)?.evidenceDate, addDays(TODAY, -1));
  });
});

describe('signals — profile facts (caller consent-gates the input)', () => {
  test('experienceFact', () => {
    assert.equal(experienceFact(''), null);
    assert.equal(experienceFact(null), null);
    assert.match(experienceFact('Intermediate')!.text, /Experience level: Intermediate\./);
  });

  test('preferenceFacts: activities and days, each optional', () => {
    assert.deepEqual(preferenceFacts({}), []);
    const fs = preferenceFacts({
      preferredActivities: ['Gym', 'Walking'],
      preferredTrainingDays: ['Mon', 'Wed', 'Fri'],
    });
    assert.equal(fs.length, 2);
    assert.match(fs[0].text, /Prefers Gym and Walking\./);
    assert.match(fs[1].text, /trains 3 days a week/);
  });

  test('secondaryGoalsFact drops the primary, null when nothing extra', () => {
    assert.equal(secondaryGoalsFact(['Build strength'], 'Build strength'), null);
    assert.equal(secondaryGoalsFact(null, 'x'), null);
    assert.match(
      secondaryGoalsFact(['Build strength', 'Improve mobility'], 'Build strength')!.text,
      /Also working towards Improve mobility\./,
    );
  });
});

describe('signals — behavioural observations (OBSERVATION, consent-gated)', () => {
  test('assignedWorkoutAdherence: needs a real denominator; clamps numerator', () => {
    assert.equal(assignedWorkoutAdherence({ completed: 1, assigned: 0, windowDays: 7, clientName: 'S' }), null);
    assert.equal(assignedWorkoutAdherence({ completed: 1, assigned: 3, windowDays: 0, clientName: 'S' }), null);
    const o = assignedWorkoutAdherence({ completed: 9, assigned: 3, windowDays: 7, clientName: 'S' });
    assert.equal(o?.tag, 'observation');
    assert.match(o!.text, /Completed 3 of 3 workouts you assigned this week\./);
    assert.match(
      assignedWorkoutAdherence({ completed: 2, assigned: 3, windowDays: 14, clientName: 'S' })!.text,
      /in the last 14 days/,
    );
  });

  test('activityVsRecentPattern: only speaks with 2+ weeks and a whole-session gap', () => {
    assert.equal(activityVsRecentPattern({ thisWeek: 1, recentWeeklyMean: 3, weeksObserved: 1 }), null);
    assert.equal(activityVsRecentPattern({ thisWeek: 3, recentWeeklyMean: 3, weeksObserved: 4 }), null); // in-line
    assert.match(
      activityVsRecentPattern({ thisWeek: 1, recentWeeklyMean: 3, weeksObserved: 4 })!.text,
      /lower than the recent pattern/,
    );
    assert.match(
      activityVsRecentPattern({ thisWeek: 5, recentWeeklyMean: 3, weeksObserved: 4 })!.text,
      /higher than the recent pattern/,
    );
  });

  test('measurementRecency: fresh, stale, or silent in between', () => {
    assert.equal(measurementRecency({ daysSinceLastMeasurement: null, todayLocalDate: TODAY }), null);
    assert.match(measurementRecency({ daysSinceLastMeasurement: 1, todayLocalDate: TODAY })!.text, /logged 1 day ago/);
    assert.equal(measurementRecency({ daysSinceLastMeasurement: 10, todayLocalDate: TODAY }), null);
    assert.match(
      measurementRecency({ daysSinceLastMeasurement: 30, todayLocalDate: TODAY })!.text,
      /over three weeks/,
    );
  });
});

describe('signals — talking points are soft and capped', () => {
  test('deduped intent, max 3, all copy-safe', () => {
    const tp = talkingPointsFor({
      previousFocus: 'lower-body strength',
      hasAdherence: true,
      activityBelowPattern: true,
      measurementStale: true,
      nutritionInconsistent: true,
      isNewClient: true,
    });
    assert.ok(tp.length <= 3);
    for (const s of tp) assert.deepEqual(findBannedPhrases(s), []);
  });
  test('empty when nothing to anchor to', () => {
    assert.deepEqual(talkingPointsFor({}), []);
  });

  test('lastSessionDifficult adds an ask-first prompt, not a claim', () => {
    const tp = talkingPointsFor({ lastSessionDifficult: true });
    assert.equal(tp.length, 1);
    assert.match(tp[0], /marked difficult/i);
    assert.deepEqual(findBannedPhrases(tp[0]), []);
    assert.equal(/because|caused|you should/i.test(tp[0]), false);
  });
});

describe('signals — no rendered string is ever unsafe copy', () => {
  test('every produced text passes the copy-safety blocklist', () => {
    const texts: string[] = [];
    const push = (s: { text: string } | null) => s && texts.push(s.text);
    push(relationshipLengthFact(addDays(TODAY, -90) + 'T00:00:00Z', TODAY));
    push(newClientFact(addDays(TODAY, -1) + 'T00:00:00Z', TODAY));
    push(sessionsCompletedFact(4));
    push(nextSessionFact({ atIso: `${TODAY}T10:00:00`, serviceName: 'Strength coaching' }, TODAY));
    push(followUpDueFact(addDays(TODAY, -1), TODAY));
    push(experienceFact('Beginner'));
    preferenceFacts({ preferredActivities: ['Gym'], preferredTrainingDays: ['Tue', 'Thu'] }).forEach((f) => texts.push(f.text));
    push(assignedWorkoutAdherence({ completed: 2, assigned: 3, windowDays: 7, clientName: 'S' }));
    push(activityVsRecentPattern({ thisWeek: 0, recentWeeklyMean: 3, weeksObserved: 4 }));
    push(measurementRecency({ daysSinceLastMeasurement: 40, todayLocalDate: TODAY }));
    for (const s of texts) assert.deepEqual(findBannedPhrases(s), [], s);
  });
});
