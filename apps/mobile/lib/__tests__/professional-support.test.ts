import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchProfessionalProviders, mergeEligiblePtIds, resolveProfessionalSupportAvailability, type ProfessionalProvider } from '../professional-support.ts';

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

// Beta Feedback #019D — professional-support geography leak. mergeEligiblePtIds
// is the pure core of the shared eligibility rule every surface (My Plan,
// Today Nutrition, Log Progress, Trainers, Discover, Home search, Fitness
// Journey, Activity Fulfilment) now resolves through — the network side
// (services/professional-eligibility-service.ts) is a thin, untested-by-design
// wrapper around this.
describe('Beta #019D — mergeEligiblePtIds (in-person vs. explicit online eligibility)', () => {
  test('1. Amsterdam + a Nairobi in-person-only nutritionist → excluded (not in any list)', () => {
    const eligible = mergeEligiblePtIds(['ams-venue-1'], [], [], []);
    assert.ok(!eligible!.includes('nairobi-in-person-nutritionist'));
  });

  test('2. Amsterdam + a Nairobi professional with an explicit active online offering → included', () => {
    const eligible = mergeEligiblePtIds(['ams-venue-1'], [], [], ['nairobi-pt-online']);
    assert.ok(eligible!.includes('nairobi-pt-online'));
  });

  test('3. an inactive/draft online offering never reaches this function at all — the caller only ever queries is_active/is_draft-filtered rows, so "inactive" simply never appears in onlineOfferingPtIds', () => {
    // mergeEligiblePtIds has no activity awareness of its own by design — the
    // active/draft filter is a query-time concern (services/professional-
    // eligibility-service.ts), asserted structurally, not something this
    // pure function could get wrong even if a caller forgot it.
    const eligible = mergeEligiblePtIds(['ams-venue-1'], [], [], []); // inactive row correctly never appears here
    assert.ok(!eligible!.includes('nairobi-pt-inactive-online'));
  });

  test('4. Nairobi + a nearby in-person professional (venue-linked) → included', () => {
    const eligible = mergeEligiblePtIds(['nairobi-venue-1'], ['nairobi-pt-1'], [], []);
    assert.ok(eligible!.includes('nairobi-pt-1'));
  });

  test('4b. Nairobi + a nearby in-person professional (offering at the venue, no venue-link row) → included', () => {
    const eligible = mergeEligiblePtIds(['nairobi-venue-1'], [], ['nairobi-pt-2'], []);
    assert.ok(eligible!.includes('nairobi-pt-2'));
  });

  test('5/6. manual Explore Nairobi → Nairobi in-person becomes eligible; switching back to Amsterdam (a different scope) excludes it again', () => {
    const exploringNairobi = mergeEligiblePtIds(['nairobi-venue-1'], ['nairobi-pt-1'], [], []);
    assert.ok(exploringNairobi!.includes('nairobi-pt-1'));
    const backToAmsterdam = mergeEligiblePtIds(['ams-venue-1'], [], [], []);
    assert.ok(!backToAmsterdam!.includes('nairobi-pt-1'));
  });

  test('7. location_unknown (empty scope, geo-gating on) + in-person Nairobi professional → excluded', () => {
    const eligible = mergeEligiblePtIds([], [], [], []);
    assert.deepEqual(eligible, []);
  });

  test('8. location_unknown (empty scope) + an explicit online professional → included', () => {
    const eligible = mergeEligiblePtIds([], [], [], ['online-pt']);
    assert.deepEqual(eligible, ['online-pt']);
  });

  test('9. kill switch off (venueScopeIds null) → no filter at all, regardless of the other lists', () => {
    assert.equal(mergeEligiblePtIds(null, [], [], []), null);
    assert.equal(mergeEligiblePtIds(null, ['whatever'], ['whatever2'], []), null);
  });

  test('10. no eligible professional → empty list, never a fabricated fallback id', () => {
    assert.deepEqual(mergeEligiblePtIds(['ams-venue-1'], [], [], []), []);
  });

  test('dedupes a PT id appearing in more than one list', () => {
    const eligible = mergeEligiblePtIds(['v1'], ['pt-1'], ['pt-1'], ['pt-1']);
    assert.deepEqual(eligible, ['pt-1']);
  });

  test('drops falsy ids defensively', () => {
    const eligible = mergeEligiblePtIds(['v1'], ['', 'pt-1'], [], []);
    assert.deepEqual(eligible, ['pt-1']);
  });
});

describe('Beta #019D — 11. goal/category matching still works AFTER eligibility filtering', () => {
  test('matchProfessionalProviders only ever sees the already-eligible provider list — ranking is unchanged by the geo fix', () => {
    const eligibleProviders: ProfessionalProvider[] = [
      { id: 'pt-online', name: 'Online Nutrition Coach', specialisations: ['Nutrition'] },
    ];
    const matches = matchProfessionalProviders(null, [], true, eligibleProviders);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'pt-online');
  });
});

// Beta Feedback #019E — location-aware professional-support empty states.
// resolveProfessionalSupportAvailability is the pure core every "Want extra
// support" surface (Today Nutrition, Log Progress, My Plan, Fitness Journey,
// Activity Fulfilment) resolves to before choosing its copy, so the reason
// for an empty result (geography vs. unresolved location vs. a genuine
// failure) is never collapsed into one generic "no matches" message.
describe('Beta #019E — resolveProfessionalSupportAvailability', () => {
  test('1. Amsterdam + no local + no online → no_local_or_online_support (location-aware unavailable state)', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: false, matchCount: 0 });
    assert.equal(availability, 'no_local_or_online_support');
  });

  test('2. Amsterdam + no local + online professional → available (no unavailable state)', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: false, matchCount: 1 });
    assert.equal(availability, 'available');
  });

  test('3. Nairobi + eligible local professional → available', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: false, matchCount: 1 });
    assert.equal(availability, 'available');
  });

  test('4. Nairobi + local + online (deduped upstream by mergeEligiblePtIds) → available, matchCount reflects the deduped set', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: false, matchCount: 2 });
    assert.equal(availability, 'available');
  });

  test('5. location unknown → location_unknown (choose-city state)', () => {
    assert.equal(resolveProfessionalSupportAvailability({ locationKnown: false, queryFailed: false, matchCount: 0 }), 'location_unknown');
  });

  test('6. location unknown + an online professional already resolved → still shown as available (#019D semantics: online can cross geography even before location resolves)', () => {
    // If a caller already has a match (e.g. an explicit online offering that
    // doesn't depend on knowing the user's point), matchCount > 0 wins —
    // location_unknown is only the verdict when nothing has been found yet.
    const availability = resolveProfessionalSupportAvailability({ locationKnown: false, queryFailed: false, matchCount: 1 });
    assert.equal(availability, 'available');
  });

  test('7. eligibility query failure → error, never no_local_or_online_support, even with a known location', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: true, matchCount: 0 });
    assert.equal(availability, 'error');
  });

  test('7b. query failure beats location_unknown too — error is never downgraded to a location prompt', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: false, queryFailed: true, matchCount: 0 });
    assert.equal(availability, 'error');
  });

  test('10. empty result is a real ProfessionalSupportAvailability value, never a bare "no matches" string', () => {
    const availability = resolveProfessionalSupportAvailability({ locationKnown: true, queryFailed: false, matchCount: 0 });
    assert.notEqual(availability as string, 'No matching professionals were found right now.');
    assert.equal(availability, 'no_local_or_online_support');
  });
});
