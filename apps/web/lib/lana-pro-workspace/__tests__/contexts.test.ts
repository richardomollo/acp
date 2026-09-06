import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceContexts,
  resolveActiveContext,
  navForContextKind,
  applyContextToCapabilities,
  type ContextInput,
} from '../contexts.ts';
import { deriveWorkspaceCapabilities } from '../capabilities.ts';

const empty: ContextInput = { pt: null, gyms: [], employments: [] };

describe('buildWorkspaceContexts', () => {
  test('A. independent only → one practice context', () => {
    const c = buildWorkspaceContexts({ ...empty, pt: { id: 'pt1', displayName: 'Amina K' } });
    assert.deepEqual(c.map((x) => x.id), ['practice']);
    assert.equal(c[0].kind, 'independent');
    assert.equal(c[0].label, 'My practice');
  });

  test('B. employed only → one employed context', () => {
    const c = buildWorkspaceContexts({
      ...empty,
      employments: [{ gymTrainerId: 'gt1', gymId: 'g1', gymName: 'Lana Fitness' }],
    });
    assert.deepEqual(c.map((x) => x.id), ['emp:gt1']);
    assert.equal(c[0].kind, 'employed');
    assert.equal(c[0].label, 'Lana Fitness — Professional');
  });

  test('C. independent + one employment → practice first, then employed', () => {
    const c = buildWorkspaceContexts({
      pt: { id: 'pt1', displayName: 'Carol' },
      gyms: [],
      employments: [{ gymTrainerId: 'gt1', gymId: 'g1', gymName: 'Lana Fitness' }],
    });
    assert.deepEqual(c.map((x) => x.id), ['practice', 'emp:gt1']);
  });

  test('D. independent + two employments', () => {
    const c = buildWorkspaceContexts({
      pt: { id: 'pt1', displayName: 'Carol' },
      gyms: [],
      employments: [
        { gymTrainerId: 'gt1', gymId: 'g1', gymName: 'Lana Fitness' },
        { gymTrainerId: 'gt2', gymId: 'g2', gymName: 'FitLab' },
      ],
    });
    assert.deepEqual(c.map((x) => x.id), ['practice', 'emp:gt1', 'emp:gt2']);
    assert.deepEqual(c.map((x) => x.label), [
      'My practice',
      'Lana Fitness — Professional',
      'FitLab — Professional',
    ]);
  });

  test('E. venue owner + professional → practice then business', () => {
    const c = buildWorkspaceContexts({
      pt: { id: 'pt1', displayName: 'Owner PT' },
      gyms: [{ id: 'g1', name: 'Zawadi Gym' }],
      employments: [],
    });
    assert.deepEqual(c.map((x) => x.id), ['practice', 'gym:g1']);
    assert.equal(c[1].kind, 'business');
    assert.equal(c[1].label, 'Zawadi Gym — Business');
  });

  test('F. owner + professional + employment elsewhere → all three', () => {
    const c = buildWorkspaceContexts({
      pt: { id: 'pt1', displayName: 'Carol' },
      gyms: [{ id: 'g1', name: 'Zawadi Gym' }],
      employments: [{ gymTrainerId: 'gt9', gymId: 'g2', gymName: 'FitLab' }],
    });
    assert.deepEqual(c.map((x) => x.id), ['practice', 'gym:g1', 'emp:gt9']);
  });

  test('an employment at a venue the user OWNS is folded into the business context', () => {
    const c = buildWorkspaceContexts({
      pt: null,
      gyms: [{ id: 'g1', name: 'Zawadi Gym' }],
      employments: [{ gymTrainerId: 'gt1', gymId: 'g1', gymName: 'Zawadi Gym' }],
    });
    assert.deepEqual(c.map((x) => x.id), ['gym:g1']);
  });
});

describe('resolveActiveContext', () => {
  const opts = buildWorkspaceContexts({
    pt: { id: 'pt1', displayName: 'Carol' },
    gyms: [],
    employments: [{ gymTrainerId: 'gt1', gymId: 'g1', gymName: 'Lana Fitness' }],
  });

  test('no request → first', () => {
    assert.equal(resolveActiveContext(opts)?.id, 'practice');
  });
  test('valid request → that one', () => {
    assert.equal(resolveActiveContext(opts, 'emp:gt1')?.id, 'emp:gt1');
  });
  test('stale/unknown request → falls back to first (cannot bypass)', () => {
    assert.equal(resolveActiveContext(opts, 'emp:deleted')?.id, 'practice');
  });
  test('empty options → null', () => {
    assert.equal(resolveActiveContext([], 'practice'), null);
  });
});

describe('navForContextKind', () => {
  test('independent', () => {
    assert.deepEqual(navForContextKind('independent'), ['home', 'clients', 'bookings', 'services', 'schedule', 'profile']);
  });
  test('business', () => {
    assert.deepEqual(navForContextKind('business'), ['home', 'bookings', 'services', 'schedule', 'team', 'business']);
  });
  test('employed — no services / team / business', () => {
    assert.deepEqual(navForContextKind('employed'), ['home', 'clients', 'bookings', 'schedule', 'profile']);
  });
});

describe('applyContextToCapabilities', () => {
  const base = deriveWorkspaceCapabilities({
    hasProfessionalProfile: true,
    professionalStatus: 'approved',
    ownsBusiness: true,
    businessTypes: ['gym'],
    anyVenueActive: true,
    employsTrainers: true,
    isStaffTrainer: false,
  });

  test('business context → business nav + variant', () => {
    const c = applyContextToCapabilities(base, {
      id: 'gym:g1', kind: 'business', label: 'x', displayName: 'x', gymId: 'g1',
    });
    assert.equal(c.homeVariant, 'business');
    assert.ok(c.nav.includes('team'));
    assert.equal(c.showServices, true);
  });

  test('employed context → staff nav, no services/team, professional Home', () => {
    const c = applyContextToCapabilities(base, {
      id: 'emp:gt1', kind: 'employed', label: 'x', displayName: 'x', gymTrainerId: 'gt1',
    });
    assert.equal(c.homeVariant, 'professional');
    assert.equal(c.showServices, false);
    assert.equal(c.showTeam, false);
    assert.ok(!c.nav.includes('services'));
    assert.ok(!c.nav.includes('business'));
  });

  test('needsOnboarding base is never overridden', () => {
    const ob = deriveWorkspaceCapabilities({
      hasProfessionalProfile: false, professionalStatus: null, ownsBusiness: false,
      businessTypes: [], anyVenueActive: false, employsTrainers: false, isStaffTrainer: false,
    });
    const c = applyContextToCapabilities(ob, null);
    assert.equal(c.needsOnboarding, true);
  });
});
