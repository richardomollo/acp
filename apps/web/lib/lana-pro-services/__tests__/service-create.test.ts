import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePersistPlan,
  offeringTypeForDelivery,
  validateServiceDetails,
  serviceDetailsValid,
  buildOfferingInsert,
  buildGymServiceInsert,
  buildGymAccessInsert,
  slugify,
  type ServiceDetailsInput,
} from '../service-create.ts';

const details = (over: Partial<ServiceDetailsInput> = {}): ServiceDetailsInput => ({
  name: 'Personal Training',
  description: '',
  durationMinutes: 60,
  priceKes: 6500,
  capacity: null,
  venueId: null,
  delivery: 'venue',
  status: 'active',
  ...over,
});

describe('resolvePersistPlan — option → persistence target', () => {
  test('PT appointments → pt_offering / appointment', () => {
    for (const id of ['personal_training', 'consultation', 'assessment', 'initial_consultation', 'follow_up', 'other_appointment']) {
      const p = resolvePersistPlan(id);
      assert.equal(p.target, 'pt_offering');
      assert.equal(p.category, 'appointment');
      assert.equal(p.isScheduledClass, false);
      assert.equal(p.needsCapacity, false);
    }
  });

  test('online session → pt_offering with online type, no delivery step', () => {
    const p = resolvePersistPlan('online_consultation');
    assert.equal(p.offeringType, 'online');
    assert.equal(p.needsDeliveryStep, false);
  });

  test('studio group class → sessions, scheduled, needs capacity', () => {
    const p = resolvePersistPlan('group_class');
    assert.equal(p.target, 'session');
    assert.equal(p.isScheduledClass, true);
    assert.equal(p.needsCapacity, true);
    assert.equal(p.needsDeliveryStep, false);
  });

  test('gym / facility access → gym_access_pass / access', () => {
    assert.equal(resolvePersistPlan('gym_access').target, 'gym_access_pass');
    assert.equal(resolvePersistPlan('facility_access').category, 'access');
  });

  test('team PT → gym_service, teamDelivered', () => {
    const p = resolvePersistPlan('team_personal_training');
    assert.equal(p.target, 'gym_service');
    assert.equal(p.teamDelivered, true);
    assert.equal(p.category, 'appointment');
  });

  test('unknown id falls back to a plain appointment (never throws)', () => {
    assert.equal(resolvePersistPlan('nonsense').target, 'pt_offering');
  });
});

describe('offeringTypeForDelivery', () => {
  test('maps delivery choice to pt_offerings.type', () => {
    assert.equal(offeringTypeForDelivery('venue'), '1-on-1');
    assert.equal(offeringTypeForDelivery('online'), 'online');
    assert.equal(offeringTypeForDelivery('client_location'), 'home-visit');
    assert.equal(offeringTypeForDelivery('outdoor'), 'outdoor');
  });
});

describe('validateServiceDetails', () => {
  const apptPlan = resolvePersistPlan('personal_training');
  const classPlan = resolvePersistPlan('group_class');
  const accessPlan = resolvePersistPlan('gym_access');

  test('name required', () => {
    assert.equal(validateServiceDetails(apptPlan, details({ name: '  ' })).name, 'Give this service a name.');
  });
  test('duration required for appointments/classes, not access', () => {
    assert.ok(validateServiceDetails(apptPlan, details({ durationMinutes: 0 })).duration);
    assert.equal(validateServiceDetails(accessPlan, details({ durationMinutes: 0 })).duration, undefined);
  });
  test('capacity required for classes only', () => {
    assert.ok(validateServiceDetails(classPlan, details({ capacity: null })).capacity);
    assert.equal(validateServiceDetails(apptPlan, details({ capacity: null })).capacity, undefined);
  });
  test('negative price rejected', () => {
    assert.ok(validateServiceDetails(apptPlan, details({ priceKes: -1 })).price);
  });
  test('a clean appointment passes', () => {
    assert.equal(serviceDetailsValid(apptPlan, details()), true);
  });
  test('free (null price) is allowed', () => {
    assert.equal(serviceDetailsValid(apptPlan, details({ priceKes: null })), true);
  });
});

describe('buildOfferingInsert', () => {
  test('appointment at venue → type 1-on-1, active flags, no programme', () => {
    const row = buildOfferingInsert({
      ptId: 'pt1',
      plan: resolvePersistPlan('personal_training'),
      details: details({ venueId: 'g1' }),
      slug: 'pt-abc12',
    });
    assert.equal(row.type, '1-on-1');
    assert.equal(row.pt_id, 'pt1');
    assert.equal(row.gym_id, 'g1');
    assert.equal(row.is_draft, false);
    assert.equal(row.is_active, true);
    assert.equal(row.is_programme, false);
    assert.equal(row.max_participants, 1);
  });

  test('delivery choice drives the type', () => {
    const row = buildOfferingInsert({
      ptId: 'pt1',
      plan: resolvePersistPlan('personal_training'),
      details: details({ delivery: 'outdoor' }),
      slug: 's',
    });
    assert.equal(row.type, 'outdoor');
  });

  test('draft status → is_draft true', () => {
    const row = buildOfferingInsert({
      ptId: 'pt1',
      plan: resolvePersistPlan('consultation'),
      details: details({ status: 'draft' }),
      slug: 's',
    });
    assert.equal(row.is_draft, true);
  });
});

describe('buildGymServiceInsert / buildGymAccessInsert', () => {
  test('gym service is an appointment with capacity 1', () => {
    const row = buildGymServiceInsert({ gymId: 'g1', details: details({ name: 'Personal Training' }) });
    assert.equal(row.gym_id, 'g1');
    assert.equal(row.category, 'appointment');
    assert.equal(row.capacity, 1);
    assert.equal(row.status, 'active');
  });
  test('access pass allows null duration (all-day)', () => {
    const row = buildGymAccessInsert({ gymId: 'g1', details: details({ name: 'Open Gym', durationMinutes: 0, capacity: null }) });
    assert.equal(row.duration_minutes, null);
    assert.equal(row.name, 'Open Gym');
  });
});

describe('slugify', () => {
  test('url-safe + random suffix', () => {
    const s = slugify('Reformer Pilates!');
    assert.match(s, /^reformer-pilates-[a-z0-9]{5}$/);
  });
});
