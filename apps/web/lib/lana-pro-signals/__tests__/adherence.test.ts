import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeAdherenceFacts, type ScheduleRow } from '../../lana-pro-progress/progress.ts';
import { deriveAdherenceSignals, ADHERENCE_DETECTOR_VERSION } from '../adherence.ts';

const TODAY = '2026-09-10'; // Thu → recent week 08-31..09-06, baseline 08-17..08-30
const titleById = new Map([['w', 'Upper strength']]);
const mwf: ScheduleRow = { workout_id: 'w', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true };
const comp = (id: string, date: string) => ({ id, workoutId: 'w', date });

/** helper: facts from a MWF plan + the given completion dates */
function facts(dates: string[]) {
  return computeAdherenceFacts({
    schedules: [mwf],
    completions: dates.map((d, i) => comp(`c${i}`, d)),
    titleById,
    todayLocalDate: TODAY,
  });
}

describe('deriveAdherenceSignals — the drop rule (§13/§L)', () => {
  test('§34 — clear drop (baseline 5/6, recent 1/3) → one adherence_drop signal', () => {
    const sig = deriveAdherenceSignals(
      facts(['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-31']),
      'client-1',
    );
    assert.equal(sig.length, 1);
    assert.equal(sig[0].type, 'adherence_drop');
    assert.equal(sig[0].clientId, 'client-1');
    assert.deepEqual(
      { s: sig[0].recent.scheduled, c: sig[0].recent.completed, m: sig[0].recent.missed },
      { s: 3, c: 1, m: 2 },
    );
    assert.deepEqual(
      { s: sig[0].baseline.scheduled, c: sig[0].baseline.completed },
      { s: 6, c: 5 },
    );
    assert.equal(sig[0].dropPct, 50);
    assert.equal(sig[0].detectorVersion, ADHERENCE_DETECTOR_VERSION);
    // traceable to real completions + planned occurrences
    assert.ok(sig[0].occurrenceRefs.some((r) => r.startsWith('workout_history:')));
    assert.ok(sig[0].occurrenceRefs.some((r) => r.startsWith('schedule:')));
    assert.equal(sig[0].observedAt, '2026-09-06T23:59:59Z');
  });

  test('§35 — a single missed session (baseline 6/6, recent 2/3) → NO signal', () => {
    const sig = deriveAdherenceSignals(
      facts([
        '2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-28', // baseline 6/6
        '2026-08-31', '2026-09-02', // recent 2/3 (miss 09-04)
      ]),
      'client-1',
    );
    assert.deepEqual(sig, []);
  });

  test('§38/§15 — no baseline (schedule started recently) → NO signal, whatever the recent rate', () => {
    // weekly Mon only, starting inside the baseline window → 2 baseline occurrences (< min 4)
    const sig = deriveAdherenceSignals(
      computeAdherenceFacts({
        schedules: [{ workout_id: 'w', start_date: '2026-08-17', recurrence: 'weekly', weekdays: [1], is_active: true }],
        completions: [],
        titleById,
        todayLocalDate: TODAY,
      }),
      'new-client',
    );
    assert.deepEqual(sig, []);
  });

  test('borderline: baseline consistent but recent 2/3 completed (rate 0.67 > ceiling) → NO signal', () => {
    const sig = deriveAdherenceSignals(
      facts(['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-31', '2026-09-02']),
      'client-1',
    );
    assert.deepEqual(sig, []);
  });

  test('null facts → []', () => {
    assert.deepEqual(deriveAdherenceSignals(null, 'c'), []);
  });

  test('§44 — deterministic: same facts twice → deepEqual signals incl. id', () => {
    const dates = ['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26', '2026-08-31'];
    assert.deepEqual(deriveAdherenceSignals(facts(dates), 'c-1'), deriveAdherenceSignals(facts(dates), 'c-1'));
  });
});

describe('deriveAdherenceSignals — §17 no cause, §33 no side effects', () => {
  test('the signal states WHAT changed, never WHY — no motivation/engagement/churn fields', () => {
    const src = readFileSync(fileURLToPath(new URL('../adherence.ts', import.meta.url)), 'utf8').toLowerCase();
    for (const banned of ['motivation', 'engagement', 'churn', 'disengage', 'losing interest', 'too hard', 'lazy']) {
      assert.ok(!src.includes(banned), `adherence.ts must not reference "${banned}"`);
    }
  });

  test('pure: no db / fetch / llm / writes in the detector', () => {
    const src = readFileSync(fileURLToPath(new URL('../adherence.ts', import.meta.url)), 'utf8').toLowerCase();
    for (const banned of ['supabase', 'fetch(', 'openai', 'anthropic', '.insert(', '.update(', '.from(', 'process.env']) {
      assert.ok(!src.includes(banned), `adherence.ts must not contain "${banned}"`);
    }
  });
});

// ═══════════ Lana-plan-only client → same canonical signal (§34/§37) ═══════
describe('deriveAdherenceSignals — driven by the merged spine (Lana plan)', () => {
  test('a Lana-plan-only client with baseline 5/6, recent 1/3 → the SAME adherence_drop signal', () => {
    const lo = (date: string, completed: boolean) => ({ date, title: 'Lana', category: null, durationMinutes: null, completed });
    const f = computeAdherenceFacts({
      schedules: [], completions: [], titleById: new Map(), todayLocalDate: TODAY,
      lanaOccurrences: [
        lo('2026-08-17', true), lo('2026-08-19', true), lo('2026-08-21', true),
        lo('2026-08-24', true), lo('2026-08-26', true), lo('2026-08-28', false),
        lo('2026-08-31', true), lo('2026-09-02', false), lo('2026-09-04', false),
      ],
    });
    const sig = deriveAdherenceSignals(f, 'client-1');
    assert.equal(sig.length, 1);
    assert.equal(sig[0].type, 'adherence_drop');
    assert.deepEqual({ s: sig[0].recent.scheduled, c: sig[0].recent.completed, m: sig[0].recent.missed }, { s: 3, c: 1, m: 2 });
    assert.deepEqual({ s: sig[0].baseline.scheduled, c: sig[0].baseline.completed }, { s: 6, c: 5 });
    assert.equal(sig[0].dropPct, 50);
    assert.equal(sig[0].detectorVersion, ADHERENCE_DETECTOR_VERSION);
  });
});
