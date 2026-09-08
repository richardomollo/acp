// LANA MOBILE — Home "Maximum update depth exceeded" fix.
//
// Root cause: gateFulfilment's `{ ...f, marketplaceMatches: [] }` spread
// returns a brand new object reference on every call when !marketAvailable
// — calling it directly in the render body (not memoized) fed a fresh
// `fulfilment` prop into ActivityFulfilmentCard on every render, whose own
// onResolved effect (deps include `fulfilment`) re-fired every time,
// calling onResolved -> real state updates in this screen -> re-render ->
// a fresh gated object again -> infinite loop.
//
// Source-level structural test (this codebase has no React-component-
// rendering test infrastructure — the same documented constraint as the
// auth-modal, OAuth-callback, and weekly-plan fixes): proves both call
// sites are wrapped in useMemo, not invoked bare.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCREEN_FILE = path.resolve(import.meta.dirname, '../../app/(tabs)/index.tsx');
const src = readFileSync(SCREEN_FILE, 'utf8');

describe('gateFulfilment call sites are memoized (not fresh objects every render)', () => {
  test('todayFulfilmentGated is wrapped in useMemo', () => {
    assert.match(src, /const todayFulfilmentGated = useMemo\(\(\) => gateFulfilment\(todayFulfilment\), \[gateFulfilment, todayFulfilment\]\);/);
  });

  test('upcomingFulfilmentGated is wrapped in useMemo', () => {
    assert.match(src, /const upcomingFulfilmentGated = useMemo\(\(\) => gateFulfilment\(upcomingFulfilment\), \[gateFulfilment, upcomingFulfilment\]\);/);
  });

  test('gateFulfilment is never called bare (unmemoized) anywhere in this file', () => {
    // Every occurrence of `gateFulfilment(` must be immediately preceded by
    // `useMemo(() => ` on the same statement — i.e. no bare
    // `= gateFulfilment(...)` assignment exists anywhere else in the file.
    const bareCalls = src.match(/=\s*gateFulfilment\([^)]*\);/g) ?? [];
    for (const call of bareCalls) {
      assert.fail(`found an unmemoized gateFulfilment call: "${call}" — must be wrapped in useMemo`);
    }
  });
});
