import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveWorkspaceCapabilities,
  navItemsFor,
  type WorkspaceIdentityInput,
} from '../capabilities.ts';

const base: WorkspaceIdentityInput = {
  hasProfessionalProfile: false,
  professionalStatus: null,
  ownsBusiness: false,
  businessTypes: [],
  anyVenueActive: false,
  employsTrainers: false,
  isStaffTrainer: false,
};

describe('deriveWorkspaceCapabilities — nav shape per account type', () => {
  test('solo PT (approved): Home, Clients, Bookings, Services, Schedule, Profile', () => {
    const c = deriveWorkspaceCapabilities({
      ...base, hasProfessionalProfile: true, professionalStatus: 'approved',
    });
    assert.deepEqual(c.nav, ['home', 'clients', 'bookings', 'services', 'schedule', 'profile']);
    assert.equal(c.homeVariant, 'professional');
    assert.equal(c.marketplaceGated, false);
    assert.equal(c.needsOnboarding, false);
  });

  test('solo PT (pending): identical nav, but marketplaceGated', () => {
    const c = deriveWorkspaceCapabilities({
      ...base, hasProfessionalProfile: true, professionalStatus: 'pending',
    });
    assert.deepEqual(c.nav, ['home', 'clients', 'bookings', 'services', 'schedule', 'profile']);
    assert.equal(c.marketplaceGated, true);
  });

  test('nutritionist is not modelled specially — same as any professional', () => {
    const pt = deriveWorkspaceCapabilities({ ...base, hasProfessionalProfile: true, professionalStatus: 'approved' });
    const nutritionist = deriveWorkspaceCapabilities({
      ...base, hasProfessionalProfile: true, professionalStatus: 'approved', businessTypes: [],
    });
    assert.deepEqual(pt.nav, nutritionist.nav);
  });

  test('class-only studio: no Clients, has Team + Business', () => {
    const c = deriveWorkspaceCapabilities({
      ...base, ownsBusiness: true, businessTypes: ['pilates'], anyVenueActive: true, employsTrainers: false,
    });
    assert.deepEqual(c.nav, ['home', 'bookings', 'services', 'schedule', 'team', 'business']);
    assert.equal(c.showClients, false);
    assert.equal(c.homeVariant, 'business');
  });

  test('gym with employed PTs: Clients appears', () => {
    const c = deriveWorkspaceCapabilities({
      ...base, ownsBusiness: true, businessTypes: ['gym'], anyVenueActive: true, employsTrainers: true,
    });
    assert.deepEqual(c.nav, ['home', 'clients', 'bookings', 'services', 'schedule', 'team', 'business']);
    assert.equal(c.showClients, true);
  });

  test('business with no active venue is marketplaceGated', () => {
    const c = deriveWorkspaceCapabilities({ ...base, ownsBusiness: true, anyVenueActive: false });
    assert.equal(c.marketplaceGated, true);
  });

  test('hybrid (PT + venue): union nav, professional Home', () => {
    const c = deriveWorkspaceCapabilities({
      ...base, hasProfessionalProfile: true, professionalStatus: 'approved',
      ownsBusiness: true, anyVenueActive: true,
    });
    assert.deepEqual(c.nav, ['home', 'clients', 'bookings', 'services', 'schedule', 'team', 'business']);
    assert.equal(c.homeVariant, 'professional');
    assert.equal(c.primaryRole, 'professional');
  });

  test('staff trainer only: Clients + Bookings + Schedule, no Services, no Team, not gated', () => {
    const c = deriveWorkspaceCapabilities({ ...base, isStaffTrainer: true });
    assert.deepEqual(c.nav, ['home', 'clients', 'bookings', 'schedule', 'profile']);
    assert.equal(c.showServices, false);
    assert.equal(c.showTeam, false);
    assert.equal(c.marketplaceGated, false);
  });

  test('nothing at all → needsOnboarding, nav is just Home', () => {
    const c = deriveWorkspaceCapabilities(base);
    assert.equal(c.needsOnboarding, true);
    assert.deepEqual(c.nav, ['home']);
  });

  test('irrelevant modules are never shown (Team hidden for solo PT)', () => {
    const c = deriveWorkspaceCapabilities({ ...base, hasProfessionalProfile: true, professionalStatus: 'approved' });
    assert.equal(c.nav.includes('team'), false);
    assert.equal(c.nav.includes('business'), false);
  });
});

describe('navItemsFor', () => {
  test('maps ids to labels + hrefs in order', () => {
    const c = deriveWorkspaceCapabilities({ ...base, hasProfessionalProfile: true, professionalStatus: 'approved' });
    const items = navItemsFor(c);
    assert.deepEqual(items[0], { id: 'home', label: 'Home', href: '/lana-pro/home' });
    assert.deepEqual(items.map((i) => i.id), c.nav);
    assert.ok(items.every((i) => i.href.startsWith('/lana-pro/')));
  });
});
