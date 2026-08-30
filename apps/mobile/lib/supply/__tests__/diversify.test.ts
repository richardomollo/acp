import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diversifySupplyCandidates } from '../diversify.ts';
import type { SupplyCandidate, SupplyCandidateType } from '../types.ts';

function candidate(id: string, type: SupplyCandidateType, overall: number): SupplyCandidate {
  return {
    id, type, title: id,
    navigationTarget: { pathname: '/x', params: {} },
    scoring: { eligibility: true, activityFit: 0, scheduleFit: 0, goalFit: 0, supportFit: 0, availabilityFit: 0, locationFit: 0, overall },
    reasons: [],
  };
}

describe('Test P — diversified output', () => {
  test('five strong sessions do not crowd out a single strong PT and community when both are relevant', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => candidate(`s${i}`, 'session', 0.9 - i * 0.01));
    const pt = candidate('pt1', 'personal_trainer', 0.5);
    const community = candidate('c1', 'community', 0.4);
    const result = diversifySupplyCandidates([...sessions, pt, community], { limitPerType: 5, overallCap: 4 });
    const types = new Set(result.map(c => c.type));
    assert.ok(types.has('personal_trainer'));
    assert.ok(types.has('community'));
  });

  test('a clearly superior candidate is never bumped purely to force variety', () => {
    // Only one type present — diversification must never invent artificial exclusions.
    const sessions = Array.from({ length: 3 }, (_, i) => candidate(`s${i}`, 'session', 0.9 - i * 0.1));
    const result = diversifySupplyCandidates(sessions, { limitPerType: 5, overallCap: 5 });
    assert.deepEqual(result.map(c => c.id), ['s0', 's1', 's2']);
  });
});

describe('Test O — deterministic ordering (diversification variant)', () => {
  test('identical input always produces identical output order', () => {
    const input = [candidate('a', 'session', 0.5), candidate('b', 'community', 0.5), candidate('c', 'personal_trainer', 0.5)];
    const r1 = diversifySupplyCandidates(input, { overallCap: 3 }).map(c => c.id);
    const r2 = diversifySupplyCandidates(input, { overallCap: 3 }).map(c => c.id);
    assert.deepEqual(r1, r2);
  });
});

describe('per-type cap', () => {
  test('limitPerType truncates before diversification even considers the overflow', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => candidate(`s${i}`, 'session', 0.9 - i * 0.01));
    const result = diversifySupplyCandidates(sessions, { limitPerType: 3, overallCap: 10 });
    assert.equal(result.length, 3);
  });
});
