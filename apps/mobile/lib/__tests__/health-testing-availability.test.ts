import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHealthTestingAvailability, healthTestingBody, HEALTH_TESTING_COPY,
  HEALTH_TESTING_SUPPORTED_MARKETS,
} from '../health-testing-availability.ts';

// Beta Feedback #019C — health testing is capability-specific: never derived
// from #019 fitness marketplace availability, and never claims a Kenyan city
// to a user who isn't there.

describe('§10 — Amsterdam + no testing inventory → not available in Amsterdam, no Kenya claim', () => {
  test('coming_soon, body names Amsterdam only', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: 'Amsterdam', hasLocation: true });
    assert.equal(r.status, 'coming_soon');
    const body = healthTestingBody(r.status, r.locationLabel);
    assert.match(body, /isn't available in Amsterdam yet/);
    assert.doesNotMatch(body, /Nairobi|Mombasa|Kisumu|home collection/i);
  });
});

describe('§10 / §7 — Nairobi + no executable inventory → still coming soon (marketing copy is not evidence)', () => {
  test('Nairobi is not special-cased; empty supported list → coming_soon', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: 'Westlands, Nairobi', hasLocation: true });
    assert.equal(r.status, 'coming_soon');
    assert.match(healthTestingBody(r.status, r.locationLabel), /isn't available in Westlands, Nairobi yet/);
  });
  test('the MVP supported-markets list is empty (no fabricated inventory)', () => {
    assert.equal(HEALTH_TESTING_SUPPORTED_MARKETS.length, 0);
  });
});

describe('§10 / §4 — Amsterdam device manually exploring Nairobi (fitness available) → testing still unavailable', () => {
  test('the resolver never receives or reads fitness availability; only the label + testing supply', () => {
    // Caller passes the explored city label; fitness "available" is irrelevant here.
    const r = resolveHealthTestingAvailability({ locationLabel: 'Nairobi', hasLocation: true });
    assert.equal(r.status, 'coming_soon');
    assert.notEqual(r.status, 'available');
  });
});

describe('§10 / §6 — location unknown → neutral, no Kenyan city', () => {
  test('no location → location_unknown with neutral body', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: null, hasLocation: false });
    assert.equal(r.status, 'location_unknown');
    const body = healthTestingBody(r.status, r.locationLabel);
    assert.equal(body, 'Health testing availability depends on your location.');
    assert.doesNotMatch(body, /Nairobi|Mombasa|Kisumu/i);
  });
});

describe('§10 — availability query failure → error, never "no inventory" or "available"', () => {
  test('queryFailed → error (even with a location)', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: 'Amsterdam', hasLocation: true, queryFailed: true });
    assert.equal(r.status, 'error');
    assert.notEqual(r.status, 'no_local_inventory');
    assert.notEqual(r.status, 'available');
    assert.match(healthTestingBody(r.status, r.locationLabel), /connection issue, not a coverage gap/i);
  });
});

describe('§10 / §5 — when real testing supply exists', () => {
  const markets = ['Nairobi', 'Amsterdam'];
  test('a supported location → available', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: 'Amsterdam Centrum', hasLocation: true, supportedMarkets: markets });
    assert.equal(r.status, 'available');
    assert.match(healthTestingBody(r.status, r.locationLabel), /available in Amsterdam Centrum/);
  });
  test('an unsupported location → no_local_inventory (not "coming soon")', () => {
    const r = resolveHealthTestingAvailability({ locationLabel: 'Rotterdam', hasLocation: true, supportedMarkets: markets });
    assert.equal(r.status, 'no_local_inventory');
    assert.match(healthTestingBody(r.status, r.locationLabel), /isn't available in Rotterdam yet/);
  });
  test('supported match is case/substring tolerant', () => {
    assert.equal(
      resolveHealthTestingAvailability({ locationLabel: 'nairobi', hasLocation: true, supportedMarkets: ['Nairobi'] }).status,
      'available',
    );
  });
});

describe('copy invariants', () => {
  test('no state produces a Kenyan-city or home-collection claim for a non-Kenyan / unknown user', () => {
    for (const s of ['coming_soon', 'no_local_inventory', 'location_unknown', 'error'] as const) {
      const body = healthTestingBody(s, s === 'location_unknown' ? null : 'Amsterdam');
      assert.doesNotMatch(body, /Nairobi|Mombasa|Kisumu|home collection/i);
    }
  });
  test('title + coming-soon notice are preserved', () => {
    assert.match(HEALTH_TESTING_COPY.title, /Comprehensive health insights/);
    assert.match(HEALTH_TESTING_COPY.comingSoonNotice, /Booking is coming soon/);
  });
});
