import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingImpliesShareConsent,
  relationshipImpliesShareConsent,
  canViewClientProgress,
  sessionContextVisibility,
} from '../consent-safety.ts';
import { classifyClientAttention } from '../../lana-pro-onboarding/client-attention.ts';

describe('§8 / §21.22-24 — a booking never creates progress-sharing consent', () => {
  test('bookingImpliesShareConsent is always false', () => {
    assert.equal(bookingImpliesShareConsent(), false);
  });

  test('an active relationship alone is not consent', () => {
    assert.equal(relationshipImpliesShareConsent(), false);
  });

  test('canViewClientProgress needs BOTH active relationship AND share_progress', () => {
    assert.equal(canViewClientProgress({ relationshipStatus: 'active', shareProgress: true }), true);
    assert.equal(canViewClientProgress({ relationshipStatus: 'active', shareProgress: false }), false);
    assert.equal(canViewClientProgress({ relationshipStatus: 'pending', shareProgress: true }), false);
    assert.equal(canViewClientProgress({ relationshipStatus: 'none', shareProgress: true }), false);
  });

  test('§21.24 — booking exists, relationship active, share_progress=false → NO progress evidence', () => {
    // Simulate: the legacy trigger has set status='active' because a booking
    // was made, but the client has not opted into sharing.
    const vis = sessionContextVisibility({ relationshipStatus: 'active', shareProgress: false });
    assert.equal(vis.showProgress, false);
    assert.match(vis.placeholder, /when they choose to share/i);

    // And the Phase-3 attention classifier independently refuses to reason
    // about progress without consent, even with damning activity numbers.
    const verdict = classifyClientAttention({
      shareProgressConsent: false,
      daysSinceLastWorkout: 999,
      observedHistoryDays: 365,
      relationshipStatus: 'active',
    });
    assert.equal(verdict.verdict, 'insufficient_evidence');
    assert.deepEqual(verdict.reasons, ['no_consent']);
  });

  test('with consent, the classifier is allowed to reason (sanity)', () => {
    const vis = sessionContextVisibility({ relationshipStatus: 'active', shareProgress: true });
    assert.equal(vis.showProgress, true);
    assert.equal(vis.placeholder, '');
  });
});
