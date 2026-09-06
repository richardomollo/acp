import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLanaProEnabled,
  isLanaProVenueTeamsEnabled,
  LANA_PRO_HOME,
} from '../lana-pro-flags.ts';

const KEYS = ['NEXT_PUBLIC_LANA_PRO_ENABLED', 'NEXT_PUBLIC_LANA_PRO_VENUE_TEAMS_ENABLED'];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('lana-pro cutover flags', () => {
  test('both default to ENABLED when unset', () => {
    assert.equal(isLanaProEnabled(), true);
    assert.equal(isLanaProVenueTeamsEnabled(), true);
  });

  test('only the exact string "false" disables a flag', () => {
    process.env.NEXT_PUBLIC_LANA_PRO_ENABLED = 'false';
    assert.equal(isLanaProEnabled(), false);
    process.env.NEXT_PUBLIC_LANA_PRO_ENABLED = '0';
    assert.equal(isLanaProEnabled(), true);
    process.env.NEXT_PUBLIC_LANA_PRO_ENABLED = 'FALSE';
    assert.equal(isLanaProEnabled(), true);
    process.env.NEXT_PUBLIC_LANA_PRO_ENABLED = 'true';
    assert.equal(isLanaProEnabled(), true);
  });

  test('flags are independent', () => {
    process.env.NEXT_PUBLIC_LANA_PRO_VENUE_TEAMS_ENABLED = 'false';
    assert.equal(isLanaProVenueTeamsEnabled(), false);
    assert.equal(isLanaProEnabled(), true);
  });

  test('LANA_PRO_HOME is the workspace home route', () => {
    assert.equal(LANA_PRO_HOME, '/lana-pro/home');
  });
});
