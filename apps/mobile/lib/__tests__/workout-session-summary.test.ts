import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkoutSessionEvidence, summarizeWorkoutSession, classifyExerciseNote, compareLoads,
  type WorkoutSessionInput, type SessionExerciseInput,
} from '../workout-session-summary.ts';

function exercise(overrides: Partial<SessionExerciseInput> = {}): SessionExerciseInput {
  return {
    exerciseId: 'e1', name: 'Push-up', plannedSets: 3, plannedReps: 10,
    loggedSets: [
      { setNumber: 1, reps: 10, weightKg: null },
      { setNumber: 2, reps: 10, weightKg: null },
      { setNumber: 3, reps: 9, weightKg: null },
    ],
    rating: null, note: null, previousSets: null, ...overrides,
  };
}

function session(overrides: Partial<WorkoutSessionInput> = {}): WorkoutSessionInput {
  return {
    workoutTitle: 'Full Body A', plannedExerciseCount: 3,
    actualDurationMinutes: 38, completionPercentage: 100,
    perceivedDifficulty: 'about_right', sessionRating: 4,
    exercises: [exercise(), exercise({ exerciseId: 'e2', name: 'Row' }), exercise({ exerciseId: 'e3', name: 'Squat' })],
    ...overrides,
  };
}

describe('buildWorkoutSessionEvidence — deterministic counts (§29 A/B)', () => {
  test('A — full completion: every prescribed set logged → all exercises completed', () => {
    const ev = buildWorkoutSessionEvidence(session());
    assert.equal(ev.completedExerciseCount, 3);
    assert.equal(ev.plannedExerciseCount, 3);
    assert.equal(ev.loggedSetCount, 9);
  });

  test('B — partial completion: a short-logged exercise is not counted complete', () => {
    const ev = buildWorkoutSessionEvidence(session({
      completionPercentage: 67,
      exercises: [
        exercise(),
        exercise({ exerciseId: 'e2', name: 'Row', loggedSets: [{ setNumber: 1, reps: 8, weightKg: 20 }] }),
        exercise({ exerciseId: 'e3', name: 'Squat', loggedSets: [] }),
      ],
    }));
    assert.equal(ev.completedExerciseCount, 1);
    assert.equal(ev.plannedExerciseCount, 3);
    const s = summarizeWorkoutSession(ev);
    assert.match(s.facts[0], /1 of 3 exercises completed/);
    assert.match(s.coachingLine, /partial session still counts/i);
  });

  test('an exercise with no set prescription counts once any set is logged', () => {
    const ev = buildWorkoutSessionEvidence(session({
      plannedExerciseCount: 1,
      exercises: [exercise({ plannedSets: null, loggedSets: [{ setNumber: 1, reps: 12, weightKg: null }] })],
    }));
    assert.equal(ev.completedExerciseCount, 1);
  });
});

describe('perceived difficulty representation (§29 C/D/E)', () => {
  for (const [value, phrase, coaching] of [
    ['about_right', /felt about right/, /about right — nicely matched/i],
    ['easy', /felt easy/, /felt easy.*add a little challenge/i],
    ['difficult', /felt hard/, /felt hard.*ease the next one/i],
  ] as const) {
    test(`${value} → represented accurately in facts and coaching line`, () => {
      const s = summarizeWorkoutSession(buildWorkoutSessionEvidence(session({ perceivedDifficulty: value })));
      assert.ok(s.facts.some(f => phrase.test(f)), `facts should mention ${value}`);
      assert.match(s.coachingLine, coaching);
    });
  }

  test('no difficulty answer → no difficulty fact, neutral coaching line', () => {
    const s = summarizeWorkoutSession(buildWorkoutSessionEvidence(session({ perceivedDifficulty: null })));
    assert.ok(!s.facts.some(f => /felt (easy|hard|about right)/.test(f)));
    assert.match(s.coachingLine, /consistency is what moves the needle/);
  });
});

describe('exercise ratings — factual only, never difficulty (§15/§29 F)', () => {
  test('reports rating counts without interpreting them as a difficulty/quality signal', () => {
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [
        exercise({ rating: 5 }),
        exercise({ exerciseId: 'e2', name: 'Row', rating: 2 }),
        exercise({ exerciseId: 'e3', name: 'Squat', rating: null }),
      ],
    }));
    assert.equal(ev.ratedExerciseCount, 2);
    assert.equal(ev.positiveRatingCount, 1);
    const s = summarizeWorkoutSession(ev);
    assert.ok(s.facts.some(f => /Rated 1 of 2 exercises 4★ or higher/.test(f)));
    // never phrases a rating as difficulty / readiness
    assert.ok(!s.facts.some(f => /too easy|too hard|ready to progress/i.test(f)));
  });
});

describe('free-text notes (§14/§29 G/H, §30)', () => {
  test('G — no free-text: summary still works, no note facts', () => {
    const ev = buildWorkoutSessionEvidence(session());
    assert.equal(ev.notes.length, 0);
    assert.ok(summarizeWorkoutSession(ev).facts.length >= 1);
  });

  test('H — free-text present: preserved and classified', () => {
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [exercise({ note: 'could go heavier on this next time' }), exercise({ exerciseId: 'e2', name: 'Row' }), exercise({ exerciseId: 'e3', name: 'Squat' })],
    }));
    assert.equal(ev.notes.length, 1);
    assert.equal(ev.notes[0].category, 'progression_intent');
    assert.equal(ev.notes[0].text, 'could go heavier on this next time');
  });

  test('health/pain text → health_sensitive, neutral phrasing, NO diagnosis and NO raw pain text in the summary', () => {
    const c = classifyExerciseNote('my shoulder hurt on the last set');
    assert.equal(c.category, 'health_sensitive');
    assert.equal(c.safeSummary, 'Reported discomfort during this exercise');
    assert.ok(!/injur|diagnos|tear|strain/i.test(c.safeSummary!));

    const s = summarizeWorkoutSession(buildWorkoutSessionEvidence(session({
      exercises: [exercise({ name: 'Overhead Press', note: 'sharp pain in my shoulder' }), exercise({ exerciseId: 'e2' }), exercise({ exerciseId: 'e3' })],
    })));
    const noteFact = s.facts.find(f => /Overhead Press/.test(f))!;
    assert.match(noteFact, /reported some discomfort/i);
    assert.ok(!/sharp|pain|shoulder/i.test(noteFact), 'raw pain wording must not appear in the summary');
  });

  test('dislike text → preference_dislike (still session-local — not a durable memory object)', () => {
    assert.equal(classifyExerciseNote('I hate burpees').category, 'preference_dislike');
    // the module returns evidence only; it never emits a memory/pattern object
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [exercise({ note: 'I hate this one' }), exercise({ exerciseId: 'e2' }), exercise({ exerciseId: 'e3' })],
    }));
    assert.ok(!('memory' in ev) && !('pattern' in ev) && !('learned' in ev));
  });

  test('contradictory notes do not produce an overconfident pattern', () => {
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [
        exercise({ name: 'A', note: 'too easy' }),
        exercise({ exerciseId: 'e2', name: 'B', note: 'too hard, struggled' }),
        exercise({ exerciseId: 'e3', name: 'C' }),
      ],
    }));
    const s = summarizeWorkoutSession(ev);
    // both notes are surfaced verbatim-classified; the coaching line stays tied
    // to the session-level perceived difficulty, not the conflicting notes
    assert.equal(ev.notes.length, 2);
    assert.match(s.coachingLine, /about right/i);
  });

  test('empty / whitespace note is ignored', () => {
    assert.equal(classifyExerciseNote('   ').category, 'other');
    assert.equal(classifyExerciseNote('   ').safeSummary, null);
  });
});

describe('load progression (§22/§29 I/J)', () => {
  test('I — deterministic actual-to-actual comparison when a previous session exists', () => {
    const c = compareLoads(exercise({
      name: 'Bench Press',
      loggedSets: [{ setNumber: 1, reps: 8, weightKg: 42.5 }, { setNumber: 2, reps: 8, weightKg: 42.5 }],
      previousSets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }],
    }));
    assert.equal(c.direction, 'up');
    assert.equal(c.deltaKg, 2.5);

    const s = summarizeWorkoutSession(buildWorkoutSessionEvidence(session({
      exercises: [
        exercise({ name: 'Bench Press', loggedSets: [{ setNumber: 1, reps: 8, weightKg: 42.5 }], previousSets: [{ reps: 8, weightKg: 40 }] }),
        exercise({ exerciseId: 'e2', name: 'Row', loggedSets: [{ setNumber: 1, reps: 10, weightKg: 30 }], previousSets: [{ reps: 10, weightKg: 25 }] }),
        exercise({ exerciseId: 'e3', name: 'Squat' }),
      ],
    })));
    assert.ok(s.facts.some(f => /Load increased on 2 exercises vs your last logged session/.test(f)));
    // observational only — never "you are stronger"
    assert.ok(!s.facts.some(f => /stronger|gains|progress proven/i.test(f)));
    assert.ok(!/stronger/i.test(s.coachingLine));
  });

  test('J — no previous data → no progression claim at all', () => {
    const c = compareLoads(exercise({ loggedSets: [{ setNumber: 1, reps: 8, weightKg: 50 }], previousSets: null }));
    assert.equal(c.direction, 'no_previous');
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [exercise({ loggedSets: [{ setNumber: 1, reps: 8, weightKg: 50 }], previousSets: null }), exercise({ exerciseId: 'e2' }), exercise({ exerciseId: 'e3' })],
    }));
    assert.equal(ev.loadChanges.length, 0);
    assert.ok(!summarizeWorkoutSession(ev).facts.some(f => /load/i.test(f)));
  });

  test('bodyweight-only session (no weights) makes no load claim', () => {
    const ev = buildWorkoutSessionEvidence(session({
      exercises: [
        exercise({ previousSets: [{ reps: 12, weightKg: null }] }),
        exercise({ exerciseId: 'e2', previousSets: [{ reps: 12, weightKg: null }] }),
        exercise({ exerciseId: 'e3' }),
      ],
    }));
    assert.equal(ev.loadChanges.length, 0);
  });
});

describe('summary is stable / pure', () => {
  test('same input → identical output', () => {
    const inp = session();
    assert.deepEqual(summarizeWorkoutSession(buildWorkoutSessionEvidence(inp)), summarizeWorkoutSession(buildWorkoutSessionEvidence(inp)));
  });
});
