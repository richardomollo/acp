import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  greetingForHour,
  greetingFor,
  firstNameOf,
  professionalVerificationNotice,
  businessVerificationNotice,
  buildIntelligenceModel,
  professionalEmptyState,
  businessEmptyState,
  buildProfessionalHome,
  buildBusinessHome,
} from '../home-model.ts';
import { deriveProfessionalChecklist } from '../activation.ts';
import type { TodayItem } from '../today.ts';
import type { ClientEvidence } from '../../lana-pro-onboarding/client-attention.ts';

describe('greeting', () => {
  test('by hour', () => {
    assert.equal(greetingForHour(6), 'Good morning');
    assert.equal(greetingForHour(13), 'Good afternoon');
    assert.equal(greetingForHour(20), 'Good evening');
  });
  test('from ISO string', () => {
    assert.equal(greetingFor('2026-09-06T08:00:00'), 'Good morning');
    assert.equal(greetingFor('2026-09-06T18:30:00'), 'Good evening');
  });
  test('firstNameOf', () => {
    assert.equal(firstNameOf('Richard Omollo'), 'Richard');
    assert.equal(firstNameOf(null), '');
    assert.equal(firstNameOf('  '), '');
  });
});

describe('verification notice — workspace is never blocked', () => {
  test('pending professional: workspace ready + notice shown', () => {
    const n = professionalVerificationNotice('pending');
    assert.equal(n.workspaceReady, true);
    assert.equal(n.showNotice, true);
    assert.equal(n.tone, 'pending');
    assert.match(n.headline, /workspace is ready/i);
    assert.match(n.detail, /still under review/i);
  });

  test('approved professional: no notice', () => {
    const n = professionalVerificationNotice('approved');
    assert.equal(n.showNotice, false);
  });

  test('rejected / suspended still keep the workspace usable', () => {
    assert.equal(professionalVerificationNotice('rejected').workspaceReady, true);
    assert.equal(professionalVerificationNotice('suspended').workspaceReady, true);
    assert.equal(professionalVerificationNotice('rejected').tone, 'warning');
  });

  test('business: active venue → no notice; inactive → pending notice', () => {
    assert.equal(businessVerificationNotice(true).showNotice, false);
    assert.equal(businessVerificationNotice(false).showNotice, true);
    assert.equal(businessVerificationNotice(false).workspaceReady, true);
  });
});

describe('buildIntelligenceModel — honest placeholder (no producer in 4.1)', () => {
  test('no clients → learning state, no fabricated items', () => {
    const m = buildIntelligenceModel({});
    assert.equal(m.state, 'learning');
    assert.deepEqual(m.attentionClientIds, []);
    assert.match(m.headline, /still learning/i);
  });

  test('clients present but zero evidence → still learning (never needs_attention)', () => {
    const evidence: Record<string, ClientEvidence> = { c1: {}, c2: {}, c3: {} };
    const m = buildIntelligenceModel(evidence);
    assert.equal(m.state, 'learning');
    assert.deepEqual(m.attentionClientIds, []);
  });

  test('business subject tunes the copy', () => {
    const m = buildIntelligenceModel({}, { subject: 'business' });
    assert.match(m.detail, /bookings and activity/i);
  });

  test('when real evidence exists and is clean → clear state', () => {
    const evidence: Record<string, ClientEvidence> = {
      c1: { shareProgressConsent: true, observedHistoryDays: 90, daysSinceLastWorkout: 2, planAdherenceRatio: 0.9 },
    };
    const m = buildIntelligenceModel(evidence);
    assert.equal(m.state, 'clear');
  });

  test('when real evidence flags a client → has_items with that id', () => {
    const evidence: Record<string, ClientEvidence> = {
      c1: { shareProgressConsent: true, observedHistoryDays: 90, daysSinceLastWorkout: 40 },
      c2: {},
    };
    const m = buildIntelligenceModel(evidence);
    assert.equal(m.state, 'has_items');
    assert.deepEqual(m.attentionClientIds, ['c1']);
  });
});

describe('empty-state selection', () => {
  test('professional with items → none', () => {
    assert.equal(professionalEmptyState({ hasTodayItems: true, activeClientCount: 0 }).kind, 'none');
  });
  test('professional, clients but no bookings', () => {
    const e = professionalEmptyState({ hasTodayItems: false, activeClientCount: 6 });
    assert.equal(e.kind, 'clients_no_bookings');
    assert.match(e.headline, /clients are connected/i);
  });
  test('professional, nothing at all', () => {
    const e = professionalEmptyState({ hasTodayItems: false, activeClientCount: 0 });
    assert.equal(e.kind, 'no_bookings');
    assert.deepEqual(e.actions.map((a) => a.href), ['/lana-pro/clients/invite', '/lana-pro/schedule']);
  });
  test('business, no schedule', () => {
    const e = businessEmptyState({ hasTodayItems: false });
    assert.equal(e.kind, 'business_no_schedule');
  });
});

// ── assembled models ──────────────────────────────────────────────────────

const NOW = '2026-09-06T08:00:00';

const appt = (id: string, at: string, client?: string): TodayItem => ({
  id, kind: 'appointment', title: 'Personal Training', startAt: at, clientName: client, href: '#',
});

describe('buildProfessionalHome', () => {
  test('a busy morning: counts, next, verification, checklist filtered', () => {
    const m = buildProfessionalHome({
      nowIso: NOW,
      displayName: 'Richard Omollo',
      professionalStatus: 'pending',
      todayItems: [appt('a', '2026-09-06T09:00:00', 'James'), appt('b', '2026-09-06T11:30:00', 'Sarah')],
      activeClientCount: 6,
      invitedClientCount: 1,
      checklist: deriveProfessionalChecklist({
        hasService: true, hasAvailability: true, hasClients: true, profileComplete: false, payoutReady: false,
      }),
      clientEvidence: {},
    });
    assert.equal(m.greeting, 'Good morning');
    assert.equal(m.firstName, 'Richard');
    assert.equal(m.counts.appointmentsToday, 2);
    assert.equal(m.counts.activeClients, 6);
    assert.equal(m.counts.invitationsPending, 1);
    assert.equal(m.schedule.next?.id, 'a');
    assert.equal(m.verification.showNotice, true);
    assert.equal(m.intelligence.state, 'learning');
    assert.deepEqual(m.checklist.items.map((i) => i.id), ['profile', 'payouts']);
    assert.equal(m.checklist.done, false);
    assert.equal(m.emptyState.kind, 'none');
  });

  test('clients but no bookings today → clients_no_bookings empty state', () => {
    const m = buildProfessionalHome({
      nowIso: NOW, displayName: 'Ada', professionalStatus: 'approved',
      todayItems: [], activeClientCount: 4, invitedClientCount: 0,
      checklist: deriveProfessionalChecklist({
        hasService: true, hasAvailability: true, hasClients: true, profileComplete: true, payoutReady: true,
      }),
      clientEvidence: {},
    });
    assert.equal(m.counts.appointmentsToday, 0);
    assert.equal(m.emptyState.kind, 'clients_no_bookings');
    assert.equal(m.verification.showNotice, false); // approved
    assert.equal(m.checklist.done, true);
    assert.deepEqual(m.checklist.items, []);
  });

  test('brand new pro, nothing yet → no_bookings empty state, grow-practice shown', () => {
    const m = buildProfessionalHome({
      nowIso: NOW, displayName: 'New Coach', professionalStatus: 'pending',
      todayItems: [], activeClientCount: 0, invitedClientCount: 0,
      checklist: deriveProfessionalChecklist({
        hasService: false, hasAvailability: false, hasClients: false, profileComplete: false, payoutReady: false,
      }),
      clientEvidence: {},
    });
    assert.equal(m.emptyState.kind, 'no_bookings');
    assert.equal(m.showGrowPractice, true);
    assert.equal(m.checklist.items.length, 5);
  });
});

describe('buildBusinessHome', () => {
  const cls = (id: string, at: string, booked: number, cap: number): TodayItem => ({
    id, kind: 'class', title: 'Reformer', startAt: at, bookedCount: booked, capacity: cap, href: '#',
  });

  test('class-day counts: classes / bookings / spaces remaining', () => {
    const m = buildBusinessHome({
      nowIso: NOW,
      displayName: 'Core Pilates',
      anyVenueActive: true,
      todayItems: [
        cls('m', '2026-09-06T08:00:00', 8, 8),
        cls('n', '2026-09-06T10:00:00', 7, 8),
        cls('e', '2026-09-06T18:30:00', 4, 8),
      ],
      checklist: [],
    });
    assert.equal(m.counts.classesToday, 3);
    assert.equal(m.counts.bookingsToday, 19);
    assert.equal(m.counts.spacesRemaining, 5); // 0 + 1 + 4
    assert.equal(m.displayName, 'Core Pilates');
    assert.equal(m.verification.showNotice, false);
    assert.equal(m.intelligence.state, 'learning');
    assert.match(m.intelligence.detail, /bookings and activity/i);
  });

  test('no schedule → empty state + pending notice when venue inactive', () => {
    const m = buildBusinessHome({
      nowIso: NOW, displayName: 'New Studio', anyVenueActive: false, todayItems: [], checklist: [],
    });
    assert.equal(m.emptyState.kind, 'business_no_schedule');
    assert.equal(m.verification.showNotice, true);
    assert.equal(m.counts.classesToday, 0);
  });
});
