// LANA PRO — Phase 4.2: add-service resolution (PURE).
//
// Maps a taxonomy option id + entered details onto the correct EXISTING
// persistence target and a ready-to-insert payload. No Supabase here — the
// page does the write; this decides WHAT to write so it stays testable.

import type { ServiceCategory } from './service-taxonomy.ts';
import { offeringFlagsFromStatus, type ServiceStatus } from './service-status.ts';

export type PersistTarget = 'pt_offering' | 'session' | 'gym_service' | 'gym_access_pass';

export interface PersistPlan {
  target: PersistTarget;
  category: ServiceCategory;
  /** for pt_offering: the `type` enum value */
  offeringType?: '1-on-1' | 'group' | 'online' | 'outdoor' | 'home-visit' | 'drop-in';
  /** whether the flow should show a capacity field */
  needsCapacity: boolean;
  /** whether the flow should show the "Where?" delivery step */
  needsDeliveryStep: boolean;
  /** whether the flow schedules real class times instead of availability */
  isScheduledClass: boolean;
  teamDelivered: boolean;
}

/** Option id (from service-taxonomy) → how/where to persist it. */
export function resolvePersistPlan(optionId: string): PersistPlan {
  switch (optionId) {
    // ── independent professional appointments → pt_offerings ──
    case 'personal_training':
    case 'consultation':
    case 'assessment':
    case 'initial_consultation':
    case 'follow_up':
    case 'other_appointment':
    case 'private_session':
    case 'appointment':
      return {
        target: 'pt_offering',
        category: 'appointment',
        offeringType: '1-on-1',
        needsCapacity: false,
        needsDeliveryStep: true,
        isScheduledClass: false,
        teamDelivered: false,
      };
    case 'online_session':
    case 'online_consultation':
      return {
        target: 'pt_offering',
        category: 'appointment',
        offeringType: 'online',
        needsCapacity: false,
        needsDeliveryStep: false,
        isScheduledClass: false,
        teamDelivered: false,
      };

    // ── independent professional group class → pt_offerings(type=group) ──
    // (a studio's classes go to `sessions` — see below)
    case 'pro_group_class':
      return {
        target: 'pt_offering',
        category: 'class',
        offeringType: 'group',
        needsCapacity: true,
        needsDeliveryStep: true,
        isScheduledClass: false,
        teamDelivered: false,
      };

    // ── venue class → sessions (scheduled inventory) ──
    case 'group_class':
      return {
        target: 'session',
        category: 'class',
        needsCapacity: true,
        needsDeliveryStep: false,
        isScheduledClass: true,
        teamDelivered: false,
      };

    // ── venue access → gym_access_passes ──
    case 'gym_access':
    case 'facility_access':
      return {
        target: 'gym_access_pass',
        category: 'access',
        needsCapacity: false,
        needsDeliveryStep: false,
        isScheduledClass: false,
        teamDelivered: false,
      };

    // ── venue team-delivered appointment → gym_services ──
    case 'team_personal_training':
      return {
        target: 'gym_service',
        category: 'appointment',
        needsCapacity: false,
        needsDeliveryStep: false,
        isScheduledClass: false,
        teamDelivered: true,
      };

    default:
      // Unknown option → safest is a plain independent appointment draft.
      return {
        target: 'pt_offering',
        category: 'appointment',
        offeringType: '1-on-1',
        needsCapacity: false,
        needsDeliveryStep: true,
        isScheduledClass: false,
        teamDelivered: false,
      };
  }
}

export type DeliveryChoice = 'venue' | 'online' | 'client_location' | 'outdoor';

/** delivery choice → pt_offerings.type (appointments only). */
export function offeringTypeForDelivery(choice: DeliveryChoice): PersistPlan['offeringType'] {
  switch (choice) {
    case 'online':
      return 'online';
    case 'client_location':
      return 'home-visit';
    case 'outdoor':
      return 'outdoor';
    default:
      return '1-on-1';
  }
}

export interface ServiceDetailsInput {
  name: string;
  description: string;
  durationMinutes: number;
  priceKes: number | null;
  capacity: number | null;
  venueId: string | null;
  delivery: DeliveryChoice;
  status: ServiceStatus;
}

export interface DetailsValidation {
  name?: string;
  duration?: string;
  price?: string;
  capacity?: string;
}

export function validateServiceDetails(plan: PersistPlan, d: ServiceDetailsInput): DetailsValidation {
  const errors: DetailsValidation = {};
  if (d.name.trim().length === 0) errors.name = 'Give this service a name.';
  if (plan.category !== 'access' && (!d.durationMinutes || d.durationMinutes <= 0)) {
    errors.duration = 'Add how long it lasts.';
  }
  if (d.priceKes != null && d.priceKes < 0) errors.price = 'Price cannot be negative.';
  if (plan.needsCapacity && (!d.capacity || d.capacity < 1)) errors.capacity = 'Add a capacity of at least 1.';
  return errors;
}

export function serviceDetailsValid(plan: PersistPlan, d: ServiceDetailsInput): boolean {
  return Object.keys(validateServiceDetails(plan, d)).length === 0;
}

/** Build the row to insert for a pt_offering-backed service. */
export function buildOfferingInsert(args: {
  ptId: string;
  plan: PersistPlan;
  details: ServiceDetailsInput;
  slug: string;
}): Record<string, unknown> {
  const { ptId, plan, details, slug } = args;
  const offeringType =
    plan.category === 'appointment' && plan.needsDeliveryStep
      ? offeringTypeForDelivery(details.delivery)
      : (plan.offeringType ?? '1-on-1');
  const flags = offeringFlagsFromStatus(details.status);
  return {
    pt_id: ptId,
    title: details.name.trim(),
    description: details.description.trim() || null,
    type: offeringType,
    duration_minutes: details.durationMinutes,
    price_kes: details.priceKes,
    max_participants: plan.needsCapacity ? (details.capacity ?? 1) : 1,
    min_participants: 1,
    gym_id: details.venueId,
    slug,
    is_active: flags.is_active,
    is_draft: flags.is_draft,
    is_programme: false,
  };
}

export function buildGymServiceInsert(args: {
  gymId: string;
  details: ServiceDetailsInput;
}): Record<string, unknown> {
  return {
    gym_id: args.gymId,
    category: 'appointment',
    name: args.details.name.trim(),
    description: args.details.description.trim() || null,
    duration_minutes: args.details.durationMinutes,
    price_kes: args.details.priceKes,
    capacity: 1,
    status: args.details.status,
  };
}

export function buildGymAccessInsert(args: {
  gymId: string;
  details: ServiceDetailsInput;
}): Record<string, unknown> {
  return {
    gym_id: args.gymId,
    name: args.details.name.trim(),
    description: args.details.description.trim() || null,
    duration_minutes: args.details.durationMinutes || null,
    price_kes: args.details.priceKes,
    capacity: args.details.capacity,
    status: args.details.status,
  };
}

export function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 7)
  );
}
