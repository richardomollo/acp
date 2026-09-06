import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusFromOfferingFlags,
  offeringFlagsFromStatus,
  statusFromSessionGroup,
  isBookable,
  canHardDelete,
  nextStatuses,
} from '../service-status.ts';

describe('pt_offerings flags ↔ status (no schema change)', () => {
  test('is_draft=true → draft (regardless of is_active)', () => {
    assert.equal(statusFromOfferingFlags({ is_draft: true, is_active: true }), 'draft');
    assert.equal(statusFromOfferingFlags({ is_draft: true, is_active: false }), 'draft');
  });
  test('published + active → active', () => {
    assert.equal(statusFromOfferingFlags({ is_draft: false, is_active: true }), 'active');
  });
  test('published + inactive → inactive', () => {
    assert.equal(statusFromOfferingFlags({ is_draft: false, is_active: false }), 'inactive');
  });
  test('round-trips through offeringFlagsFromStatus', () => {
    for (const s of ['draft', 'active', 'inactive'] as const) {
      assert.equal(statusFromOfferingFlags(offeringFlagsFromStatus(s)), s);
    }
  });
});

describe('session group status', () => {
  test('no active rows → inactive', () => {
    assert.equal(statusFromSessionGroup({ anyActive: false, futureOccurrences: 5 }), 'inactive');
  });
  test('active but nothing scheduled ahead → inactive', () => {
    assert.equal(statusFromSessionGroup({ anyActive: true, futureOccurrences: 0 }), 'inactive');
  });
  test('active with future occurrences → active', () => {
    assert.equal(statusFromSessionGroup({ anyActive: true, futureOccurrences: 3 }), 'active');
  });
});

describe('bookability is separate from marketplace verification (§11)', () => {
  test('only active is bookable from the workspace', () => {
    assert.equal(isBookable('active'), true);
    assert.equal(isBookable('draft'), false);
    assert.equal(isBookable('inactive'), false);
  });
});

describe('safe deletion (§16)', () => {
  test('draft with no bookings can be hard-deleted', () => {
    assert.equal(canHardDelete({ status: 'draft', hasBookings: false }), true);
  });
  test('anything with bookings is never hard-deleted', () => {
    assert.equal(canHardDelete({ status: 'draft', hasBookings: true }), false);
    assert.equal(canHardDelete({ status: 'active', hasBookings: false }), false);
    assert.equal(canHardDelete({ status: 'inactive', hasBookings: true }), false);
  });
});

describe('nextStatuses', () => {
  test('draft → active; active → inactive; inactive → active', () => {
    assert.deepEqual(nextStatuses('draft'), ['active']);
    assert.deepEqual(nextStatuses('active'), ['inactive']);
    assert.deepEqual(nextStatuses('inactive'), ['active']);
  });
});
