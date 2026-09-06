import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toIso,
  ptBookingToTodayItem,
  sessionToTodayItem,
  sortTodayItems,
  isSameDay,
  splitToday,
  type TodayItem,
} from '../today.ts';

describe('toIso', () => {
  test('pads HH:MM to HH:MM:SS', () => {
    assert.equal(toIso('2026-09-06', '09:00'), '2026-09-06T09:00:00');
  });
  test('missing time → midnight', () => {
    assert.equal(toIso('2026-09-06', null), '2026-09-06T00:00:00');
    assert.equal(toIso('2026-09-06', ''), '2026-09-06T00:00:00');
  });
  test('already HH:MM:SS is kept', () => {
    assert.equal(toIso('2026-09-06', '17:30:45'), '2026-09-06T17:30:45');
  });
});

describe('ptBookingToTodayItem', () => {
  test('maps an appointment with client + duration', () => {
    const item = ptBookingToTodayItem({
      id: 'b1',
      scheduled_date: '2026-09-06',
      scheduled_time: '09:00',
      status: 'confirmed',
      users: { full_name: 'James Mwangi' },
      pt_offerings: { title: 'Personal Training', duration_minutes: 60 },
    });
    assert.equal(item.kind, 'appointment');
    assert.equal(item.title, 'Personal Training');
    assert.equal(item.startAt, '2026-09-06T09:00:00');
    assert.equal(item.endAt, '2026-09-06T10:00:00');
    assert.equal(item.clientName, 'James Mwangi');
    assert.equal(item.status, 'confirmed');
    assert.equal(item.href, '/lana-pro/bookings#b1');
  });

  test('falls back to email local-part and "Session" title', () => {
    const item = ptBookingToTodayItem({
      id: 'b2', scheduled_date: '2026-09-06', scheduled_time: '11:30',
      users: { email: 'sarah@example.com' }, pt_offerings: null,
    });
    assert.equal(item.title, 'Session');
    assert.equal(item.clientName, 'sarah');
    assert.equal(item.endAt, undefined); // no duration
  });
});

describe('sessionToTodayItem', () => {
  test('maps a class with capacity + booked count', () => {
    const item = sessionToTodayItem(
      { id: 's1', date: '2026-09-06', time: '17:00', name: 'Strength Basics', max_capacity: 8, instructor: 'Sarah' },
      5,
    );
    assert.equal(item.kind, 'class');
    assert.equal(item.title, 'Strength Basics');
    assert.equal(item.bookedCount, 5);
    assert.equal(item.capacity, 8);
    assert.equal(item.providerName, 'Sarah');
  });
});

describe('sortTodayItems', () => {
  test('chronological, id-tiebroken (deterministic)', () => {
    const items: TodayItem[] = [
      { id: 'z', kind: 'class', title: 'C', startAt: '2026-09-06T09:00:00', href: '#' },
      { id: 'a', kind: 'class', title: 'A', startAt: '2026-09-06T09:00:00', href: '#' },
      { id: 'm', kind: 'appointment', title: 'M', startAt: '2026-09-06T08:00:00', href: '#' },
    ];
    assert.deepEqual(sortTodayItems(items).map((i) => i.id), ['m', 'a', 'z']);
  });
  test('does not mutate the input', () => {
    const items: TodayItem[] = [
      { id: 'b', kind: 'class', title: 'B', startAt: '2026-09-06T10:00:00', href: '#' },
      { id: 'a', kind: 'class', title: 'A', startAt: '2026-09-06T09:00:00', href: '#' },
    ];
    sortTodayItems(items);
    assert.equal(items[0].id, 'b');
  });
});

describe('isSameDay', () => {
  test('prefix compare, no timezone math', () => {
    assert.equal(isSameDay('2026-09-06T23:59:00', '2026-09-06T00:01:00'), true);
    assert.equal(isSameDay('2026-09-07T00:00:00', '2026-09-06T23:59:00'), false);
  });
});

describe('splitToday', () => {
  const mk = (id: string, at: string, kind: TodayItem['kind'] = 'appointment'): TodayItem => ({
    id, kind, title: id, startAt: at, href: '#',
  });

  test('today list + next upcoming + remaining count', () => {
    const now = '2026-09-06T10:00:00';
    const items = [
      mk('past', '2026-09-06T08:00:00'),
      mk('soon', '2026-09-06T11:30:00'),
      mk('later', '2026-09-06T17:00:00'),
      mk('tomorrow', '2026-09-07T09:00:00'),
    ];
    const s = splitToday(items, now);
    assert.deepEqual(s.today.map((i) => i.id), ['past', 'soon', 'later']);
    assert.equal(s.next?.id, 'soon');
    assert.equal(s.remainingToday, 2);
  });

  test('when everything today is over, NEXT falls back to the last item today', () => {
    const now = '2026-09-06T20:00:00';
    const items = [mk('a', '2026-09-06T08:00:00'), mk('b', '2026-09-06T17:00:00')];
    const s = splitToday(items, now);
    assert.equal(s.next?.id, 'b');
    assert.equal(s.remainingToday, 0);
  });

  test('empty → no next, no remaining', () => {
    const s = splitToday([], '2026-09-06T10:00:00');
    assert.equal(s.next, null);
    assert.equal(s.today.length, 0);
    assert.equal(s.remainingToday, 0);
  });

  test('only future days → next is the soonest future item, today is empty', () => {
    const s = splitToday([mk('f', '2026-09-08T09:00:00')], '2026-09-06T10:00:00');
    assert.equal(s.today.length, 0);
    assert.equal(s.next?.id, 'f');
  });
});
