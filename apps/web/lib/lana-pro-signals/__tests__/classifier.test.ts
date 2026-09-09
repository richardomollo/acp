import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorkoutComment,
  signalForPerceivedDifficulty,
  CLASSIFIER_VERSION,
  INCOMPLETE_VOLUME_PCT,
} from '../classifier.ts';

describe('classifyWorkoutComment — the §6 canonical examples', () => {
  const cases: [string, string][] = [
    ['Weights are starting to feel too light.', 'progression_candidate'],
    ['My knee hurt during lunges.', 'discomfort_reported'],
    ['Only had 30 minutes.', 'time_constraint'],
    ["Couldn't finish the last two sets.", 'incomplete_volume'],
    ['Sharp pain in my lower back during deadlifts.', 'pain_reported'],
    ['I hate burpees.', 'exercise_dislike'],
    ['That felt too easy today.', 'perceived_difficulty_low'],
    ['This was brutal, way too heavy.', 'perceived_difficulty_high'],
    ["Couldn't really feel it in the right muscle.", 'technique_or_fit_issue'],
  ];
  for (const [text, expected] of cases) {
    test(`"${text}" → ${expected}`, () => {
      assert.equal(classifyWorkoutComment(text)?.type, expected);
    });
  }
});

describe('classifyWorkoutComment — conservative behaviour', () => {
  test('no clear match → null (never a fabricated signal)', () => {
    assert.equal(classifyWorkoutComment('did the workout at the park today'), null);
    assert.equal(classifyWorkoutComment('felt fine, nothing special'), null);
    assert.equal(classifyWorkoutComment('   '), null);
    assert.equal(classifyWorkoutComment(''), null);
  });

  test('SAFETY: pain / discomfort wins even when the comment also says "too heavy" / "too light"', () => {
    assert.equal(classifyWorkoutComment('Squats felt good but my knee hurt during lunges.')?.type, 'discomfort_reported');
    assert.equal(classifyWorkoutComment('too heavy and my shoulder started aching')?.type, 'discomfort_reported');
    assert.equal(classifyWorkoutComment('sharp pain in the knee, also felt too light')?.type, 'pain_reported');
  });

  test('classification is never more specific than the evidence (no bodyArea, no severity)', () => {
    const c = classifyWorkoutComment('Sharp pain in my lower back during deadlifts.')!;
    assert.deepEqual(Object.keys(c).sort(), ['matchedRule', 'type']);
    assert.equal(c.type, 'pain_reported'); // NOT "lower_back_injury"
  });

  test('matchedRule is returned for the "why?" drill-down', () => {
    assert.equal(classifyWorkoutComment('too light, could have done more')?.matchedRule, 'progression_candidate');
  });

  test('deterministic — same input, same output, many times', () => {
    for (let i = 0; i < 20; i++) {
      assert.deepEqual(classifyWorkoutComment('My knee hurt during lunges.'), { type: 'discomfort_reported', matchedRule: 'discomfort' });
    }
  });
});

describe('signalForPerceivedDifficulty', () => {
  test('easy → low, difficult → high, about_right / unknown → null', () => {
    assert.equal(signalForPerceivedDifficulty('easy'), 'perceived_difficulty_low');
    assert.equal(signalForPerceivedDifficulty('difficult'), 'perceived_difficulty_high');
    assert.equal(signalForPerceivedDifficulty('about_right'), null);
    assert.equal(signalForPerceivedDifficulty(null), null);
    assert.equal(signalForPerceivedDifficulty(undefined), null);
  });
});

describe('provenance / versioning (§22)', () => {
  test('CLASSIFIER_VERSION is a stable string', () => {
    assert.equal(CLASSIFIER_VERSION, 'workout-feedback-v1');
    assert.equal(typeof CLASSIFIER_VERSION, 'string');
  });
  test('INCOMPLETE_VOLUME_PCT is a real threshold, not an AI-looking number', () => {
    assert.equal(INCOMPLETE_VOLUME_PCT, 70);
  });
});
