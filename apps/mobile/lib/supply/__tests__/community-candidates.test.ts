import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityCandidates, type CommunityCandidateRow } from '../community-candidates.ts';
import type { SupplyUserContext } from '../types.ts';

function userContext(overrides: Partial<SupplyUserContext> = {}): SupplyUserContext {
  return { goal: null, experience: null, preferredActivities: [], barriers: [], ...overrides };
}

function community(overrides: Partial<CommunityCandidateRow> = {}): CommunityCandidateRow {
  return { id: 'c1', name: 'Walking Club', category: 'walking', location: 'Nairobi', isActive: true, reviewStatus: 'approved', communityType: 'open', ...overrides };
}

describe('Test A — inactive supply excluded (community variant)', () => {
  test('an inactive community is never a candidate', () => {
    const candidates = buildCommunityCandidates([community({ isActive: false })], userContext({ preferredActivities: ['walking'] }), ['walking']);
    assert.equal(candidates.length, 0);
  });

  test('a pending (not yet approved) community is never a candidate', () => {
    const candidates = buildCommunityCandidates([community({ reviewStatus: 'pending' })], userContext({ preferredActivities: ['walking'] }), ['walking']);
    assert.equal(candidates.length, 0);
  });
});

describe('Test K — accountability community', () => {
  test('accountability barrier + walking preference ranks the relevant walking community strongly', () => {
    const candidates = buildCommunityCandidates(
      [community({ id: 'walking-club', category: 'walking' })],
      userContext({ preferredActivities: ['walking'], barriers: ['accountability'] }),
      ['walking'],
    );
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].reasons.includes('accountability_support'));
    assert.ok(candidates[0].reasons.includes('activity_match'));
  });

  test('an unrelated community (no activity match, no barrier signal) is never surfaced', () => {
    const candidates = buildCommunityCandidates(
      [community({ id: 'boxing-club', category: 'boxing' })],
      userContext({ preferredActivities: ['walking'] }),
      ['walking'],
    );
    assert.equal(candidates.length, 0);
  });
});

describe('community_type friction', () => {
  test('approval_required communities score lower availabilityFit than open ones, all else equal', () => {
    const open = buildCommunityCandidates([community({ id: 'open', communityType: 'open' })], userContext({ barriers: ['accountability'] }), ['walking']);
    const gated = buildCommunityCandidates([community({ id: 'gated', communityType: 'approval_required' })], userContext({ barriers: ['accountability'] }), ['walking']);
    assert.ok(open[0].scoring.availabilityFit > gated[0].scoring.availabilityFit);
  });
});
