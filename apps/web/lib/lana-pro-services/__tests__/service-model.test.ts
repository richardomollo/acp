import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseOffering,
  normaliseOfferings,
  normaliseSessionGroup,
  normaliseSessions,
  normaliseGymService,
  normaliseGymAccess,
  assembleServices,
  groupServicesByStatus,
  hasAnyActiveService,
  sessionGroupKey,
  formatPrice,
  serviceSummaryLine,
  type OfferingRow,
  type SessionRow,
} from '../service-model.ts';

const TODAY = '2026-09-09';

const offering = (over: Partial<OfferingRow> = {}): OfferingRow => ({
  id: 'o1',
  title: 'Personal Training',
  description: null,
  type: '1-on-1',
  duration_minutes: 60,
  price_kes: 6500,
  max_participants: 1,
  gym_id: null,
  is_active: true,
  is_draft: false,
  is_programme: false,
  ...over,
});

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 's1',
  gym_id: 'g1',
  name: 'Reformer Pilates',
  description: null,
  date: '2026-09-10',
  time: '18:00:00',
  duration_minutes: 50,
  max_capacity: 8,
  category: 'pilates',
  instructor_id: null,
  drop_in_price: 2200,
  is_active: true,
  ...over,
});

describe('normaliseOffering', () => {
  test('1-on-1 → appointment / in_person', () => {
    const s = normaliseOffering(offering())!;
    assert.equal(s.category, 'appointment');
    assert.deepEqual(s.deliveryModes, ['in_person']);
    assert.equal(s.status, 'active');
    assert.equal(s.price, 6500);
    assert.equal(s.id, 'off:o1');
  });

  test('type → category/mode mapping', () => {
    assert.equal(normaliseOffering(offering({ type: 'online' }))!.deliveryModes[0], 'online');
    assert.equal(normaliseOffering(offering({ type: 'outdoor' }))!.deliveryModes[0], 'outdoor');
    assert.equal(normaliseOffering(offering({ type: 'home-visit' }))!.deliveryModes[0], 'client_location');
    assert.equal(normaliseOffering(offering({ type: 'group' }))!.category, 'class');
    assert.equal(normaliseOffering(offering({ type: 'drop-in' }))!.category, 'class');
  });

  test('PROGRAMME rows are dropped — never a sellable service (§2/§16)', () => {
    assert.equal(normaliseOffering(offering({ is_programme: true })), null);
    const list = normaliseOfferings([offering({ id: 'a' }), offering({ id: 'b', is_programme: true }), offering({ id: 'c' })]);
    assert.deepEqual(list.map((s) => s.sourceId), ['a', 'c']);
  });

  test('unknown type is dropped, not guessed', () => {
    assert.equal(normaliseOffering(offering({ type: 'experience' })), null);
  });

  test('draft / inactive statuses', () => {
    assert.equal(normaliseOffering(offering({ is_draft: true }))!.status, 'draft');
    assert.equal(normaliseOffering(offering({ is_draft: false, is_active: false }))!.status, 'inactive');
  });

  test('string price is coerced; empty → Free', () => {
    assert.equal(normaliseOffering(offering({ price_kes: '5000' }))!.price, 5000);
    assert.equal(normaliseOffering(offering({ price_kes: null }))!.price, null);
  });

  test('capacity only carried for classes', () => {
    assert.equal(normaliseOffering(offering({ type: '1-on-1', max_participants: 1 }))!.capacity, null);
    assert.equal(normaliseOffering(offering({ type: 'group', max_participants: 12 }))!.capacity, 12);
  });
});

describe('normaliseSessionGroup / normaliseSessions', () => {
  test('a group of sessions → one class service with occurrence counts', () => {
    const rows = [
      session({ id: 's1', date: '2026-09-03' }), // past
      session({ id: 's2', date: '2026-09-10' }), // future
      session({ id: 's3', date: '2026-09-17' }), // future
    ];
    const svc = normaliseSessionGroup(rows, TODAY)!;
    assert.equal(svc.category, 'class');
    assert.equal(svc.capacity, 8);
    assert.equal(svc.price, 2200);
    assert.deepEqual(svc.occurrences, { total: 3, future: 2 });
    assert.equal(svc.status, 'active'); // active + future occurrences
    assert.equal(svc.venueIds[0], 'g1');
  });

  test('class with only past occurrences → inactive', () => {
    const svc = normaliseSessionGroup([session({ date: '2026-01-01' })], TODAY)!;
    assert.equal(svc.status, 'inactive');
  });

  test('team-delivered when instructor_id present', () => {
    const svc = normaliseSessionGroup([session({ instructor_id: 'gt1' }), session({ id: 's2', instructor_id: 'gt1' })], TODAY)!;
    assert.equal(svc.teamDelivered, true);
    assert.deepEqual(svc.providerIds, ['gt1']);
  });

  test('normaliseSessions groups by name|time|category', () => {
    const rows = [
      session({ id: 'a', name: 'Reformer', time: '18:00:00', date: '2026-09-10' }),
      session({ id: 'b', name: 'Reformer', time: '18:00:00', date: '2026-09-17' }),
      session({ id: 'c', name: 'Mat Pilates', time: '10:00:00', date: '2026-09-11' }),
    ];
    const svcs = normaliseSessions(rows, TODAY);
    assert.equal(svcs.length, 2);
    const reformer = svcs.find((s) => s.name === 'Reformer')!;
    assert.equal(reformer.occurrences!.total, 2);
  });

  test('sessionGroupKey is name+time+category', () => {
    assert.equal(
      sessionGroupKey({ name: ' Reformer ', time: '18:00:00', category: 'pilates' }),
      'reformer|18:00|pilates',
    );
  });
});

describe('gym_service / gym_access normalisers', () => {
  test('gym team appointment', () => {
    const s = normaliseGymService({
      id: 'gs1', gym_id: 'g1', name: 'Personal Training', description: null,
      duration_minutes: 60, price_kes: 6000, capacity: 1, status: 'active', provider_ids: ['gt1', 'gt2'],
    });
    assert.equal(s.category, 'appointment');
    assert.equal(s.teamDelivered, true);
    assert.deepEqual(s.providerIds, ['gt1', 'gt2']);
    assert.equal(s.id, 'gsv:gs1');
  });

  test('gym access pass', () => {
    const s = normaliseGymAccess({
      id: 'a1', gym_id: 'g1', name: 'Open Gym', description: 'Day pass',
      duration_minutes: null, price_kes: 1500, capacity: null, status: 'active',
    });
    assert.equal(s.category, 'access');
    assert.equal(s.id, 'acc:a1');
    assert.equal(s.status, 'active');
  });

  test('unknown status defaults to draft (never bookable)', () => {
    const s = normaliseGymAccess({
      id: 'a2', gym_id: 'g1', name: 'X', description: null, duration_minutes: null,
      price_kes: null, capacity: null, status: 'weird',
    });
    assert.equal(s.status, 'draft');
  });
});

describe('assembleServices + grouping', () => {
  test('all four sources normalise into one list; programmes excluded', () => {
    const services = assembleServices({
      todayStr: TODAY,
      offerings: [offering({ id: 'o1' }), offering({ id: 'o2', is_programme: true }), offering({ id: 'o3', is_draft: true })],
      sessions: [session({ id: 's1', date: '2026-09-20' })],
      gymServices: [{ id: 'gs1', gym_id: 'g1', name: 'PT', description: null, duration_minutes: 60, price_kes: 6000, capacity: 1, status: 'inactive' }],
      gymAccess: [{ id: 'a1', gym_id: 'g1', name: 'Open Gym', description: null, duration_minutes: null, price_kes: 1500, capacity: null, status: 'active' }],
    });
    // o1 (active), o3 (draft), 1 session-group (active), gs1 (inactive), a1 (active) — programme o2 dropped
    assert.equal(services.length, 5);
    const grouped = groupServicesByStatus(services);
    assert.equal(grouped.active.length, 3);
    assert.deepEqual(grouped.drafts.map((s) => s.sourceId), ['o3']);
    assert.deepEqual(grouped.inactive.map((s) => s.sourceId), ['gs1']);
    assert.equal(hasAnyActiveService(services), true);
    assert.equal(services.some((s) => s.sourceId === 'o2'), false); // programme never present
  });

  test('empty sources → empty list', () => {
    assert.deepEqual(assembleServices({ todayStr: TODAY }), []);
    assert.equal(hasAnyActiveService([]), false);
  });
});

describe('formatting', () => {
  test('formatPrice', () => {
    assert.equal(formatPrice(6500), 'KES 6,500');
    assert.equal(formatPrice(null), 'Free');
  });
  test('serviceSummaryLine', () => {
    assert.equal(serviceSummaryLine(normaliseOffering(offering())!), '1-to-1 · 60 min');
    assert.equal(
      serviceSummaryLine(normaliseSessionGroup([session({ max_capacity: 8, duration_minutes: 50 })], TODAY)!),
      'Class · 50 min · capacity 8',
    );
  });
});
