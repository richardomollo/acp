import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProfessionalAttention,
  clientsNeedingAttention,
  type ProAttentionEvidence,
} from '../session-attention.ts';

const ev = (over: Partial<ProAttentionEvidence> = {}): ProAttentionEvidence => ({
  clientId: 'c1',
  clientName: 'James Mwangi',
  relationshipStatus: 'active',
  shareProgress: true,
  todayLocalDate: '2026-09-14',
  ...over,
});

describe('§15 — deterministic reasons, conservative wording', () => {
  test('follow-up due → attention', () => {
    const r = classifyProfessionalAttention(ev({ followUpDueOn: '2026-09-14' }));
    assert.equal(r.verdict, 'attention');
    assert.equal(r.reasons[0].code, 'follow_up_due');
  });
  test('future follow-up → not surfaced', () => {
    const r = classifyProfessionalAttention(ev({ followUpDueOn: '2026-09-30' }));
    assert.equal(r.verdict, 'insufficient_evidence');
  });
  test('upcoming session within 2 days → attention', () => {
    assert.equal(classifyProfessionalAttention(ev({ daysToNextBooking: 0 })).reasons[0].text, 'Session with you today.');
    assert.equal(classifyProfessionalAttention(ev({ daysToNextBooking: 1 })).verdict, 'attention');
    assert.equal(classifyProfessionalAttention(ev({ daysToNextBooking: 5 })).verdict, 'insufficient_evidence');
  });
  test('open actions → attention (actionable)', () => {
    const r = classifyProfessionalAttention(ev({ openActionCount: 2 }));
    assert.equal(r.verdict, 'attention');
    assert.match(r.reasons[0].text, /2 actions you set are still open\./);
  });
  test('new client → ok (informational, not actionable)', () => {
    const r = classifyProfessionalAttention(ev({ relationshipAgeDays: 3 }));
    assert.equal(r.verdict, 'ok');
    assert.equal(r.reasons[0].code, 'new_client');
  });
});

describe('§4 / §15 — protected reasons gated on consent', () => {
  test('new measurement only counts with active + share_progress', () => {
    assert.equal(classifyProfessionalAttention(ev({ daysSinceLastMeasurement: 1 })).reasons.some((r) => r.code === 'new_measurement'), true);
    assert.equal(
      classifyProfessionalAttention(ev({ shareProgress: false, daysSinceLastMeasurement: 1 })).reasons.some((r) => r.code === 'new_measurement'),
      false,
    );
  });
  test('low recent activity is protected + conservative wording', () => {
    const r = classifyProfessionalAttention(ev({ activitiesLast14d: 0 }));
    assert.equal(r.verdict, 'attention');
    assert.match(r.reasons.find((x) => x.code === 'low_recent_activity')!.text, /appears lower than usual/);
    assert.doesNotMatch(r.reasons[0].text, /motivation|disengag|commitment/i);
    // no consent → not evaluated
    assert.equal(
      classifyProfessionalAttention(ev({ shareProgress: false, activitiesLast14d: 0 })).reasons.some((x) => x.code === 'low_recent_activity'),
      false,
    );
  });
  test('active but not sharing → single gentle no_shared_progress reason, verdict ok', () => {
    const r = classifyProfessionalAttention(ev({ shareProgress: false }));
    assert.deepEqual(r.reasons.map((x) => x.code), ['no_shared_progress']);
    assert.equal(r.verdict, 'ok');
  });
  test('inactive relationship → no protected signal, no no_shared_progress noise', () => {
    const r = classifyProfessionalAttention(ev({ relationshipStatus: 'inactive', shareProgress: true, daysSinceLastMeasurement: 1 }));
    assert.equal(r.reasons.some((x) => x.code === 'new_measurement'), false);
    assert.equal(r.reasons.some((x) => x.code === 'no_shared_progress'), false);
  });
});

describe('no evidence → insufficient_evidence, never fabricated', () => {
  test('empty evidence', () => {
    assert.equal(classifyProfessionalAttention(ev()).verdict, 'insufficient_evidence');
  });
});

describe('clientsNeedingAttention — filter + rank', () => {
  test('keeps only attention, follow_up_due before action_incomplete', () => {
    const results = [
      classifyProfessionalAttention(ev({ clientId: 'a', clientName: 'Ann', openActionCount: 1 })),
      classifyProfessionalAttention(ev({ clientId: 'b', clientName: 'Bea', followUpDueOn: '2026-09-14' })),
      classifyProfessionalAttention(ev({ clientId: 'c', clientName: 'Cy', relationshipAgeDays: 2 })), // ok, filtered out
    ];
    const out = clientsNeedingAttention(results);
    assert.deepEqual(out.map((r) => r.clientId), ['b', 'a']);
  });
});
