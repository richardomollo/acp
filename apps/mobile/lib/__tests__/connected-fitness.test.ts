import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAppleHealthState, isConnectedState, AUTH_REQUEST_STATUS,
  type AppleHealthSignals,
} from '../connected-fitness.ts';

// A fully usable iOS environment that has been through Apple's permission
// sheet — the baseline "connected" case. Individual tests override one field.
function signals(overrides: Partial<AppleHealthSignals> = {}): AppleHealthSignals {
  return {
    isIos: true,
    isRealDevice: true,
    isExpoGo: false,
    moduleLoaded: true,
    healthDataAvailable: true,
    requestStatus: AUTH_REQUEST_STATUS.unnecessary,
    ...overrides,
  };
}

describe('deriveAppleHealthState (Beta #009 — connection truth, not button taps)', () => {
  test('HealthKit unavailable never reports connected', () => {
    assert.equal(deriveAppleHealthState(signals({ isIos: false })), 'unavailable');
    assert.equal(deriveAppleHealthState(signals({ isRealDevice: false })), 'unavailable');
    assert.equal(deriveAppleHealthState(signals({ isExpoGo: true })), 'unavailable');
    assert.equal(deriveAppleHealthState(signals({ moduleLoaded: false })), 'unavailable');
    assert.equal(deriveAppleHealthState(signals({ healthDataAvailable: false })), 'unavailable');
  });

  test('authorization request that threw is a distinct, retryable error state', () => {
    assert.equal(
      deriveAppleHealthState(signals({ lastRequestFailed: true, requestStatus: null })),
      'error',
    );
  });

  test('request status "unnecessary" — user completed Apple\'s flow — is connected', () => {
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: AUTH_REQUEST_STATUS.unnecessary })),
      'connected',
    );
  });

  test('request status "shouldRequest" — flow not completed — is not_connected', () => {
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: AUTH_REQUEST_STATUS.shouldRequest })),
      'not_connected',
    );
  });

  test('unknown / missing request status is treated as unavailable, never not_connected', () => {
    // We must not claim the user hasn't connected when iOS simply won't say.
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: AUTH_REQUEST_STATUS.unknown })),
      'unavailable',
    );
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: null })),
      'unavailable',
    );
  });

  test('connected state does not depend on any health data existing', () => {
    // No steps, no workouts, no measurements — still connected, because the
    // signal is "completed Apple's permission flow", not "has rows".
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: AUTH_REQUEST_STATUS.unnecessary })),
      'connected',
    );
  });

  test('partial / all-denied permissions still resolve to connected (iOS reports "unnecessary")', () => {
    // Apple returns `unnecessary` once the sheet has been shown, whether the
    // user allowed everything, some, or nothing. ACP reports connected and
    // the copy — "the data you chose to share" — carries the nuance.
    assert.equal(
      deriveAppleHealthState(signals({ requestStatus: AUTH_REQUEST_STATUS.unnecessary })),
      'connected',
    );
  });

  test('derivation is pure — repeated calls with the same signals are stable', () => {
    const s = signals();
    const first = deriveAppleHealthState(s);
    assert.equal(deriveAppleHealthState(s), first);
    assert.equal(deriveAppleHealthState(s), first);
  });
});

describe('isConnectedState', () => {
  test('only "connected" counts as connected for Profile labels', () => {
    assert.equal(isConnectedState('connected'), true);
    assert.equal(isConnectedState('not_connected'), false);
    assert.equal(isConnectedState('connecting'), false);
    assert.equal(isConnectedState('unavailable'), false);
    assert.equal(isConnectedState('error'), false);
  });
});
