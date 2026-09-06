// LANA PRO — Phase 4.2: service status (PURE).
//
// MVP statuses only: DRAFT / ACTIVE / INACTIVE (§10). These are entirely
// separate from marketplace verification (§11) — an ACTIVE service is bookable
// "subject to availability and existing marketplace rules", but a professional
// can create/edit/activate services while their marketplace profile is still
// under review.
//
// For pt_offerings these map onto the EXISTING columns with no schema change:
//   is_draft=true                 → 'draft'
//   is_draft=false, is_active=true  → 'active'
//   is_draft=false, is_active=false → 'inactive'

export const SERVICE_STATUSES = ['draft', 'active', 'inactive'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export function isServiceStatus(v: unknown): v is ServiceStatus {
  return typeof v === 'string' && (SERVICE_STATUSES as readonly string[]).includes(v);
}

/** pt_offerings flags → status. */
export function statusFromOfferingFlags(flags: { is_draft?: boolean | null; is_active?: boolean | null }): ServiceStatus {
  if (flags.is_draft) return 'draft';
  return flags.is_active === false ? 'inactive' : 'active';
}

/** status → pt_offerings flags (for writes). */
export function offeringFlagsFromStatus(status: ServiceStatus): { is_draft: boolean; is_active: boolean } {
  switch (status) {
    case 'draft':
      return { is_draft: true, is_active: true };
    case 'inactive':
      return { is_draft: false, is_active: false };
    default:
      return { is_draft: false, is_active: true };
  }
}

/** sessions is_active bool (+ our convention: a class group with zero future
 *  occurrences is treated as inactive, not draft). */
export function statusFromSessionGroup(args: {
  anyActive: boolean;
  futureOccurrences: number;
}): ServiceStatus {
  if (!args.anyActive) return 'inactive';
  return args.futureOccurrences > 0 ? 'active' : 'inactive';
}

/**
 * Can this service currently be booked? DRAFT and INACTIVE are never bookable.
 * ACTIVE is bookable *from the workspace's point of view* — public marketplace
 * visibility is a SEPARATE gate applied elsewhere (never conflated here, §11).
 */
export function isBookable(status: ServiceStatus): boolean {
  return status === 'active';
}

/**
 * Is it safe to hard-delete this service? Only when it is a draft with no
 * history. Anything with bookings must be set INACTIVE, never deleted (§16).
 */
export function canHardDelete(args: { status: ServiceStatus; hasBookings: boolean }): boolean {
  return args.status === 'draft' && !args.hasBookings;
}

/** The allowed next statuses from a given one (for the status menu). */
export function nextStatuses(current: ServiceStatus): ServiceStatus[] {
  switch (current) {
    case 'draft':
      return ['active'];
    case 'active':
      return ['inactive'];
    case 'inactive':
      return ['active'];
    default:
      return [];
  }
}
