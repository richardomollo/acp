// LANA IOS — Weekly Plan Loading Termination Fix.
//
// This codebase has no React-component-rendering test infrastructure (no
// @testing-library/react-native, no expo-router/testing-library usage
// anywhere) — the same honest constraint already documented for the
// auth-modal keyboard fix and the OAuth callback route. This is a
// source-level structural test proving the fix's actual shape: exactly one
// setLoading(false), living inside a finally block wrapping the whole load
// function, so a thrown exception anywhere in it (not just an early
// return) still reaches the non-loading state — the literal bug the audit
// confirmed (this screen previously called setLoading(false) at each
// return point individually, with nothing to catch a genuine throw).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCREEN_FILE = path.resolve(import.meta.dirname, '../../app/weekly-plan.tsx');
const src = readFileSync(SCREEN_FILE, 'utf8');

// Isolate just the load useFocusEffect's async body, so these assertions
// can't accidentally pass/fail based on unrelated setLoading calls
// elsewhere in this large screen file (e.g. a different effect).
const loadBlockMatch = src.match(/useFocusEffect\(useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[\]\)\);/);
assert.ok(loadBlockMatch, 'expected to find the load useFocusEffect block in app/weekly-plan.tsx');
const loadBlock = loadBlockMatch![0];
// Strips `//` line comments before matching actual code — this fix's own
// explanatory comment legitimately mentions "setLoading(false)" in prose,
// which must not be counted as a real call.
const loadCode = loadBlock.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');

describe('weekly-plan.tsx load function — hard loading-termination invariant', () => {
  test('setLoading(false) is called exactly once, not scattered at each early return', () => {
    const calls = loadCode.match(/setLoading\(false\)/g) ?? [];
    assert.equal(calls.length, 1, `expected exactly 1 setLoading(false) call, found ${calls.length}`);
  });

  test('that single setLoading(false) call lives inside a finally block', () => {
    const finallyMatch = loadCode.match(/\}\s*finally\s*\{([\s\S]*?)\}/);
    assert.ok(finallyMatch, 'expected a finally block wrapping the load logic');
    assert.match(finallyMatch![1], /setLoading\(false\)/, 'setLoading(false) must be inside the finally block');
  });

  test('the load logic is wrapped in a try block (a thrown error is actually catchable/finally-able)', () => {
    assert.match(loadCode, /\btry\s*\{/);
  });

  test('no new setTimeout was introduced by this fix (the invariant is structural, not timing-based)', () => {
    assert.doesNotMatch(loadCode, /setTimeout/);
  });

  test('existing early-return points for "no session" and "no/invalid plan" are preserved (data-loading and empty-state logic unchanged)', () => {
    assert.match(loadBlock, /if \(!session\?\.user\.id\)/);
    assert.match(loadBlock, /isValidAssessment\(data\.ai_assessment\)/);
  });
});
