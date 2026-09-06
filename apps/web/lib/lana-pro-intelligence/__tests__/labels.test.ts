import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { humanGoal, humaniseLevel, clientResponseLabel, planIntentLabel } from '../labels.ts';

describe('labels — one shared human-label implementation', () => {
  test('humanGoal maps every known consumer goal code', () => {
    assert.equal(humanGoal('build_muscle'), 'Build muscle');
    assert.equal(humanGoal('lose_weight'), 'Lose weight');
    assert.equal(humanGoal('body_recomposition'), 'Body recomposition');
    assert.equal(humanGoal('healthy_lifestyle'), 'Build a healthy lifestyle');
  });
  test('humanGoal prettifies unknown / free-text, never drops it', () => {
    assert.equal(humanGoal('some_new_goal'), 'Some new goal');
    assert.equal(humanGoal('Ultra running'), 'Ultra running');
    assert.equal(humanGoal(''), '');
    assert.equal(humanGoal(null), '');
  });
  test('humaniseLevel capitalises codes', () => {
    assert.equal(humaniseLevel('intermediate'), 'Intermediate');
    assert.equal(humaniseLevel('active_2_3'), 'Active 2 3');
    assert.equal(humaniseLevel(''), '');
  });
  test('no raw code survives — the whole point', () => {
    for (const code of ['build_muscle', 'intermediate', 'improve_mobility']) {
      assert.equal(/[_]/.test(humanGoal(code)), false, code);
      assert.equal(/[_]/.test(humaniseLevel(code)), false, code);
    }
  });
  test('session-outcome code labels', () => {
    assert.equal(clientResponseLabel('great'), 'Great');
    assert.equal(clientResponseLabel('difficult'), 'Difficult');
    assert.equal(clientResponseLabel(null), null);
    assert.equal(clientResponseLabel('weird'), null);
    assert.equal(planIntentLabel('keep'), 'Keep similar');
    assert.equal(planIntentLabel('progress'), 'Progress');
    assert.equal(planIntentLabel(null), null);
    assert.equal(planIntentLabel('weird'), null);
  });
});
