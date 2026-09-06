// LANA PRO — Phase 4.1: Home view-model assembly (PURE).
//
// Home answers ONE question: "What needs my attention today?" — not "what
// modules exist". This builds the deterministic view-model both Home bodies
// (professional / business) render. It composes the other pure modules
// (today, activation) and reuses the Phase-1/3 contracts (completion state,
// client-attention) rather than re-deriving them.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import {
  deriveCompletionState,
  type MarketplaceVerificationState,
} from '../lana-pro-onboarding/onboarding-machine.ts';
import {
  classifyClientAttention,
  type ClientEvidence,
} from '../lana-pro-onboarding/client-attention.ts';
import { splitToday, type TodayItem, type TodaySplit } from './today.ts';
import {
  incompleteItems,
  isFullyActivated,
  type ChecklistItem,
} from './activation.ts';

// ── greeting ──────────────────────────────────────────────────────────────

export function greetingForHour(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function greetingFor(nowIso: string): string {
  const h = Number(nowIso.slice(11, 13));
  return greetingForHour(Number.isFinite(h) ? h : 9);
}

export function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

// ── verification notice ───────────────────────────────────────────────────

export interface VerificationNotice {
  /** The workspace is ALWAYS ready — this is never a blocking state. */
  workspaceReady: true;
  /** Show a small status strip? (false once fully live) */
  showNotice: boolean;
  headline: string;
  detail: string;
  tone: 'info' | 'pending' | 'warning';
}

export function professionalVerificationNotice(
  status: 'pending' | 'approved' | 'rejected' | 'suspended' | null,
): VerificationNotice {
  const completion = deriveCompletionState({
    accountCreated: true,
    branch: 'professional',
    personalTrainerStatus: status,
  });
  return fromMarketplaceState(completion.marketplaceVerification);
}

export function businessVerificationNotice(anyVenueActive: boolean): VerificationNotice {
  return fromMarketplaceState(
    anyVenueActive ? 'marketplace_verification_approved' : 'marketplace_verification_pending',
  );
}

function fromMarketplaceState(s: MarketplaceVerificationState | null): VerificationNotice {
  switch (s) {
    case 'marketplace_verification_approved':
      return {
        workspaceReady: true,
        showNotice: false,
        headline: 'Your Lana Pro workspace is live.',
        detail: 'Your public marketplace profile is visible to new clients.',
        tone: 'info',
      };
    case 'marketplace_verification_rejected':
      return {
        workspaceReady: true,
        showNotice: true,
        headline: 'Your Lana Pro workspace is ready.',
        detail: 'Your marketplace application needs another look — check your email or contact support.',
        tone: 'warning',
      };
    case 'marketplace_verification_suspended':
      return {
        workspaceReady: true,
        showNotice: true,
        headline: 'Your Lana Pro workspace is ready.',
        detail: 'Your marketplace profile is currently suspended. Your clients and tools are unaffected.',
        tone: 'warning',
      };
    default:
      return {
        workspaceReady: true,
        showNotice: true,
        headline: 'Your Lana Pro workspace is ready.',
        detail: 'Your public marketplace profile is still under review. Everything else works now.',
        tone: 'pending',
      };
  }
}

// ── Lana Intelligence placeholder (reuses the Phase-3 contract) ────────────

export type IntelligenceState = 'learning' | 'clear' | 'has_items';

export interface IntelligenceModel {
  state: IntelligenceState;
  headline: string;
  detail: string;
  /** Client ids flagged by the classifier (empty unless a real evidence
   *  producer is wired in — none exists in 4.1). */
  attentionClientIds: string[];
}

/**
 * @param clientEvidence one entry per active client (keyed by id). In 4.1 this
 *   is `{}` for every client (no producer) so the result is always `learning`.
 * @param opts.subject tunes only the "still learning" copy.
 */
export function buildIntelligenceModel(
  clientEvidence: Record<string, ClientEvidence>,
  opts: { subject?: 'clients' | 'business' } = {},
): IntelligenceModel {
  const ids = Object.keys(clientEvidence);
  const verdicts = ids.map((id) => ({ id, ...classifyClientAttention(clientEvidence[id]) }));
  const attention = verdicts.filter((v) => v.verdict === 'needs_attention').map((v) => v.id);
  const anyConcrete = verdicts.some((v) => v.verdict !== 'insufficient_evidence');

  if (attention.length > 0) {
    return {
      state: 'has_items',
      headline: `${attention.length} ${attention.length === 1 ? 'client needs' : 'clients need'} a look`,
      detail: 'Based on activity your clients have chosen to share.',
      attentionClientIds: attention,
    };
  }
  if (anyConcrete) {
    return {
      state: 'clear',
      headline: 'Nothing needs your attention right now.',
      detail: 'As your clients train and check in, Lana will surface useful changes here.',
      attentionClientIds: [],
    };
  }
  return {
    state: 'learning',
    headline:
      opts.subject === 'business'
        ? 'Lana is still learning from your activity.'
        : 'Lana is still learning from your clients’ activity.',
    detail:
      opts.subject === 'business'
        ? 'Lana will surface useful patterns here as your bookings and activity build up — never guesses.'
        : 'As your clients train and check in, Lana will surface useful changes here — never guesses.',
    attentionClientIds: [],
  };
}

// ── empty-state selection ─────────────────────────────────────────────────

export type HomeEmptyState =
  | 'none'
  | 'no_bookings'
  | 'clients_no_bookings'
  | 'business_no_schedule';

export interface EmptyStateModel {
  kind: HomeEmptyState;
  headline: string;
  subcopy: string;
  actions: { label: string; href: string }[];
}

export function professionalEmptyState(args: {
  hasTodayItems: boolean;
  activeClientCount: number;
}): EmptyStateModel {
  if (args.hasTodayItems) {
    return { kind: 'none', headline: '', subcopy: '', actions: [] };
  }
  if (args.activeClientCount > 0) {
    return {
      kind: 'clients_no_bookings',
      headline: 'Your clients are connected. Nothing is booked today.',
      subcopy: 'A good moment to check in with someone or review their plan.',
      actions: [
        { label: 'View clients', href: '/lana-pro/clients' },
        { label: 'Set availability', href: '/lana-pro/schedule' },
      ],
    };
  }
  return {
    kind: 'no_bookings',
    headline: 'Nothing booked today.',
    subcopy: 'Use the time to invite clients, set your availability or finish your services.',
    actions: [
      { label: 'Invite clients', href: '/lana-pro/clients/invite' },
      { label: 'Set availability', href: '/lana-pro/schedule' },
    ],
  };
}

export function businessEmptyState(args: { hasTodayItems: boolean }): EmptyStateModel {
  if (args.hasTodayItems) {
    return { kind: 'none', headline: '', subcopy: '', actions: [] };
  }
  return {
    kind: 'business_no_schedule',
    headline: 'Your schedule is empty.',
    subcopy: 'Add a service and set when it runs to start taking bookings.',
    actions: [
      { label: 'Add service', href: '/lana-pro/services' },
      { label: 'Set schedule', href: '/lana-pro/schedule' },
    ],
  };
}

// ── the assembled Home models ─────────────────────────────────────────────

export interface ProfessionalHomeInput {
  nowIso: string;
  displayName: string | null;
  professionalStatus: 'pending' | 'approved' | 'rejected' | 'suspended' | null;
  todayItems: TodayItem[];
  /** relationship counts straight from `pt_clients.status` — always safe. */
  activeClientCount: number;
  invitedClientCount: number;
  checklist: ChecklistItem[];
  clientEvidence: Record<string, ClientEvidence>;
}

export interface ProfessionalHomeModel {
  greeting: string;
  firstName: string;
  schedule: TodaySplit;
  counts: {
    appointmentsToday: number;
    activeClients: number;
    invitationsPending: number;
  };
  verification: VerificationNotice;
  intelligence: IntelligenceModel;
  checklist: { items: ChecklistItem[]; done: boolean };
  emptyState: EmptyStateModel;
  showGrowPractice: boolean;
}

export function buildProfessionalHome(input: ProfessionalHomeInput): ProfessionalHomeModel {
  const schedule = splitToday(input.todayItems, input.nowIso);
  const checklistIncomplete = incompleteItems(input.checklist);
  return {
    greeting: greetingFor(input.nowIso),
    firstName: firstNameOf(input.displayName),
    schedule,
    counts: {
      appointmentsToday: schedule.today.length,
      activeClients: input.activeClientCount,
      invitationsPending: input.invitedClientCount,
    },
    verification: professionalVerificationNotice(input.professionalStatus),
    intelligence: buildIntelligenceModel(input.clientEvidence),
    checklist: { items: checklistIncomplete, done: isFullyActivated(input.checklist) },
    emptyState: professionalEmptyState({
      hasTodayItems: schedule.today.length > 0,
      activeClientCount: input.activeClientCount,
    }),
    // Always offer the "bring your clients" path post-onboarding (spec §3).
    showGrowPractice: true,
  };
}

export interface BusinessHomeInput {
  nowIso: string;
  displayName: string | null;
  anyVenueActive: boolean;
  todayItems: TodayItem[];
  checklist: ChecklistItem[];
}

export interface BusinessHomeModel {
  greeting: string;
  displayName: string;
  schedule: TodaySplit;
  counts: {
    classesToday: number;
    bookingsToday: number;
    spacesRemaining: number;
  };
  verification: VerificationNotice;
  intelligence: IntelligenceModel;
  checklist: { items: ChecklistItem[]; done: boolean };
  emptyState: EmptyStateModel;
}

export function buildBusinessHome(input: BusinessHomeInput): BusinessHomeModel {
  const schedule = splitToday(input.todayItems, input.nowIso);
  const classesToday = schedule.today.filter((i) => i.kind === 'class');
  const bookingsToday = classesToday.reduce((n, i) => n + (i.bookedCount ?? 0), 0);
  const spacesRemaining = classesToday.reduce(
    (n, i) => n + Math.max(0, (i.capacity ?? 0) - (i.bookedCount ?? 0)),
    0,
  );
  const checklistIncomplete = incompleteItems(input.checklist);
  return {
    greeting: greetingFor(input.nowIso),
    displayName: (input.displayName ?? '').trim() || 'there',
    schedule,
    counts: {
      classesToday: classesToday.length,
      bookingsToday,
      spacesRemaining,
    },
    verification: businessVerificationNotice(input.anyVenueActive),
    // Business intelligence has no producer either — same honest placeholder.
    intelligence: buildIntelligenceModel({}, { subject: 'business' }),
    checklist: { items: checklistIncomplete, done: isFullyActivated(input.checklist) },
    emptyState: businessEmptyState({ hasTodayItems: schedule.today.length > 0 }),
  };
}
