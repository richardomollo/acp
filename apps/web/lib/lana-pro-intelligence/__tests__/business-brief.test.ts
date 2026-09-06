import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBusinessBrief,
  businessBriefStrings,
  businessBriefCount,
  type BusinessBriefInput,
} from '../business-brief.ts';
import { findBannedPhrases } from '../../lana-pro-delivery/copy-safety.ts';
import { addDays } from '../business-signals.ts';

const TODAY = '2026-09-07';
const NOW = '2026-09-07T09:00:00';

function baseInput(over: Partial<BusinessBriefInput> = {}): BusinessBriefInput {
  return {
    businessId: 'gym-1',
    businessType: 'gym',
    nowIso: NOW,
    todayLocalDate: TODAY,
    setup: {
      hasService: true,
      hasSchedule: true,
      hasTeam: true,
      teamRelevant: true,
      hasFacilityAccess: true,
    },
    upcomingClasses: [],
    upcomingAppointmentCount: 0,
    windowDays: 7,
    demand: null,
    newestEvidenceDate: null,
    ...over,
  };
}

describe('business-brief — states', () => {
  test('setup: nothing configured → state "setup" + the setup gap', () => {
    const b = buildBusinessBrief(
      baseInput({
        setup: { hasService: false, hasSchedule: false, hasTeam: false, teamRelevant: true, hasFacilityAccess: false },
      }),
    );
    assert.equal(b.state, 'setup');
    assert.ok(b.observations.some((o) => o.kind === 'setup:no_service'));
    assert.ok(b.suggestedActions.some((a) => a.href === '/lana-pro/services/new'));
  });

  test('low_data: configured but no upcoming activity and no history → state "low_data"', () => {
    const b = buildBusinessBrief(baseInput()); // everything set up, nothing booked
    assert.equal(b.state, 'low_data');
    assert.equal(businessBriefCount(b), 0);
  });

  test('operational: an upcoming class with bookings → state "operational"', () => {
    const b = buildBusinessBrief(
      baseInput({
        upcomingClasses: [
          { id: 's1', name: 'Pilates', startAt: `${addDays(TODAY, 5)}T10:00:00`, capacity: 10, booked: 9 },
        ],
        upcomingAppointmentCount: 2,
      }),
    );
    assert.equal(b.state, 'operational');
    assert.ok(b.observations.some((o) => o.kind === 'class_capacity'));
    assert.ok(b.facts.some((f) => f.kind === 'upcoming_load'));
  });
});

describe('business-brief — class capacity item wiring', () => {
  test('a nearly-full class maps to the real /lana-pro/bookings/class/<id> route', () => {
    const b = buildBusinessBrief(
      baseInput({
        upcomingClasses: [
          { id: 'sess-42', name: 'Spin', startAt: `${addDays(TODAY, 2)}T07:00:00`, capacity: 12, booked: 11 },
        ],
      }),
    );
    const item = b.observations.find((o) => o.kind === 'class_capacity');
    assert.ok(item);
    assert.equal(item!.action?.href, '/lana-pro/bookings/class/sess-42');
  });
});

describe('business-brief — Home item cap + ordering', () => {
  test('never renders more than 4 attention items', () => {
    const classes = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      name: `Class ${i}`,
      startAt: `${addDays(TODAY, 1 + i)}T10:00:00`,
      capacity: 10,
      booked: 10,
    }));
    const b = buildBusinessBrief(
      baseInput({
        upcomingClasses: classes,
        upcomingAppointmentCount: 4,
        setup: { hasService: true, hasSchedule: false, hasTeam: false, teamRelevant: true, hasFacilityAccess: false },
      }),
    );
    assert.ok(businessBriefCount(b) <= 4);
  });

  test('operational state leads with capacity/demand, not setup gaps', () => {
    const b = buildBusinessBrief(
      baseInput({
        upcomingClasses: [
          { id: 's1', name: 'Yoga', startAt: `${addDays(TODAY, 3)}T18:00:00`, capacity: 10, booked: 10 },
        ],
        setup: { hasService: true, hasSchedule: true, hasTeam: false, teamRelevant: true, hasFacilityAccess: true },
      }),
    );
    // first rendered item (render order is preserved in `items`) is the capacity one
    assert.equal(b.items[0].kind, 'class_capacity');
    // and a setup gap still appears, just later
    assert.ok(b.items.some((i) => i.kind === 'setup:no_team'));
  });
});

describe('business-brief — demand feed-through (history-gated)', () => {
  test('demand input below the week threshold → no demand item', () => {
    const b = buildBusinessBrief(
      baseInput({
        demand: { weekdayLabel: 'Saturday', thisWeekFill: 0.95, priorMeanFill: 0.3, weeksObserved: 2 },
        upcomingClasses: [{ id: 's1', name: 'X', startAt: `${addDays(TODAY, 2)}T10:00:00`, capacity: 10, booked: 3 }],
      }),
    );
    assert.equal(b.observations.some((o) => o.kind === 'class_demand'), false);
  });

  test('sufficient history + gap → a supported demand observation appears', () => {
    const b = buildBusinessBrief(
      baseInput({
        demand: { weekdayLabel: 'Saturday', thisWeekFill: 0.95, priorMeanFill: 0.6, weeksObserved: 4 },
        upcomingClasses: [{ id: 's1', name: 'X', startAt: `${addDays(TODAY, 5)}T10:00:00`, capacity: 10, booked: 3 }],
      }),
    );
    assert.ok(b.observations.some((o) => o.kind === 'class_demand'));
  });
});

describe('business-brief — shape-driven relevance (§10/§11/§13)', () => {
  test('spa with only appointments → no "no upcoming classes" and no facility gap noise beyond what applies', () => {
    const b = buildBusinessBrief(
      baseInput({
        businessType: 'Spa & Wellness',
        setup: { hasService: true, hasSchedule: false, hasTeam: true, teamRelevant: true, hasFacilityAccess: false },
        upcomingAppointmentCount: 5,
      }),
    );
    assert.equal(b.shape, 'spa');
    assert.equal(b.observations.some((o) => o.kind === 'setup:no_schedule'), false);
    // facility access IS relevant to a spa
    assert.ok(b.observations.some((o) => o.kind === 'setup:no_facility_access'));
  });

  test('spa with STRAY class rows → no class-capacity, no class-demand, load fact counts appointments only', () => {
    const b = buildBusinessBrief(
      baseInput({
        businessType: 'spa',
        upcomingClasses: [
          { id: 's1', name: 'Aqua', startAt: `${addDays(TODAY, 2)}T10:00:00`, capacity: 10, booked: 10 },
        ],
        upcomingAppointmentCount: 6,
        demand: { weekdayLabel: 'Saturday', thisWeekFill: 0.95, priorMeanFill: 0.5, weeksObserved: 5 },
      }),
    );
    assert.equal(b.items.some((i) => i.kind === 'class_capacity'), false);
    assert.equal(b.items.some((i) => i.kind === 'class_demand'), false);
    const load = b.items.find((i) => i.kind === 'upcoming_load');
    assert.ok(load);
    assert.equal(/class/i.test(load!.text), false);
    assert.match(load!.text, /6 appointments are booked/);
  });

  test('class-only studio → never a facility-access gap', () => {
    const b = buildBusinessBrief(
      baseInput({
        businessType: 'Pilates',
        setup: { hasService: true, hasSchedule: false, hasTeam: true, teamRelevant: true, hasFacilityAccess: false },
      }),
    );
    assert.equal(b.shape, 'studio');
    assert.equal(b.observations.some((o) => o.kind === 'setup:no_facility_access'), false);
    assert.ok(b.observations.some((o) => o.kind === 'setup:no_schedule'));
  });
});

describe('business-brief — FACT vs OBSERVATION + copy safety', () => {
  test('full class = FACT, nearly-full = OBSERVATION, load = FACT', () => {
    const b = buildBusinessBrief(
      baseInput({
        upcomingClasses: [
          { id: 's1', name: 'Full', startAt: `${addDays(TODAY, 1)}T10:00:00`, capacity: 10, booked: 10 },
          { id: 's2', name: 'Nearly', startAt: `${addDays(TODAY, 2)}T10:00:00`, capacity: 10, booked: 8 },
        ],
        upcomingAppointmentCount: 1,
      }),
    );
    assert.ok(b.facts.some((f) => f.kind === 'class_capacity' && /is full/.test(f.text)));
    assert.ok(b.observations.some((o) => o.kind === 'class_capacity' && /nearly full/.test(o.text)));
    assert.ok(b.facts.some((f) => f.kind === 'upcoming_load'));
  });

  test('every rendered string passes the copy-safety blocklist', () => {
    const b = buildBusinessBrief(
      baseInput({
        businessType: 'gym',
        setup: { hasService: false, hasSchedule: false, hasTeam: false, teamRelevant: true, hasFacilityAccess: false },
        upcomingClasses: [
          { id: 's1', name: 'Strength', startAt: `${addDays(TODAY, 1)}T06:00:00`, capacity: 12, booked: 12 },
        ],
        upcomingAppointmentCount: 3,
        demand: { weekdayLabel: 'Monday', thisWeekFill: 0.1, priorMeanFill: 0.8, weeksObserved: 5 },
      }),
    );
    for (const s of businessBriefStrings(b)) assert.deepEqual(findBannedPhrases(s), [], s);
  });

  test('all suggested-action routes are real Lana Pro routes', () => {
    const b = buildBusinessBrief(
      baseInput({
        setup: { hasService: false, hasSchedule: false, hasTeam: false, teamRelevant: true, hasFacilityAccess: false },
        upcomingClasses: [{ id: 's9', name: 'C', startAt: `${addDays(TODAY, 1)}T10:00:00`, capacity: 10, booked: 10 }],
        upcomingAppointmentCount: 2,
      }),
    );
    for (const a of b.suggestedActions) assert.match(a.href, /^\/lana-pro\//);
  });
});

describe('business-brief — freshness', () => {
  test('stale when the newest evidence is older than 4 weeks', () => {
    const b = buildBusinessBrief(baseInput({ newestEvidenceDate: addDays(TODAY, -40) }));
    assert.equal(b.dataFreshness.stale, true);
  });
  test('fresh otherwise', () => {
    const b = buildBusinessBrief(baseInput({ newestEvidenceDate: addDays(TODAY, -3) }));
    assert.equal(b.dataFreshness.stale, false);
  });
  test('malformed/null evidence date never throws and is not stale', () => {
    assert.doesNotThrow(() => buildBusinessBrief(baseInput({ newestEvidenceDate: null })));
    assert.equal(buildBusinessBrief(baseInput({ newestEvidenceDate: null })).dataFreshness.stale, false);
  });
});
