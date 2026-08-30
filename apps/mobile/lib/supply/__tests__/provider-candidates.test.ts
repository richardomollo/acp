import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalTrainerCandidates, buildNutritionistCandidates, type ProviderCandidateRow } from '../provider-candidates.ts';
import type { SupplyUserContext } from '../types.ts';

function userContext(overrides: Partial<SupplyUserContext> = {}): SupplyUserContext {
  return { goal: null, experience: null, preferredActivities: [], barriers: [], ...overrides };
}

function provider(overrides: Partial<ProviderCandidateRow> = {}): ProviderCandidateRow {
  return { id: 'p1', name: 'Coach', specialisations: [], status: 'approved', ...overrides };
}

describe('Test A — inactive/unapproved supply excluded (provider variant)', () => {
  test('a pending (not yet approved) provider is never a PT candidate', () => {
    const candidates = buildPersonalTrainerCandidates(
      [provider({ specialisations: ['Strength Training'], status: 'pending' })],
      userContext({ goal: 'build_muscle' }), undefined,
    );
    assert.equal(candidates.length, 0);
  });
});

describe('Test S — provider approval', () => {
  test('a suspended provider is excluded even with a perfect specialism match', () => {
    const candidates = buildPersonalTrainerCandidates(
      [provider({ specialisations: ['Strength Training'], status: 'suspended' })],
      userContext({ goal: 'build_muscle' }), undefined,
    );
    assert.equal(candidates.length, 0);
  });

  test('an approved provider with the same match is included', () => {
    const candidates = buildPersonalTrainerCandidates(
      [provider({ specialisations: ['Strength Training'], status: 'approved' })],
      userContext({ goal: 'build_muscle' }), undefined,
    );
    assert.equal(candidates.length, 1);
  });
});

describe('Test F — PT specialisation', () => {
  test('a strength goal ranks a strength-specialised PT above an unrelated one', () => {
    const providers = [
      provider({ id: 'strength-pt', specialisations: ['Strength Training'] }),
      provider({ id: 'dance-pt', specialisations: ['Dance'] }),
    ];
    const candidates = buildPersonalTrainerCandidates(providers, userContext({ goal: 'build_muscle' }), undefined);
    assert.deepEqual(candidates.map(c => c.id), ['strength-pt']); // dance-pt has zero overlap — not a candidate at all
  });
});

describe('Test G — nutritionist', () => {
  test('only structured Nutrition-qualified providers are eligible when a nutrition support opportunity exists', () => {
    const providers = [
      provider({ id: 'nutritionist', specialisations: ['Nutrition'] }),
      provider({ id: 'generic-pt', specialisations: ['Strength Training'] }),
    ];
    const candidates = buildNutritionistCandidates(providers, userContext(), [{ type: 'nutrition', relevance: 'high', reason: 'x' }]);
    assert.deepEqual(candidates.map(c => c.id), ['nutritionist']);
  });

  test('no nutrition support opportunity at all → zero nutritionist candidates, even if a qualified provider exists', () => {
    const candidates = buildNutritionistCandidates(
      [provider({ specialisations: ['Nutrition'] })], userContext(), undefined,
    );
    assert.equal(candidates.length, 0);
  });

  test('a generic PT is never classified as a nutritionist by loose inference', () => {
    const candidates = buildNutritionistCandidates(
      [provider({ specialisations: ['Strength Training', 'Functional Training'] })],
      userContext(), [{ type: 'nutrition', relevance: 'high', reason: 'x' }],
    );
    assert.equal(candidates.length, 0);
  });
});

describe('Test H — no commercial weighting', () => {
  test('ranking is unchanged when only an (unread) commercial-style field differs between two otherwise-identical providers', () => {
    const base = { specialisations: ['Strength Training'], status: 'approved' as const };
    const providers = [
      { ...base, id: 'p-high-commission', name: 'A' },
      { ...base, id: 'p-low-commission', name: 'B' },
      // extra fields the type doesn't declare — proves the scorer has no
      // path to read them even if a caller's row object happened to carry them
    ].map(p => ({ ...p, commissionPct: p.id === 'p-high-commission' ? 50 : 1, revenueKes: p.id === 'p-high-commission' ? 999999 : 1 })) as unknown as ProviderCandidateRow[];

    const candidates = buildPersonalTrainerCandidates(providers, userContext({ goal: 'build_muscle' }), undefined);
    assert.equal(candidates[0].scoring.overall, candidates[1].scoring.overall);
  });
});

describe('Test Q — PT not forced', () => {
  test('an advanced/confident user with no goal/activity overlap and no support opportunity yields zero PT candidates — a provider is never surfaced just because one exists', () => {
    const candidates = buildPersonalTrainerCandidates(
      [provider({ specialisations: ['Dance'] })],
      userContext({ goal: 'reduce_stress', experience: 'advanced' }), undefined,
    );
    assert.equal(candidates.length, 0);
  });
});

describe('Test R — personal_training preference alone must not raise support relevance to HIGH', () => {
  test('preferredActivities containing "personal_training" alone (no real support_opportunities entry) never lifts supportFit to the HIGH-equivalent score', () => {
    const candidates = buildPersonalTrainerCandidates(
      [provider({ specialisations: ['Strength Training'] })],
      userContext({ goal: 'build_muscle', preferredActivities: ['personal_training'] }),
      undefined, // no real support_opportunities — the only legitimate source of "relevance"
    );
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].scoring.supportFit < 1); // never the HIGH-equivalent 1.0 score from preference alone
  });
});
