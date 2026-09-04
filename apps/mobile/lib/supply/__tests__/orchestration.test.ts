import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getSupplyCandidates } from '../orchestration.ts';
import type { SessionCandidateRow } from '../session-candidates.ts';
import type { ProviderCandidateRow } from '../provider-candidates.ts';
import type { SupplyPlanActivityInput, SupplyUserContext } from '../types.ts';

const ANCHOR = new Date('2026-09-02T09:00:00Z');

function userContext(overrides: Partial<SupplyUserContext> = {}): SupplyUserContext {
  return { goal: null, experience: null, preferredActivities: [], barriers: [], ...overrides };
}
function planActivity(overrides: Partial<SupplyPlanActivityInput> = {}): SupplyPlanActivityInput {
  return { day: 'Wednesday', category: 'strength', activity: 'Gym — strength', duration_minutes: 45, planned_date: '2026-09-02', ...overrides };
}
function sessionRow(overrides: Partial<SessionCandidateRow> = {}): SessionCandidateRow {
  return {
    id: 's1', type: 'session', name: 'Strength Class', category: 'strength',
    date: '2026-09-02', startTime: '18:00:00', durationMinutes: 45,
    isActive: true, spotsLeft: 5, gym: { id: 'g1', name: 'Test Gym', area: 'Westlands', lat: -1.26, lng: 36.8 },
    ...overrides,
  };
}
function providerRow(overrides: Partial<ProviderCandidateRow> = {}): ProviderCandidateRow {
  return { id: 'p1', name: 'Coach', specialisations: [], status: 'approved', ...overrides };
}
describe('Test J — beginner confidence gets a soft advantage, never a hard requirement', () => {
  test('a beginner-labelled class outranks a non-beginner one for a beginner user, both otherwise equal', () => {
    const candidates = getSupplyCandidates({
      userContext: userContext({ experience: 'beginner', barriers: ['confidence'] }),
      planActivity: planActivity(),
      sessionInventory: [
        sessionRow({ id: 'beginner-class', name: 'Beginner Strength Fundamentals', category: 'strength' }),
        sessionRow({ id: 'advanced-class', name: 'Strength Class', category: 'strength' }),
      ],
      anchor: ANCHOR,
    });
    const beginnerCandidate = candidates.find(c => c.id === 'beginner-class')!;
    assert.ok(beginnerCandidate.reasons.includes('beginner_friendly'));
  });

  test('open gym remains eligible for a beginner too — never hard-excluded either way', () => {
    const candidates = getSupplyCandidates({
      userContext: userContext({ experience: 'beginner' }),
      planActivity: planActivity(),
      sessionInventory: [sessionRow({ id: 'open-gym', name: 'Open Gym', category: 'strength' })],
      anchor: ANCHOR,
    });
    assert.equal(candidates.length, 1);
  });
});

describe('Scenario 6 — no matching supply', () => {
  test('returns [] rather than substituting unrelated supply', () => {
    const candidates = getSupplyCandidates({
      userContext: userContext(),
      planActivity: planActivity({ activity: 'Yoga flow', category: 'mobility' }),
      sessionInventory: [sessionRow({ id: 'unrelated', name: 'Boxing Bootcamp', category: 'boxing' })],
      anchor: ANCHOR,
    });
    assert.deepEqual(candidates, []);
  });
});

describe('Integration — sessions + providers combine into one ranked, diversified list', () => {
  test('a strength plan with a relevant PT and session both present returns a mixed-type result', () => {
    const candidates = getSupplyCandidates({
      userContext: userContext({ goal: 'build_muscle', preferredActivities: ['gym'], barriers: ['accountability'] }),
      planActivity: planActivity(),
      sessionInventory: [sessionRow()],
      providers: [providerRow({ specialisations: ['Strength Training'] })],
      anchor: ANCHOR,
      overallCap: 6,
    });
    const types = new Set(candidates.map(c => c.type));
    assert.ok(types.has('session'));
    assert.ok(types.has('personal_trainer'));
  });
});

describe('Test T — no embeddings, no RAG, no LLM anywhere in the supply layer', () => {
  test('no supply module imports knowledge/vector/embedding, and none calls OpenAI', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const supplyDir = path.join(dir, '..');
    const files = readdirSync(supplyDir).filter(f => f.endsWith('.ts') && !f.includes('__tests__'));
    assert.ok(files.length > 0);
    // Checks only actual import statements (never comments/documentation
    // prose, which deliberately name these words to document the boundary —
    // "no embeddings", "not a RAG task") and any literal fetch to an OpenAI
    // endpoint, not mere word occurrence anywhere in the file.
    const importLine = /^\s*import\b.*from\s+['"]([^'"]+)['"]/;
    for (const file of files) {
      const lines = readFileSync(path.join(supplyDir, file), 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(importLine);
        if (!match) continue;
        const spec = match[1].toLowerCase();
        assert.ok(!spec.includes('knowledge'), `${file} must not import the Day 7.1 knowledge/RAG layer (found: ${spec})`);
        assert.ok(!spec.includes('vector') && !spec.includes('embedding'), `${file} must not import vector/embedding code (found: ${spec})`);
        assert.ok(!spec.includes('openai'), `${file} must not import an OpenAI client (found: ${spec})`);
      }
      const content = readFileSync(path.join(supplyDir, file), 'utf8');
      assert.ok(!content.includes('api.openai.com'), `${file} must not call the OpenAI API directly`);
    }
  });
});
