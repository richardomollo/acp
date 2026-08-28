import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchProfessionalProviders, type ProfessionalProvider } from '../professional-support.ts';

describe('Scenario J — PT support matching (build_muscle / gym preference)', () => {
  test('matches a provider whose specialisms overlap the goal/preferred activities', () => {
    const providers: ProfessionalProvider[] = [
      { id: 'pt-1', name: 'Strength Coach', specialisations: ['Strength Training', 'Functional Training'] },
      { id: 'pt-2', name: 'Dance Instructor', specialisations: ['Dance'] },
    ];
    const matches = matchProfessionalProviders('build_muscle', ['gym'], false, providers);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'pt-1');
  });

  test('returns an explainable reason drawn from real specialism data, never invented', () => {
    const providers: ProfessionalProvider[] = [{ id: 'pt-1', name: 'Strength Coach', specialisations: ['Strength Training'] }];
    const matches = matchProfessionalProviders('build_muscle', [], false, providers);
    assert.deepEqual(matches[0].matchReasons, ['Strength Training']);
  });

  test('never returns more than 3 providers', () => {
    const providers: ProfessionalProvider[] = Array.from({ length: 6 }, (_, i) => ({
      id: `pt-${i}`, name: `Coach ${i}`, specialisations: ['Strength Training'],
    }));
    const matches = matchProfessionalProviders('build_muscle', [], false, providers);
    assert.ok(matches.length <= 3);
  });

  test('a provider with zero overlapping specialisms is not a candidate at all — no forced matches', () => {
    const providers: ProfessionalProvider[] = [{ id: 'pt-1', name: 'Dance Instructor', specialisations: ['Dance'] }];
    assert.deepEqual(matchProfessionalProviders('build_muscle', ['gym'], false, providers), []);
  });
});

describe('Scenario K — nutrition support uses the reliable classification only', () => {
  const providers: ProfessionalProvider[] = [
    { id: 'pt-1', name: 'Wellness Coach', specialisations: ['Yoga', 'Pilates'] }, // NOT classified as nutrition-capable
    { id: 'pt-2', name: 'Nutrition Coach', specialisations: ['Nutrition', 'Weight Loss'] },
  ];

  test('only a provider with the "Nutrition" specialism is matched for a nutrition request', () => {
    const matches = matchProfessionalProviders(null, [], true, providers);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'pt-2');
  });

  test('a generic wellness specialism (yoga/pilates) does not qualify as nutrition support', () => {
    const onlyWellness: ProfessionalProvider[] = [{ id: 'pt-1', name: 'Wellness Coach', specialisations: ['Yoga', 'Pilates'] }];
    assert.deepEqual(matchProfessionalProviders(null, [], true, onlyWellness), []);
  });
});

describe('Scenario L — commercial neutrality', () => {
  test('two providers with identical specialisms score identically — nothing else can be read by the scorer', () => {
    const providers: ProfessionalProvider[] = [
      { id: 'pt-1', name: 'Coach A', specialisations: ['Strength Training'] },
      { id: 'pt-2', name: 'Coach B', specialisations: ['Strength Training'] },
    ];
    const matches = matchProfessionalProviders('build_muscle', [], false, providers);
    assert.equal(matches[0].score, matches[1].score);
    // ProfessionalProvider's type has no commission/revenue/sponsorship
    // field — there's nothing for the scorer to prefer one provider on.
  });
});
