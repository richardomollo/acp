import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionRecency,
  taskPeriod,
  isTaskDoneForPeriod,
  isEligibleForToday,
  selectTodayActions,
  groupOpenTasksByProfessional,
  buildContinuityModel,
  attributionLabel,
  professionalDisplayName,
  flavourNoun,
  EMPTY_CONTINUITY_MODEL,
  type ContinuityTaskRow,
  type ContinuitySessionRow,
} from '../professional-continuity.ts';

const TODAY = '2026-09-14'; // Monday

const task = (o: Partial<ContinuityTaskRow> = {}): ContinuityTaskRow => ({
  id: o.id ?? 't1',
  title: o.title ?? 'Recovery Wednesday',
  status: o.status ?? 'pending',
  dueDate: o.dueDate ?? null,
  recurrence: o.recurrence ?? 'once',
  weekdays: o.weekdays ?? [],
  lastCompletedDate: o.lastCompletedDate ?? null,
  sessionRecordId: o.sessionRecordId ?? null,
  professionalName: o.professionalName ?? 'Richard',
  ...o,
});
const sess = (o: Partial<ContinuitySessionRow> = {}): ContinuitySessionRow => ({
  sessionId: o.sessionId ?? 's1',
  serviceType: o.serviceType ?? 'Strength coaching',
  professionalFlavour: o.professionalFlavour ?? 'training',
  focus: o.focus ?? 'Lower-body strength',
  clientSummary: o.clientSummary ?? 'Keep the next two days lighter.',
  followUpAt: o.followUpAt ?? '2026-09-13',
  completedAt: o.completedAt ?? `${TODAY}T11:00:00Z`,
  professionalName: o.professionalName ?? 'Richard',
  ...o,
});

// ── §18.1-3 recency ────────────────────────────────────────────────────
describe('sessionRecency', () => {
  test('§18.1 completed today → completed_today', () => {
    assert.equal(sessionRecency(`${TODAY}T09:00:00Z`, TODAY), 'completed_today');
  });
  test('§18.2 2 days ago → recent', () => {
    assert.equal(sessionRecency('2026-09-12T09:00:00Z', TODAY), 'recent');
    assert.equal(sessionRecency('2026-09-13T23:00:00Z', TODAY), 'recent'); // 1 day
    assert.equal(sessionRecency('2026-09-11T00:00:00Z', TODAY), 'recent'); // 3 days
  });
  test('§18.3 5 days ago → historical', () => {
    assert.equal(sessionRecency('2026-09-09T09:00:00Z', TODAY), 'historical');
    assert.equal(sessionRecency('2026-09-10T09:00:00Z', TODAY), 'historical'); // 4 days
  });
  test('null / future → none', () => {
    assert.equal(sessionRecency(null, TODAY), 'none');
    assert.equal(sessionRecency('2026-09-20T09:00:00Z', TODAY), 'none');
  });
});

// ── §18.4-9 Today eligibility ─────────────────────────────────────────
describe('isEligibleForToday', () => {
  test('§18.4 daily unfinished → Today', () => {
    assert.deepEqual(isEligibleForToday(task({ recurrence: 'daily' }), TODAY), {
      task: task({ recurrence: 'daily' }),
      overdue: false,
    });
  });
  test('§18.5 weekly on wrong weekday → excluded', () => {
    // TODAY is Monday (getUTCDay 1); weekdays [3] = Wednesday
    assert.equal(isEligibleForToday(task({ recurrence: 'weekly', weekdays: [3] }), TODAY), null);
    // weekly on Monday → included
    assert.ok(isEligibleForToday(task({ recurrence: 'weekly', weekdays: [1] }), TODAY));
  });
  test('§18.6 once due today → Today, not overdue', () => {
    const r = isEligibleForToday(task({ recurrence: 'once', dueDate: TODAY }), TODAY);
    assert.equal(r?.overdue, false);
  });
  test('§18.7 once overdue → Today + overdue', () => {
    const r = isEligibleForToday(task({ recurrence: 'once', dueDate: '2026-09-10' }), TODAY);
    assert.equal(r?.overdue, true);
  });
  test('§18.8 once with no due date → list only (not Today)', () => {
    assert.equal(isEligibleForToday(task({ recurrence: 'once', dueDate: null }), TODAY), null);
  });
  test('once due in the future → not yet', () => {
    assert.equal(isEligibleForToday(task({ recurrence: 'once', dueDate: '2026-09-20' }), TODAY), null);
  });
  test('§18.9 completed task → excluded', () => {
    assert.equal(isEligibleForToday(task({ recurrence: 'once', dueDate: TODAY, status: 'done' }), TODAY), null);
    assert.equal(
      isEligibleForToday(task({ recurrence: 'daily', lastCompletedDate: TODAY }), TODAY),
      null,
    );
  });
});

describe('taskPeriod / isTaskDoneForPeriod', () => {
  test('weekly period walks back to the last matching weekday', () => {
    // TODAY Monday, weekdays [3]=Wed → last Wed was 2026-09-09
    assert.equal(taskPeriod({ recurrence: 'weekly', weekdays: [3], dueDate: null }, TODAY), '2026-09-09');
  });
  test('daily done today', () => {
    assert.equal(isTaskDoneForPeriod(task({ recurrence: 'daily', lastCompletedDate: TODAY }), TODAY), true);
    assert.equal(isTaskDoneForPeriod(task({ recurrence: 'daily', lastCompletedDate: '2026-09-13' }), TODAY), false);
  });
});

// ── §18.10 cap / overflow ────────────────────────────────────────────
describe('selectTodayActions', () => {
  test('≤3 → all shown, no overflow', () => {
    const ts = [1, 2, 3].map((i) => task({ id: `t${i}`, recurrence: 'daily' }));
    const r = selectTodayActions(ts, TODAY);
    assert.equal(r.shown.length, 3);
    assert.equal(r.overflow, 0);
  });
  test('§18.10 >3 → first 2 + overflow affordance', () => {
    const ts = [1, 2, 3, 4, 5].map((i) => task({ id: `t${i}`, recurrence: 'daily', title: `T${i}` }));
    const r = selectTodayActions(ts, TODAY);
    assert.equal(r.shown.length, 2);
    assert.equal(r.overflow, 3);
    assert.equal(r.all.length, 5);
  });
  test('overdue sorts first', () => {
    const r = selectTodayActions(
      [
        task({ id: 'a', recurrence: 'once', dueDate: TODAY, title: 'today' }),
        task({ id: 'b', recurrence: 'once', dueDate: '2026-09-10', title: 'overdue' }),
      ],
      TODAY,
    );
    assert.equal(r.shown[0].task.id, 'b');
    assert.equal(r.shown[0].overdue, true);
  });
});

// ── §18.11-12 attribution ───────────────────────────────────────────
describe('attribution', () => {
  test('§18.11 multiple professionals → separate groups, sorted, done excluded', () => {
    const groups = groupOpenTasksByProfessional(
      [
        task({ id: '1', professionalName: 'Richard', title: 'Recovery' }),
        task({ id: '2', professionalName: 'Amina', title: 'Log breakfast' }),
        task({ id: '3', professionalName: 'Richard', title: 'Mobility', status: 'done', recurrence: 'once' }),
      ],
      TODAY,
    );
    assert.deepEqual(groups.map((g) => g.professionalName), ['Amina', 'Richard']);
    assert.equal(groups.find((g) => g.professionalName === 'Richard')!.tasks.length, 1);
  });
  test('§18.12 missing professional → "your coach"', () => {
    assert.equal(professionalDisplayName(null), 'your coach');
    assert.equal(professionalDisplayName('  '), 'your coach');
    assert.equal(attributionLabel(null), 'From your coach');
    assert.equal(attributionLabel('Richard'), 'From Richard');
  });
  test('flavour noun', () => {
    assert.equal(flavourNoun('nutrition'), 'nutritionist');
    assert.equal(flavourNoun('therapy'), 'wellness professional');
    assert.equal(flavourNoun('training'), 'trainer');
    assert.equal(flavourNoun('general'), 'coach');
    assert.equal(flavourNoun(null), 'coach');
  });
});

// ── §18.13 empty ────────────────────────────────────────────────────
describe('buildContinuityModel', () => {
  test('§18.13 empty feed → empty model, no UI', () => {
    const m = buildContinuityModel({ sessions: [], tasks: [], todayLocalDate: TODAY });
    assert.equal(m.hasAny, false);
    assert.equal(m.showHomeCard, false);
    assert.equal(m.latestSession, null);
    assert.deepEqual(m.today.shown, []);
    assert.deepEqual(m, { ...EMPTY_CONTINUITY_MODEL, today: m.today, sessions: [], groups: [] });
  });

  test('completed-today session → showHomeCard, linked tasks, today actions', () => {
    const m = buildContinuityModel({
      sessions: [sess()],
      tasks: [
        task({ id: 'a', sessionRecordId: 's1', recurrence: 'once', dueDate: TODAY, title: 'Recovery' }),
        task({ id: 'b', sessionRecordId: 's1', recurrence: 'once', dueDate: '2026-09-18', title: 'Thursday workout' }),
      ],
      todayLocalDate: TODAY,
    });
    assert.equal(m.showHomeCard, true);
    assert.equal(m.latestRecency, 'completed_today');
    assert.equal(m.latestSessionTasks.length, 2);
    assert.deepEqual(m.today.shown.map((a) => a.task.id), ['a']); // only the one due today
  });

  test('yesterday session → no Home card, still in list', () => {
    const m = buildContinuityModel({
      sessions: [sess({ completedAt: '2026-09-13T10:00:00Z' })],
      tasks: [],
      todayLocalDate: TODAY,
    });
    assert.equal(m.showHomeCard, false);
    assert.equal(m.latestRecency, 'recent');
    assert.equal(m.sessions.length, 1);
    assert.equal(m.hasAny, true);
  });

  test('most recent session wins', () => {
    const m = buildContinuityModel({
      sessions: [
        sess({ sessionId: 'old', completedAt: '2026-09-01T10:00:00Z' }),
        sess({ sessionId: 'new', completedAt: `${TODAY}T10:00:00Z` }),
      ],
      tasks: [],
      todayLocalDate: TODAY,
    });
    assert.equal(m.latestSession?.sessionId, 'new');
  });
});

// ── §18.14-15 rest-day + provenance are asserted in home-plan-state + copy
// tests; here we assert the model never emits a Lana-voiced professional line.
describe('§18.15 provenance never becomes Lana', () => {
  test('attributionLabel always names a professional, never "Lana"', () => {
    for (const n of ['Richard', '', null, '  ', 'Dr Amina Yusuf']) {
      const label = attributionLabel(n);
      assert.doesNotMatch(label, /lana/i);
      assert.ok(label.startsWith('From '));
    }
  });
});
