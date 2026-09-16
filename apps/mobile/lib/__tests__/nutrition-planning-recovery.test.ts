// Lana Nutrition Closed-Loop V1 — Pre-Device-QA Hardening.
//
// The recovery contract (an existing 'nutrition_weekly_plans' row must
// never be returned with incomplete/zero 'nutrition_planned_meals' rows
// forever) is proven at the DATA level by a live-DB scenario script run
// against local Supabase this session (partial-week resume, zero-meal
// resume, idempotent complete-week no-op, and 23505 duplicate protection
// all confirmed — see the pre-QA hardening report). That script can't live
// here as a node:test file: nutrition-planning-service.ts imports
// lib/supabase.tsx, which imports react-native/AsyncStorage and cannot
// load under plain `node --test` (no RN runtime), exactly like every other
// Supabase-backed service in this codebase.
//
// This file instead pins the ARCHITECTURE the live-DB proof depends on, at
// the source level, the same pattern already used by
// nutrition-planning-candidate-source.test.ts — so a future edit that
// silently removes the resume call, reverts to one-batch-at-the-end
// insertion, or drops the 23505 tolerance fails a test immediately rather
// than only failing quietly on a real device.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../../services/nutrition-planning-service.ts');
const source = readFileSync(SERVICE_PATH, 'utf-8');

describe('nutrition-planning-service.ts — pre-QA hardening: resumable generation', () => {
  test('A. a resume helper (ensureWeekGenerated) exists and is count-gated against a real, derivable upper bound', () => {
    assert.match(source, /async function ensureWeekGenerated\(/);
    // 7 days x the 4 canonical slots — the provable upper bound, not a
    // guessed/arbitrary number.
    assert.match(source, /MAX_PLANNED_MEALS_PER_WEEK\s*=\s*7\s*\*\s*CANONICAL_SLOTS\.length/);
  });

  test('B. getOrCreateCurrentWeek calls the resume helper on BOTH the promoted-week branch and the already-current-week branch (not just on fresh creation)', () => {
    const fn = source.slice(source.indexOf('async function getOrCreateCurrentWeek'), source.indexOf('// ── Public API'));
    const calls = fn.match(/ensureWeekGenerated\(/g) ?? [];
    assert.equal(calls.length, 2, `expected exactly 2 resume calls inside getOrCreateCurrentWeek, found ${calls.length}`);
  });

  test('C. prepareNextWeek resumes generation on its existing-week branch WITHOUT re-running strategy/adaptation/objective logic', () => {
    const start = source.indexOf('async prepareNextWeek(');
    const existingBranchStart = source.indexOf('if (existing) {', start);
    const existingBranchEnd = source.indexOf('\n    }', existingBranchStart);
    const branch = source.slice(existingBranchStart, existingBranchEnd);
    assert.match(branch, /ensureWeekGenerated\(/, 'existing-week branch must resume generation');
    for (const forbidden of ['buildMonthlyStrategy(', 'evaluateWeeklyAdaptation(', 'resolveNextWeekObjective(', 'aggregateWeeklyEvidence(']) {
      assert.ok(!branch.includes(forbidden), `existing-week branch must NOT call ${forbidden} — retry must never change the weekly objective`);
    }
  });

  test('D. generateWeekPlannedMeals inserts PER DAY (inside the date loop), not as one batch after the loop — so a mid-week failure preserves earlier days', () => {
    const fn = source.slice(source.indexOf('async function generateWeekPlannedMeals'), source.indexOf('const MAX_PLANNED_MEALS_PER_WEEK'));
    const loopStart = fn.indexOf('for (const date of dates)');
    const loopBody = fn.slice(loopStart);
    assert.match(loopBody, /supabase\.from\('nutrition_planned_meals'\)\.insert\(/, 'the insert call must be reachable from inside the per-date loop');
    // the old failure mode: accumulating into one array and inserting once
    // after the loop closes. Guard against regressing back to that shape.
    assert.ok(!/toInsert: Record<string, unknown>\[\] = \[\];\s*\n\s*for \(const date of dates\)/.test(fn), 'must not reintroduce a single week-wide accumulator inserted only after the loop');
  });

  test('E. the per-day insert tolerates a concurrent duplicate (23505) instead of throwing — no new locking introduced', () => {
    const fn = source.slice(source.indexOf('async function generateWeekPlannedMeals'), source.indexOf('const MAX_PLANNED_MEALS_PER_WEEK'));
    assert.match(fn, /code === '23505'/);
    assert.ok(!/mutex|\bLock\b|advisory_lock|pg_advisory/i.test(fn), 'no new locking mechanism should be introduced for concurrency safety');
  });

  test('F. ensureWeekGenerated short-circuits (no regeneration call) once the count reaches the complete threshold — no reranking of an already-complete week', () => {
    const fn = source.slice(source.indexOf('async function ensureWeekGenerated'), source.indexOf('// ── Public API'));
    assert.match(fn, /if \(\(count \?\? 0\) >= MAX_PLANNED_MEALS_PER_WEEK\) return;/);
  });
});
