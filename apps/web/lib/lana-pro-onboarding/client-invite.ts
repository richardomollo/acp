// LANA PRO — Phase 3: existing-client acquisition & invitation (PURE core).
//
// Product principle: "The professional owns the client relationship. Lana
// enhances it." This is "bring your clients with you", not "hand Lana your
// customer database" — so:
//   • staged client PII lives ONLY in React component state, never in the
//     onboarding draft / localStorage (the machine records just a count);
//   • nothing is sent until the professional explicitly confirms;
//   • an invited person becomes an ACTIVE client only when THEY accept
//     (existing Lana consent architecture — `redeem_pt_invite_code` /
//     search-invite accept — is untouched).
//
// This module owns the pure, testable pieces: staged-client validation, CSV
// parsing + per-row status, duplicate detection, the invitation preview copy,
// and invite-code generation. No React, no DOM, no Supabase.

import { isPlausibleEmail, isPlausibleMobile } from './onboarding-machine.ts';

// ── Staged client ────────────────────────────────────────────────────────────

export interface StagedClient {
  firstName: string;
  lastName: string;
  /** E.164-ish or local; validated loosely (7–15 digits). */
  mobile: string;
  /** Optional when a mobile is present. */
  email: string;
}

export const EMPTY_STAGED_CLIENT: StagedClient = {
  firstName: '',
  lastName: '',
  mobile: '',
  email: '',
};

export type StagedClientField = keyof StagedClient;

export interface StagedClientErrors {
  firstName?: string;
  lastName?: string;
  contact?: string; // one message covers "need a viable email OR mobile"
  email?: string;
  mobile?: string;
}

/** A staged client needs a first name and at least ONE viable contact method:
 *  a plausible email OR a plausible mobile. Email is optional iff a mobile is
 *  given. A malformed value that was actually typed is flagged, so a typo isn't
 *  silently treated as "no contact". */
export function validateStagedClient(input: StagedClient): StagedClientErrors {
  const errors: StagedClientErrors = {};
  const firstName = input.firstName.trim();
  const email = input.email.trim();
  const mobile = input.mobile.trim();

  if (firstName.length === 0) errors.firstName = 'Add a first name.';

  const emailOk = email.length > 0 && isPlausibleEmail(email);
  const mobileOk = mobile.length > 0 && isPlausibleMobile(mobile);

  if (email.length > 0 && !emailOk) errors.email = 'Check this email address.';
  if (mobile.length > 0 && !mobileOk) errors.mobile = 'Check this mobile number.';

  if (!emailOk && !mobileOk) {
    errors.contact = 'Add a mobile number or an email address so they can be invited.';
  }
  return errors;
}

export function stagedClientIsValid(input: StagedClient): boolean {
  return Object.keys(validateStagedClient(input)).length === 0;
}

/** "James Odhiambo" / "James" / "" — display name for previews and rows. */
export function stagedClientName(c: Pick<StagedClient, 'firstName' | 'lastName'>): string {
  return `${c.firstName.trim()} ${c.lastName.trim()}`.trim();
}

// ── CSV import ───────────────────────────────────────────────────────────────

export type CsvRowStatus = 'ready' | 'missing_contact' | 'duplicate';

export interface ParsedCsvRow {
  /** 1-based row number in the source file (excludes the header row). */
  rowNumber: number;
  client: StagedClient;
  status: CsvRowStatus;
  /** Human-readable reason when status !== 'ready'. */
  note: string;
}

export interface ParsedCsv {
  rows: ParsedCsvRow[];
  /** Rows that are safe to stage (status === 'ready'). */
  readyCount: number;
  /** True when no data rows were found at all. */
  empty: boolean;
  /** Set when the header could not be understood; rows is then []. */
  headerError?: string;
}

const HEADER_ALIASES: Record<StagedClientField, string[]> = {
  firstName: ['first name', 'firstname', 'first', 'given name', 'name'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'family name'],
  mobile: ['mobile', 'phone', 'phone number', 'mobile number', 'cell', 'telephone', 'tel'],
  email: ['email', 'email address', 'e-mail', 'mail'],
};

/** Split one CSV line, honouring double-quoted fields with embedded commas and
 *  "" escapes. Good enough for the "export contacts to CSV" files this accepts;
 *  not a full RFC-4180 parser. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function mapHeader(cells: string[]): Partial<Record<StagedClientField, number>> | null {
  const lower = cells.map((c) => c.toLowerCase().trim());
  const map: Partial<Record<StagedClientField, number>> = {};
  (Object.keys(HEADER_ALIASES) as StagedClientField[]).forEach((field) => {
    const idx = lower.findIndex((h) => HEADER_ALIASES[field].includes(h));
    if (idx >= 0) map[field] = idx;
  });
  // Need at least a name column and at least one contact column to be useful.
  const hasName = map.firstName != null || map.lastName != null;
  const hasContact = map.mobile != null || map.email != null;
  if (!hasName || !hasContact) return null;
  return map;
}

/**
 * Parse a pasted / uploaded CSV with columns:
 *   First name | Last name | Mobile | Email   (aliases + order-independent)
 * Each data row gets a status:
 *   ready            — has a name + at least one viable contact method
 *   missing_contact  — no viable email or mobile
 *   duplicate        — same viable contact as an earlier row in THIS file
 * Cross-checking against already-staged clients / existing Lana users happens
 * later (component + `search_client_by_contact`); this is file-local only.
 */
export function parseClientCsv(text: string): ParsedCsv {
  const lines = String(text ?? '')
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], readyCount: 0, empty: true };
  }

  const header = mapHeader(splitCsvLine(lines[0]));
  if (!header) {
    return {
      rows: [],
      readyCount: 0,
      empty: false,
      headerError:
        'Add a header row with columns for First name, Last name, Mobile and Email.',
    };
  }

  const seenContacts = new Set<string>();
  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const at = (idx?: number) => (idx == null ? '' : (cells[idx] ?? '').trim());
    const client: StagedClient = {
      firstName: at(header.firstName),
      lastName: at(header.lastName),
      mobile: at(header.mobile),
      email: at(header.email),
    };

    const errors = validateStagedClient(client);
    let status: CsvRowStatus;
    let note = '';

    if (errors.contact || errors.firstName) {
      status = 'missing_contact';
      note = errors.firstName
        ? 'Missing a name.'
        : 'Missing contact information.';
    } else {
      const keys = contactKeys(client);
      const clash = keys.find((k) => seenContacts.has(k));
      if (clash) {
        status = 'duplicate';
        note = 'Possible duplicate of an earlier row.';
      } else {
        status = 'ready';
        keys.forEach((k) => seenContacts.add(k));
      }
    }

    rows.push({ rowNumber: i, client, status, note });
  }

  if (rows.length === 0) {
    return { rows: [], readyCount: 0, empty: true };
  }

  return {
    rows,
    readyCount: rows.filter((r) => r.status === 'ready').length,
    empty: false,
  };
}

// ── Duplicate detection (against an existing staged list) ────────────────────

/** Normalised contact keys for de-duping: `email:foo@bar.com`, `tel:0712…`
 *  (digits only, last 9 kept so +254/0-prefix variants collapse). */
export function contactKeys(c: Pick<StagedClient, 'email' | 'mobile'>): string[] {
  const keys: string[] = [];
  const email = c.email.trim().toLowerCase();
  if (email.length > 0 && isPlausibleEmail(email)) keys.push(`email:${email}`);
  const digits = c.mobile.replace(/\D/g, '');
  if (digits.length >= 7) keys.push(`tel:${digits.slice(-9)}`);
  return keys;
}

/** Indices in `staged` that collide (by contact) with `candidate`. */
export function findDuplicateIndexes(
  staged: readonly StagedClient[],
  candidate: StagedClient,
): number[] {
  const keys = new Set(contactKeys(candidate));
  if (keys.size === 0) return [];
  const hits: number[] = [];
  staged.forEach((s, i) => {
    if (contactKeys(s).some((k) => keys.has(k))) hits.push(i);
  });
  return hits;
}

export function isDuplicateOf(
  staged: readonly StagedClient[],
  candidate: StagedClient,
): boolean {
  return findDuplicateIndexes(staged, candidate).length > 0;
}

// ── Invitation preview copy ─────────────────────────────────────────────────
//
// The professional sees this BEFORE anything is sent. Deliberately generic:
// NO health data, goals, measurements or programme info — a first name and the
// professional's first name only.

export interface InvitePreview {
  /** Card title. */
  title: string;
  /** Body line. */
  body: string;
  /** Button / call to action. */
  cta: string;
}

function firstNameOnly(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function buildInvitePreview(args: {
  professionalFirstName: string;
  inviteeFirstName: string;
}): InvitePreview {
  const pro = firstNameOnly(args.professionalFirstName) || 'Your professional';
  const invitee = firstNameOnly(args.inviteeFirstName) || 'there';
  return {
    title: `Invite ${invitee} to Lana`,
    body: `${pro} has invited you to join them on Lana — a place to follow your fitness plan, track your progress and stay connected between sessions.`,
    cta: `Join ${pro} on Lana`,
  };
}

// ── Invite code ─────────────────────────────────────────────────────────────

/** Unambiguous alphabet — no 0/O, 1/I. Matches the existing
 *  `app/pt-dashboard/clients/add/page.tsx` `randomCode()` so codes are
 *  consistent across the product and redeemable via `redeem_pt_invite_code`. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

export function newInviteCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_CODE_ALPHABET[Math.floor(rand() * INVITE_CODE_ALPHABET.length)];
  }
  return out;
}

export function isPlausibleInviteCode(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length === INVITE_CODE_LENGTH &&
    [...v].every((ch) => INVITE_CODE_ALPHABET.includes(ch))
  );
}

// ── Invitation lifecycle (the value contract, mirrored by the migration) ─────

/** Statuses the invitation relationship supports. `draft` = staged locally,
 *  never persisted; the rest are `pt_clients.invite_state` values. */
export const INVITE_STATES = ['draft', 'sent', 'accepted', 'expired', 'cancelled'] as const;
export type InviteState = (typeof INVITE_STATES)[number];

export function isInviteState(v: unknown): v is InviteState {
  return typeof v === 'string' && (INVITE_STATES as readonly string[]).includes(v);
}

/** How a staged client will be invited once the professional confirms. Decided
 *  by a `search_client_by_contact` lookup in the component:
 *   • existing_user  → send a CONNECTION request (pt_clients row w/ client_user_id,
 *                      status 'pending') — the person accepts inside Lana.
 *   • new_user       → create a code invitation (pt_clients row w/ invite_code),
 *                      the person installs Lana and redeems the code.
 * We NEVER silently attach an existing Lana account. */
export type InviteRoute = 'existing_user' | 'new_user';

export interface PlannedInvite {
  client: StagedClient;
  route: InviteRoute;
  /** Set for `existing_user`: the matched Lana user id. */
  matchedUserId?: string;
  /** Set for `new_user`: the code the invitee will redeem. */
  inviteCode?: string;
  preview: InvitePreview;
}
