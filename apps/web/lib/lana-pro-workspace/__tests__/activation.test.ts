import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveProfessionalChecklist,
  deriveBusinessChecklist,
  incompleteItems,
  activationProgress,
  isFullyActivated,
  type ProfessionalActivationEvidence,
  type BusinessActivationEvidence,
} from '../activation.ts';

const proAll: ProfessionalActivationEvidence = {
  hasService: true,
  hasAvailability: true,
  hasClients: true,
  profileComplete: true,
  payoutReady: true,
};

describe('deriveProfessionalChecklist', () => {
  test('five items, done-state mirrors the evidence', () => {
    const items = deriveProfessionalChecklist({
      ...proAll, hasService: false, hasClients: false,
    });
    assert.deepEqual(items.map((i) => i.id), ['service', 'availability', 'clients', 'profile', 'payouts']);
    assert.deepEqual(items.filter((i) => !i.done).map((i) => i.id), ['service', 'clients']);
  });

  test('every href points into the workspace', () => {
    for (const i of deriveProfessionalChecklist(proAll)) {
      assert.ok(i.href.startsWith('/lana-pro/'));
    }
  });
});

describe('deriveBusinessChecklist', () => {
  const bizAll: BusinessActivationEvidence = {
    hasInventory: true,
    hasSchedule: true,
    hasTeam: true,
    teamRelevant: true,
    profileComplete: true,
    payoutReady: true,
  };

  test('team item is included only when relevant', () => {
    const withTeam = deriveBusinessChecklist(bizAll);
    assert.ok(withTeam.some((i) => i.id === 'team'));
    const noTeam = deriveBusinessChecklist({ ...bizAll, teamRelevant: false });
    assert.equal(noTeam.some((i) => i.id === 'team'), false);
  });

  test('incomplete filtering', () => {
    const items = deriveBusinessChecklist({ ...bizAll, hasSchedule: false });
    assert.deepEqual(incompleteItems(items).map((i) => i.id), ['schedule']);
  });
});

describe('progress helpers', () => {
  test('activationProgress is fraction done', () => {
    const items = deriveProfessionalChecklist({
      ...proAll, hasService: true, hasAvailability: true, hasClients: false, profileComplete: false, payoutReady: false,
    });
    assert.equal(activationProgress(items), 2 / 5);
  });

  test('isFullyActivated', () => {
    assert.equal(isFullyActivated(deriveProfessionalChecklist(proAll)), true);
    assert.equal(isFullyActivated(deriveProfessionalChecklist({ ...proAll, payoutReady: false })), false);
    assert.equal(isFullyActivated([]), false);
  });

  test('empty list → progress 1 (nothing to do)', () => {
    assert.equal(activationProgress([]), 1);
  });
});
