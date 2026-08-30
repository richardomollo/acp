import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetadata } from '../normalize.ts';

describe('normalizeMetadata (test Q — metadata normalization)', () => {
  test('goal variants all normalize to the same canonical ACP value', () => {
    const variants = ['Build Muscle', 'build muscle', 'build-muscle', 'build_muscle'];
    for (const v of variants) {
      assert.deepEqual(normalizeMetadata({ goals: [v] }), { goals: ['build_muscle'] });
    }
  });

  test('experience_level variants normalize consistently', () => {
    assert.deepEqual(normalizeMetadata({ experience_levels: ['Beginner', 'INTERMEDIATE'] }), {
      experience_levels: ['beginner', 'intermediate'],
    });
  });

  test('open-vocabulary fields (topics/activities/barriers) are case/spacing-normalized without a closed-set check', () => {
    assert.deepEqual(normalizeMetadata({ topics: ['Progressive Overload'], barriers: ['Time Management'] }), {
      topics: ['progressive_overload'], barriers: ['time_management'],
    });
  });

  test('non-array/unrecognised fields pass through untouched', () => {
    const input = { goals: ['build_muscle'], custom_field: 'anything' };
    assert.deepEqual(normalizeMetadata(input), input);
  });

  test('missing metadata fields are simply absent from the result, never fabricated (section 17)', () => {
    const result = normalizeMetadata({ topics: ['consistency'] });
    assert.deepEqual(result, { topics: ['consistency'] });
    assert.ok(!('goals' in result));
  });
});
