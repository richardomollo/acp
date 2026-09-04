import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMarketplaceAvailability, isVenueGeographicallyValid,
  venuesInRadius, venuesByDistance, MARKETPLACE_RADIUS_KM,
  type ActiveVenueRow,
} from '../marketplace-availability.ts';
import { boundingBoxKm, haversineKm } from '../location.ts';

// Beta Feedback #019 — Marketplace geography & inventory availability.
//
// The contract these lock down: marketplace availability derives ONLY from
// geographically valid ACTIVE + BOOKABLE supply within MARKETPLACE_RADIUS_KM
// — never from "is the city Nairobi". Onboarding valid supply anywhere flips
// that place to 'available' with no code change (case 14).

// Real-world reference points.
const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };
const AMSTERDAM = { latitude: 52.370216, longitude: 4.895168 };
const ROTTERDAM = { latitude: 51.9244, longitude: 4.4777 }; // ~57 km from Amsterdam

function venue(over: Partial<ActiveVenueRow> = {}): ActiveVenueRow {
  // `??` would collapse an intentional `latitude: null` to the default — key
  // presence, not truthiness, decides whether the caller supplied a value.
  return {
    id: over.id ?? 'g1',
    isActive: 'isActive' in over ? (over.isActive as boolean) : true,
    latitude: 'latitude' in over ? (over.latitude as number | null) : NAIROBI.latitude,
    longitude: 'longitude' in over ? (over.longitude as number | null) : NAIROBI.longitude,
    cityLabel: 'cityLabel' in over ? over.cityLabel : 'Nairobi',
    hasBookableSupply: over.hasBookableSupply,
  };
}

// A cluster of active, bookable, coordinate-bearing Nairobi gyms.
const NAIROBI_SUPPLY: ActiveVenueRow[] = [
  venue({ id: 'nbo-westlands', latitude: -1.2679, longitude: 36.8065, cityLabel: 'Westlands, Nairobi' }),
  venue({ id: 'nbo-kilimani', latitude: -1.2921, longitude: 36.7856, cityLabel: 'Kilimani, Nairobi' }),
  venue({ id: 'nbo-cbd', latitude: -1.2864, longitude: 36.8172, cityLabel: 'CBD, Nairobi' }),
];

describe('case 1 — Nairobi user, active Nairobi inventory → available', () => {
  test('status available, city carried, count > 0', () => {
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: NAIROBI_SUPPLY, cityLabel: 'Nairobi' });
    assert.equal(r.status, 'available');
    assert.equal(r.city, 'Nairobi');
    assert.equal(r.nearbyInventoryCount, 3);
    assert.equal(r.radiusKm, MARKETPLACE_RADIUS_KM);
  });
});

describe('case 2 — Amsterdam user, no Amsterdam inventory → no_local_inventory', () => {
  test('the only supply is Nairobi, 6000+ km away', () => {
    const r = computeMarketplaceAvailability({ point: AMSTERDAM, venues: NAIROBI_SUPPLY, cityLabel: 'Amsterdam' });
    assert.equal(r.status, 'no_local_inventory');
    assert.equal(r.nearbyInventoryCount, 0);
    assert.equal(r.city, 'Amsterdam');
    assert.ok(r.nearestMarket && r.nearestMarket.distanceKm > 6000);
  });
});

describe('case 3 — Amsterdam/no inventory → no Nairobi results are "nearby"', () => {
  test('venuesInRadius returns nothing for Amsterdam against Nairobi supply', () => {
    assert.deepEqual(venuesInRadius(AMSTERDAM, NAIROBI_SUPPLY), []);
  });
  test('…and everything for Nairobi', () => {
    assert.equal(venuesInRadius(NAIROBI, NAIROBI_SUPPLY).length, 3);
  });
});

describe('case 7 — Amsterdam has no bookable market (Open Gym recommendation must be absent)', () => {
  test('availability is not "available", so callers suppress bookable Open Gym', () => {
    const r = computeMarketplaceAvailability({ point: AMSTERDAM, venues: NAIROBI_SUPPLY });
    assert.notEqual(r.status, 'available');
  });
});

describe('case 8 — market HAS supply but a category query is empty ≠ unsupported market', () => {
  test('availability depends on venues, never on a category filter — still "available"', () => {
    // The screen may separately find zero yoga sessions; the market verdict
    // is unchanged and must not become "not in your city".
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: NAIROBI_SUPPLY, cityLabel: 'Nairobi' });
    assert.equal(r.status, 'available');
  });
});

describe('case 9 — location denied / not set → location_unknown', () => {
  test('point null → location_unknown regardless of how much supply exists', () => {
    const r = computeMarketplaceAvailability({ point: null, venues: NAIROBI_SUPPLY });
    assert.equal(r.status, 'location_unknown');
    assert.equal(r.nearbyInventoryCount, undefined);
    assert.equal(r.radiusKm, MARKETPLACE_RADIUS_KM);
  });
});

describe('case 10 — manual Nairobi selection while physically in Amsterdam', () => {
  test('verdict is about the SELECTED point, and carries the selected city label', () => {
    // The caller passes the manually chosen Nairobi coordinates + label.
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: NAIROBI_SUPPLY, cityLabel: 'Nairobi' });
    assert.equal(r.status, 'available');
    assert.equal(r.city, 'Nairobi'); // UI shows "Exploring Nairobi"
  });
});

describe('case 11 — an inactive venue must not establish availability', () => {
  test('the only nearby gym is inactive → no_local_inventory', () => {
    const inactiveOnly = [venue({ id: 'nbo-x', isActive: false })];
    assert.equal(isVenueGeographicallyValid(inactiveOnly[0]), false);
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: inactiveOnly });
    assert.equal(r.status, 'no_local_inventory');
  });
});

describe('case 12 — active partner with no bookable offering must not establish availability', () => {
  test('hasBookableSupply:false → venue is not geographically valid', () => {
    const noBookable = [venue({ id: 'nbo-y', hasBookableSupply: false })];
    assert.equal(isVenueGeographicallyValid(noBookable[0]), false);
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: noBookable });
    assert.equal(r.status, 'no_local_inventory');
  });
  test('hasBookableSupply undefined is treated as bookable (a bare active gym is bookable)', () => {
    assert.equal(isVenueGeographicallyValid(venue({ hasBookableSupply: undefined })), true);
  });
});

describe('venue without coordinates never establishes availability (spec §6)', () => {
  test('null coords → invalid even when active + bookable', () => {
    assert.equal(isVenueGeographicallyValid(venue({ latitude: null, longitude: null })), false);
  });
  test('out-of-range coords → invalid', () => {
    assert.equal(isVenueGeographicallyValid(venue({ latitude: 999, longitude: 0 })), false);
  });
  test('a market of only coordinate-less gyms → no_local_inventory, not available', () => {
    const noCoords = [venue({ latitude: null, longitude: null }), venue({ id: 'g2', latitude: null, longitude: null })];
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: noCoords });
    assert.equal(r.status, 'no_local_inventory');
  });
});

describe('case 14 — FUTURE MARKET: onboard valid Amsterdam supply → becomes available, no frontend change', () => {
  test('same function, same call — an Amsterdam gym within radius flips the verdict', () => {
    const amsterdamGym = venue({
      id: 'ams-centrum', latitude: 52.3676, longitude: 4.9041, cityLabel: 'Amsterdam Centrum',
    });
    const supply = [...NAIROBI_SUPPLY, amsterdamGym];

    // Before: Amsterdam user, only Nairobi supply.
    assert.equal(
      computeMarketplaceAvailability({ point: AMSTERDAM, venues: NAIROBI_SUPPLY }).status,
      'no_local_inventory',
    );
    // After: the exact same user + call, with one real Amsterdam gym added.
    const after = computeMarketplaceAvailability({ point: AMSTERDAM, venues: supply, cityLabel: 'Amsterdam' });
    assert.equal(after.status, 'available');
    assert.equal(after.nearbyInventoryCount, 1); // only the Amsterdam gym is within 20 km
    // Nairobi is unaffected.
    assert.equal(computeMarketplaceAvailability({ point: NAIROBI, venues: supply }).status, 'available');
  });

  test('deactivating that Amsterdam gym returns Amsterdam to unavailable', () => {
    const amsterdamGym = venue({ id: 'ams-centrum', latitude: 52.3676, longitude: 4.9041, isActive: false });
    const r = computeMarketplaceAvailability({ point: AMSTERDAM, venues: [...NAIROBI_SUPPLY, amsterdamGym] });
    assert.equal(r.status, 'no_local_inventory');
  });
});

describe('radius boundary', () => {
  test('a gym just inside 20 km counts; one just outside does not', () => {
    // 0.1° latitude ≈ 11.1 km; 0.2° ≈ 22.2 km.
    const inside = venue({ id: 'in', latitude: NAIROBI.latitude + 0.1, longitude: NAIROBI.longitude });
    const outside = venue({ id: 'out', latitude: NAIROBI.latitude + 0.2, longitude: NAIROBI.longitude });
    assert.ok(haversineKm(NAIROBI.latitude, NAIROBI.longitude, inside.latitude!, inside.longitude!) < MARKETPLACE_RADIUS_KM);
    assert.ok(haversineKm(NAIROBI.latitude, NAIROBI.longitude, outside.latitude!, outside.longitude!) > MARKETPLACE_RADIUS_KM);
    const r = computeMarketplaceAvailability({ point: NAIROBI, venues: [inside, outside] });
    assert.equal(r.nearbyInventoryCount, 1);
  });

  test('Rotterdam supply does not cover an Amsterdam user (~57 km apart)', () => {
    const rotterdamGym = venue({ id: 'rot', latitude: ROTTERDAM.latitude, longitude: ROTTERDAM.longitude, cityLabel: 'Rotterdam' });
    const r = computeMarketplaceAvailability({ point: AMSTERDAM, venues: [rotterdamGym], cityLabel: 'Amsterdam' });
    assert.equal(r.status, 'no_local_inventory');
    assert.equal(r.nearestMarket?.city, 'Rotterdam');
    assert.ok(r.nearestMarket!.distanceKm > 40 && r.nearestMarket!.distanceKm < 80);
  });
});

describe('venuesByDistance ordering', () => {
  test('nearest first, invalid rows dropped', () => {
    const rows = [
      venue({ id: 'far', latitude: NAIROBI.latitude + 0.15, longitude: NAIROBI.longitude }),
      venue({ id: 'near', latitude: NAIROBI.latitude + 0.01, longitude: NAIROBI.longitude }),
      venue({ id: 'nocoord', latitude: null, longitude: null }),
      venue({ id: 'inactive', isActive: false }),
    ];
    const ranked = venuesByDistance(NAIROBI, rows);
    assert.deepEqual(ranked.map(v => v.venue.id), ['near', 'far']);
  });
});

describe('boundingBoxKm — index-friendly pre-filter is a superset of the radius', () => {
  test('every point inside the true radius is inside the box', () => {
    const box = boundingBoxKm(NAIROBI.latitude, NAIROBI.longitude, MARKETPLACE_RADIUS_KM);
    // sample points on a ring at ~19 km in 8 directions — all must be in the box
    for (let brg = 0; brg < 360; brg += 45) {
      const dLat = (19 / 111.32) * Math.cos((brg * Math.PI) / 180);
      const dLng = (19 / (111.32 * Math.cos((NAIROBI.latitude * Math.PI) / 180))) * Math.sin((brg * Math.PI) / 180);
      const lat = NAIROBI.latitude + dLat;
      const lng = NAIROBI.longitude + dLng;
      assert.ok(lat >= box.minLat && lat <= box.maxLat, `lat ${lat} in [${box.minLat}, ${box.maxLat}]`);
      assert.ok(lng >= box.minLng && lng <= box.maxLng, `lng ${lng} in [${box.minLng}, ${box.maxLng}]`);
    }
  });
  test('degenerate near-pole latitude widens longitude to full range instead of NaN', () => {
    const box = boundingBoxKm(89.9999, 0, MARKETPLACE_RADIUS_KM);
    assert.ok(Number.isFinite(box.minLng) && Number.isFinite(box.maxLng));
    assert.equal(box.minLng, -180);
    assert.equal(box.maxLng, 180);
  });
});

describe('status is always one of the three contract values', () => {
  for (const point of [NAIROBI, AMSTERDAM, null]) {
    test(`point=${point ? 'set' : 'null'} → valid status`, () => {
      const r = computeMarketplaceAvailability({ point, venues: NAIROBI_SUPPLY });
      assert.ok(['available', 'no_local_inventory', 'location_unknown'].includes(r.status));
    });
  }
});
