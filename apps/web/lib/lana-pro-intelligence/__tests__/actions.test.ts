import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSuggestedActions, primaryAction, type ActionContext } from '../actions.ts';

const base: ActionContext = {
  clientId: 'c1',
  nextSession: null,
  followUpDue: false,
  hasUpcomingBooking: false,
  hasCompletedSessions: false,
  relationship: 'active',
  surface: 'detail',
};

const SUPPORTED_ROUTES = [/^\/lana-pro\/clients\/[^/]+$/, /^\/lana-pro\/bookings\/(appointment|venue)\/[^/]+\/session$/, /^\/lana-pro\/bookings\/new$/];
function routeSupported(href: string) {
  return SUPPORTED_ROUTES.some((re) => re.test(href));
}

describe('deriveSuggestedActions', () => {
  test('active client with nothing → just View client', () => {
    const a = deriveSuggestedActions(base);
    assert.deepEqual(a.map((x) => x.id), ['view_client']);
    assert.equal(a[0].href, '/lana-pro/clients/c1');
  });

  test('imminent session → Prepare for session is primary', () => {
    const a = deriveSuggestedActions({
      ...base,
      nextSession: { source: 'appointment', bookingId: 'b9', withinPrepWindow: true },
    });
    assert.equal(a[0].id, 'prepare_for_session');
    assert.equal(a[0].href, '/lana-pro/bookings/appointment/b9/session');
    assert.equal(primaryAction(a)?.id, 'prepare_for_session');
  });

  test('session outside the prep window → no prepare action', () => {
    const a = deriveSuggestedActions({
      ...base,
      nextSession: { source: 'venue', bookingId: 'b9', withinPrepWindow: false },
    });
    assert.equal(a.some((x) => x.id === 'prepare_for_session'), false);
  });

  test('follow-up due → Book a session offered', () => {
    const a = deriveSuggestedActions({ ...base, followUpDue: true });
    assert.equal(a.some((x) => x.id === 'book_client'), true);
    assert.match(a.find((x) => x.id === 'book_client')!.rationale!, /follow-up/i);
  });

  test('completed history but nothing upcoming → Book a session', () => {
    const a = deriveSuggestedActions({ ...base, hasCompletedSessions: true, hasUpcomingBooking: false });
    assert.equal(a.some((x) => x.id === 'book_client'), true);
  });

  test('completed history WITH an upcoming booking → no book_client nag', () => {
    const a = deriveSuggestedActions({ ...base, hasCompletedSessions: true, hasUpcomingBooking: true });
    assert.equal(a.some((x) => x.id === 'book_client'), false);
  });

  test('home surface caps at 2; detail at 3; no duplicate ids', () => {
    const ctx: ActionContext = {
      ...base,
      nextSession: { source: 'appointment', bookingId: 'b', withinPrepWindow: true },
      followUpDue: true,
      hasCompletedSessions: true,
    };
    const home = deriveSuggestedActions({ ...ctx, surface: 'home' });
    const detail = deriveSuggestedActions({ ...ctx, surface: 'detail' });
    assert.ok(home.length <= 2);
    assert.ok(detail.length <= 3);
    assert.equal(new Set(detail.map((x) => x.id)).size, detail.length);
  });

  test('non-active relationship → no prepare/book; home shows nothing', () => {
    assert.deepEqual(deriveSuggestedActions({ ...base, relationship: 'pending', surface: 'home' }), []);
    assert.deepEqual(
      deriveSuggestedActions({ ...base, relationship: 'pending', surface: 'detail' }).map((x) => x.id),
      ['view_client'],
    );
  });

  test('every emitted href is a route Lana Pro actually supports', () => {
    const variants: ActionContext[] = [
      base,
      { ...base, nextSession: { source: 'appointment', bookingId: 'b', withinPrepWindow: true } },
      { ...base, nextSession: { source: 'venue', bookingId: 'b', withinPrepWindow: true } },
      { ...base, followUpDue: true },
      { ...base, hasCompletedSessions: true },
      { ...base, relationship: 'inactive' },
    ];
    for (const v of variants) {
      for (const a of deriveSuggestedActions(v)) assert.ok(routeSupported(a.href), a.href);
    }
  });
});
