import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_STAGED_CLIENT,
  validateStagedClient,
  stagedClientIsValid,
  stagedClientName,
  splitCsvLine,
  parseClientCsv,
  contactKeys,
  findDuplicateIndexes,
  isDuplicateOf,
  buildInvitePreview,
  newInviteCode,
  isPlausibleInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  isInviteState,
  type StagedClient,
} from '../client-invite.ts';

const client = (over: Partial<StagedClient> = {}): StagedClient => ({
  ...EMPTY_STAGED_CLIENT,
  ...over,
});

// ── validateStagedClient ────────────────────────────────────────────────

describe('validateStagedClient', () => {
  test('needs a first name', () => {
    const e = validateStagedClient(client({ mobile: '0712345678' }));
    assert.equal(e.firstName, 'Add a first name.');
  });

  test('a plausible mobile alone is enough — email optional', () => {
    assert.equal(stagedClientIsValid(client({ firstName: 'James', mobile: '+254712345678' })), true);
  });

  test('a plausible email alone is enough — mobile optional', () => {
    assert.equal(stagedClientIsValid(client({ firstName: 'James', email: 'j@example.com' })), true);
  });

  test('no viable contact method → contact error', () => {
    const e = validateStagedClient(client({ firstName: 'James' }));
    assert.ok(e.contact);
  });

  test('a typed-but-malformed email is flagged, not silently ignored', () => {
    const e = validateStagedClient(client({ firstName: 'James', email: 'not-an-email' }));
    assert.equal(e.email, 'Check this email address.');
    assert.ok(e.contact); // still no viable method
  });

  test('a malformed mobile with a valid email is fine but still flags the mobile', () => {
    const e = validateStagedClient(client({ firstName: 'J', email: 'j@x.co', mobile: '12' }));
    assert.equal(e.mobile, 'Check this mobile number.');
    assert.equal(e.contact, undefined);
  });
});

describe('stagedClientName', () => {
  test('joins and trims', () => {
    assert.equal(stagedClientName({ firstName: ' James ', lastName: 'Odhiambo ' }), 'James Odhiambo');
    assert.equal(stagedClientName({ firstName: 'James', lastName: '' }), 'James');
  });
});

// ── CSV ─────────────────────────────────────────────────────────────────

describe('splitCsvLine', () => {
  test('handles quoted fields with commas and "" escapes', () => {
    assert.deepEqual(
      splitCsvLine('"Odhiambo, James",j@x.co,"he said ""hi"""'),
      ['Odhiambo, James', 'j@x.co', 'he said "hi"'],
    );
  });
});

describe('parseClientCsv', () => {
  test('maps aliased, order-independent headers', () => {
    const csv = [
      'Email,First,Surname,Phone',
      'a@x.co,Ann,Kariuki,0712000001',
    ].join('\n');
    const r = parseClientCsv(csv);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].client.firstName, 'Ann');
    assert.equal(r.rows[0].client.lastName, 'Kariuki');
    assert.equal(r.rows[0].client.email, 'a@x.co');
    assert.equal(r.rows[0].status, 'ready');
  });

  test('per-row status: ready / missing_contact / duplicate', () => {
    const csv = [
      'First name,Last name,Mobile,Email',
      'Ann,K,0712000001,ann@x.co',
      'Bea,L,,',
      'Cy,M,0712000001,',            // dup mobile of row 1
      'Di,N,,di@x.co',
    ].join('\n');
    const r = parseClientCsv(csv);
    assert.deepEqual(r.rows.map((x) => x.status), ['ready', 'missing_contact', 'duplicate', 'ready']);
    assert.equal(r.readyCount, 2);
  });

  test('missing-name rows are flagged too', () => {
    const r = parseClientCsv(['First name,Mobile\n,0712000009'].join('\n'));
    assert.equal(r.rows[0].status, 'missing_contact');
  });

  test('unrecognised header → headerError, no rows', () => {
    const r = parseClientCsv('foo,bar\n1,2');
    assert.ok(r.headerError);
    assert.equal(r.rows.length, 0);
  });

  test('header only → empty', () => {
    const r = parseClientCsv('First name,Last name,Mobile,Email');
    assert.equal(r.empty, true);
    assert.equal(r.rows.length, 0);
  });

  test('blank input → empty, no throw', () => {
    assert.equal(parseClientCsv('').empty, true);
    assert.equal(parseClientCsv('   \n  ').empty, true);
  });
});

// ── duplicates ──────────────────────────────────────────────────────────

describe('contact keys + duplicate detection', () => {
  test('phone keys collapse +254 / 0-prefix variants', () => {
    const a = contactKeys({ email: '', mobile: '+254712345678' });
    const b = contactKeys({ email: '', mobile: '0712345678' });
    assert.deepEqual(a, b);
  });

  test('email keys are case-insensitive', () => {
    assert.deepEqual(
      contactKeys({ email: 'J@X.CO', mobile: '' }),
      contactKeys({ email: 'j@x.co', mobile: '' }),
    );
  });

  test('findDuplicateIndexes / isDuplicateOf against a staged list', () => {
    const staged: StagedClient[] = [
      client({ firstName: 'Ann', email: 'ann@x.co' }),
      client({ firstName: 'Bea', mobile: '0712345678' }),
    ];
    assert.deepEqual(findDuplicateIndexes(staged, client({ firstName: 'A', mobile: '+254712345678' })), [1]);
    assert.equal(isDuplicateOf(staged, client({ firstName: 'C', email: 'new@x.co' })), false);
  });

  test('a candidate with no viable contact is never a duplicate', () => {
    assert.equal(isDuplicateOf([client({ firstName: 'A', email: 'a@x.co' })], client({ firstName: 'A' })), false);
  });
});

// ── invite preview copy (exact strings from the spec) ───────────────────

describe('buildInvitePreview', () => {
  test('produces the exact spec copy', () => {
    const p = buildInvitePreview({ professionalFirstName: 'Richard Omollo', inviteeFirstName: 'James' });
    assert.equal(p.title, 'Invite James to Lana');
    assert.equal(
      p.body,
      'Richard has invited you to join them on Lana — a place to follow your fitness plan, track your progress and stay connected between sessions.',
    );
    assert.equal(p.cta, 'Join Richard on Lana');
  });

  test('degrades gracefully with missing names', () => {
    const p = buildInvitePreview({ professionalFirstName: '', inviteeFirstName: '' });
    assert.equal(p.title, 'Invite there to Lana');
    assert.ok(p.body.startsWith('Your professional has invited you'));
  });

  test('never leaks more than first names', () => {
    const p = buildInvitePreview({ professionalFirstName: 'Dr Jane Smith PhD', inviteeFirstName: 'Bob Jones' });
    assert.equal(p.title, 'Invite Bob to Lana');
    assert.ok(!p.body.includes('Jones'));
    assert.ok(!p.body.includes('Smith'));
  });
});

// ── invite code ─────────────────────────────────────────────────────────

describe('newInviteCode', () => {
  test('8 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      assert.equal(c.length, INVITE_CODE_LENGTH);
      assert.ok([...c].every((ch) => INVITE_CODE_ALPHABET.includes(ch)));
      assert.ok(!/[01OI]/.test(c));
    }
  });

  test('is deterministic given a seeded RNG', () => {
    const make = () => {
      const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3, 0.4, 0.6];
      let i = 0;
      return () => seq[i++ % seq.length];
    };
    assert.equal(newInviteCode(make()), newInviteCode(make()));
    assert.equal(newInviteCode(make()), 'AS9DGKNV'); // fixed output for this seed
  });

  test('isPlausibleInviteCode', () => {
    assert.equal(isPlausibleInviteCode(newInviteCode()), true);
    assert.equal(isPlausibleInviteCode('abc'), false);
    assert.equal(isPlausibleInviteCode('AAAA0AAA'), false); // 0 not in alphabet
    assert.equal(isPlausibleInviteCode(12345678), false);
  });
});

describe('isInviteState', () => {
  test('accepts the five lifecycle values only', () => {
    for (const v of ['draft', 'sent', 'accepted', 'expired', 'cancelled']) {
      assert.equal(isInviteState(v), true);
    }
    assert.equal(isInviteState('active'), false);
    assert.equal(isInviteState(null), false);
  });
});
