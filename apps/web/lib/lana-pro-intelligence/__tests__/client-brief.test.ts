import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientBrief, briefStrings, type ClientBriefInput } from '../client-brief.ts';
import { findBannedPhrases } from '../../lana-pro-delivery/copy-safety.ts';

const TODAY = '2026-09-06';
const NOW = '2026-09-06T08:30:00';

function baseInput(over: Partial<ClientBriefInput> = {}): ClientBriefInput {
  return {
    clientId: 'client-1',
    clientName: 'Sarah Wanjiku',
    professionalRef: { kind: 'personal_trainer', id: 'pt-1' },
    professionalFlavour: 'training',
    todayLocalDate: TODAY,
    nowIso: NOW,
    relationship: { status: 'active', createdAt: '2026-07-12T09:00:00Z' },
    sharesProgress: false,
    nextBooking: null,
    previousSession: null,
    completedSessionsCount: 0,
    openActionTitles: [],
    followUpDueOn: null,
    hasUpcomingBooking: false,
    ...over,
  };
}

const FORBIDDEN_TOKENS = [
  /iron|deficien/i, // "David is deficient in iron"
  /\b\d{3,4}\s*(kcal|calories)\b/i, // "put him on 1,500 calories"
  /squat to \d/i,
  /knee pain is caused/i,
  /mood/i, // never surface daily_checkins mood text
];

describe('client-brief — FACT vs OBSERVATION boundary', () => {
  test('previous session / open actions / goal land in knownFacts; behaviour in observations', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: true,
        goal: { label: 'Build strength', secondary: [] },
        previousSession: { focus: 'lower-body strength', completedAtDate: '2026-09-01' },
        openActionTitles: ['Send warm-up video'],
        assignedWorkoutAdherence: { completed: 2, assigned: 3, windowDays: 7 },
      }),
      'detail',
    );
    const factKinds = b.knownFacts.map((f) => f.kind);
    assert.ok(factKinds.includes('goal'));
    assert.ok(factKinds.includes('previous_session'));
    assert.ok(factKinds.includes('open_action'));
    assert.ok(b.observations.some((o) => o.kind === 'workout_adherence'));
    for (const f of b.knownFacts) assert.equal(f.tag, 'fact');
    for (const o of b.observations) assert.equal(o.tag, 'observation');
  });

  test('confidence is never "high" and rises to medium only with 2+ fresh observations', () => {
    const thin = buildClientBrief(baseInput({ sharesProgress: true }), 'detail');
    assert.equal(thin.confidence, 'low');
    const rich = buildClientBrief(
      baseInput({
        sharesProgress: true,
        assignedWorkoutAdherence: { completed: 1, assigned: 3, windowDays: 7 },
        activityPattern: { thisWeek: 0, recentWeeklyMean: 3, weeksObserved: 4 },
        daysSinceLastMeasurement: 2,
      }),
      'detail',
    );
    assert.equal(rich.confidence, 'medium');
    // @ts-expect-error — 'high' is not assignable, proving the type forbids it
    const _never: 'high' = rich.confidence;
    void _never;
  });
});

describe('client-brief — states', () => {
  test('no_relationship when not on the roster', () => {
    const b = buildClientBrief(baseInput({ relationship: { status: 'none', createdAt: null } }));
    assert.equal(b.state, 'no_relationship');
    assert.deepEqual(b.knownFacts, []);
    assert.deepEqual(b.observations, []);
  });

  test('no_shared_progress: active but not sharing — still yields professional-owned facts', () => {
    const b = buildClientBrief(
      baseInput({
        completedSessionsCount: 5,
        previousSession: { focus: 'mobility', completedAtDate: '2026-09-02' },
        openActionTitles: ['Book next block'],
      }),
    );
    assert.equal(b.state, 'no_shared_progress');
    assert.equal(b.clientContext.goalLabel, null);
    assert.ok(b.knownFacts.length > 0, 'pro-owned facts remain');
    assert.equal(b.observations.length, 0, 'no consumer progress observations');
  });

  test('no_shared_progress even with consumer data present — data is simply not passed', () => {
    // aggregator would not pass these when sharesProgress=false; assert the
    // builder also ignores them defensively.
    const b = buildClientBrief(
      baseInput({
        sharesProgress: false,
        goal: { label: 'Lose weight', secondary: [] },
        assignedWorkoutAdherence: { completed: 0, assigned: 4, windowDays: 7 },
        activityPattern: { thisWeek: 0, recentWeeklyMean: 4, weeksObserved: 4 },
      }),
    );
    assert.equal(b.state, 'no_shared_progress');
    assert.equal(b.clientContext.goalLabel, null);
    assert.equal(b.observations.length, 0);
    assert.equal(briefStrings(b).join(' ').includes('Lose weight'), false);
  });

  test('new_client: active + recent + no behavioural evidence', () => {
    const b = buildClientBrief(
      baseInput({ sharesProgress: true, relationship: { status: 'active', createdAt: '2026-09-04T09:00:00Z' } }),
    );
    assert.equal(b.state, 'new_client');
    assert.ok(b.talkingPoints.some((t) => /realistic starting point/i.test(t)));
  });

  test('no_activity_data: active + sharing + nothing observed', () => {
    const b = buildClientBrief(
      baseInput({ sharesProgress: true, relationship: { status: 'active', createdAt: '2026-05-01T09:00:00Z' } }),
    );
    assert.equal(b.state, 'no_activity_data');
  });

  test('evidence: at least one observation', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: true,
        relationship: { status: 'active', createdAt: '2026-05-01T09:00:00Z' },
        assignedWorkoutAdherence: { completed: 2, assigned: 3, windowDays: 7 },
      }),
    );
    assert.equal(b.state, 'evidence');
  });
});

describe('client-brief — freshness & malformed input', () => {
  test('stale when the newest dated evidence is older than 21 days', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: true,
        relationship: { status: 'active', createdAt: '2026-01-01T09:00:00Z' },
        previousSession: { focus: 'strength', completedAtDate: '2026-07-01' },
        daysSinceLastMeasurement: 60,
      }),
    );
    assert.equal(b.dataFreshness.stale, true);
    assert.equal(b.confidence, 'low', 'stale caps confidence');
  });

  test('malformed / missing optional fields never throw', () => {
    assert.doesNotThrow(() =>
      buildClientBrief(
        baseInput({
          sharesProgress: true,
          goal: null,
          recentWeightsKg: [Number.NaN, 80],
          activityPattern: null,
          daysSinceLastMeasurement: null,
          checkInCount: undefined,
          nutrition: undefined,
          openActionTitles: ['', '   '],
          previousSession: { focus: null, completedAtDate: null },
        }),
      ),
    );
  });

  test('every rendered string passes the copy-safety blocklist and contains no forbidden clinical claim', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: true,
        goal: { label: 'Build strength', secondary: ['Improve mobility'] },
        experienceLevel: 'Intermediate',
        preferredActivities: ['Gym', 'Running'],
        preferredTrainingDays: ['Mon', 'Wed', 'Fri'],
        previousSession: { focus: 'lower-body strength', completedAtDate: '2026-09-01' },
        openActionTitles: ['Send plan'],
        assignedWorkoutAdherence: { completed: 2, assigned: 3, windowDays: 7 },
        activityPattern: { thisWeek: 1, recentWeeklyMean: 3, weeksObserved: 4 },
        daysSinceLastMeasurement: 30,
        recentWeightsKg: [80.1, 80.4, 79.9],
      }),
      'detail',
    );
    for (const s of briefStrings(b)) {
      assert.deepEqual(findBannedPhrases(s), [], s);
      for (const re of FORBIDDEN_TOKENS) assert.equal(re.test(s), false, `${re} matched: ${s}`);
    }
  });
});

describe('client-brief — Phase 6 Step 6: last-session outcome feeds forward', () => {
  test('recorded client_response + plan_intent become FACTS (professional-owned, no consent needed)', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: false, // NOT sharing — these are the professional's own record
        previousSession: { focus: 'strength', completedAtDate: '2026-09-01', clientResponse: 'difficult', planIntent: 'keep' },
        completedSessionsCount: 3,
      }),
      'detail',
    );
    const facts = b.knownFacts.map((f) => f.text);
    assert.ok(facts.some((t) => /recorded the last session as difficult/i.test(t)));
    assert.ok(facts.some((t) => /plan after the last session was to keep similar/i.test(t)));
  });

  test('"difficult" yields a SUGGESTION to ask — never a causal or medical claim', () => {
    const b = buildClientBrief(
      baseInput({
        sharesProgress: true,
        relationship: { status: 'active', createdAt: '2026-05-01T09:00:00Z' },
        previousSession: { focus: 'strength', completedAtDate: '2026-09-02', clientResponse: 'difficult' },
        assignedWorkoutAdherence: { completed: 2, assigned: 3, windowDays: 7 },
      }),
      'detail',
    );
    const tp = b.talkingPoints.join(' ');
    assert.ok(/marked difficult/i.test(tp));
    for (const s of briefStrings(b)) {
      assert.deepEqual(findBannedPhrases(s), [], s);
      // no causal / prescriptive framing
      assert.equal(/because|caused by|due to|you should (reduce|increase|lower)/i.test(s), false, s);
      assert.equal(/lana (thinks|believes)|struggled because/i.test(s), false, s);
    }
  });

  test('"good"/"great" produce the fact but no difficult talking point', () => {
    const b = buildClientBrief(
      baseInput({ previousSession: { focus: 'x', completedAtDate: '2026-09-02', clientResponse: 'good' } }),
    );
    assert.ok(b.knownFacts.some((f) => /as good/i.test(f.text)));
    assert.equal(b.talkingPoints.some((t) => /difficult/i.test(t)), false);
  });

  test('absent outcome → no outcome facts, brief still builds', () => {
    const b = buildClientBrief(baseInput({ previousSession: { focus: 'x', completedAtDate: '2026-09-02' } }));
    assert.equal(b.knownFacts.some((f) => /recorded the last session/i.test(f.text)), false);
  });
});

describe('client-brief — home vs detail shaping', () => {
  test('home caps observations to 2 and facts to 3; detail is fuller', () => {
    const input = baseInput({
      sharesProgress: true,
      goal: { label: 'Build strength', secondary: [] },
      experienceLevel: 'Advanced',
      preferredActivities: ['Gym'],
      preferredTrainingDays: ['Mon', 'Wed'],
      previousSession: { focus: 'strength', completedAtDate: '2026-09-01' },
      openActionTitles: ['a'],
      completedSessionsCount: 6,
      assignedWorkoutAdherence: { completed: 1, assigned: 3, windowDays: 7 },
      activityPattern: { thisWeek: 0, recentWeeklyMean: 3, weeksObserved: 4 },
      daysSinceLastMeasurement: 40,
    });
    const home = buildClientBrief(input, 'home');
    const detail = buildClientBrief(input, 'detail');
    assert.ok(home.observations.length <= 2);
    assert.ok(home.knownFacts.length <= 3);
    assert.ok(detail.knownFacts.length >= home.knownFacts.length);
  });

  test('goal only appears in clientContext when consented', () => {
    const shared = buildClientBrief(baseInput({ sharesProgress: true, goal: { label: 'Build strength', secondary: [] } }));
    const notShared = buildClientBrief(baseInput({ sharesProgress: false, goal: { label: 'Build strength', secondary: [] } }));
    assert.equal(shared.clientContext.goalLabel, 'Build strength');
    assert.equal(notShared.clientContext.goalLabel, null);
  });
});
