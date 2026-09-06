// LANA PRO — Phase 4.6: venue appointment draft (PURE).
//
// The `gym_service_bookings` creation flow: client → service → professional →
// date & time → review → confirm. This module validates the draft and builds
// the insert payload. No availability engine (§11) — `startsAt` is chosen
// explicitly; we only guard against the obvious accidental duplicate.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export interface AppointmentDraft {
  clientUserId: string;
  gymServiceId: string;
  gymTrainerId: string;
  /** local wall-clock 'YYYY-MM-DDTHH:MM' (minute precision from the form) */
  startsAtLocal: string;
  durationMinutes: number;
  priceKes: number | null;
}

export interface ExistingBookingLite {
  gymTrainerId: string | null;
  startsAtLocal: string; // 'YYYY-MM-DDTHH:MM' (already trimmed)
  status: string;
  clientUserId: string | null;
  gymServiceId: string | null;
}

export type DraftProblem =
  | 'no_client'
  | 'no_service'
  | 'no_professional'
  | 'no_datetime'
  | 'in_the_past'
  | 'bad_duration'
  | 'trainer_slot_taken'
  | 'exact_duplicate';

export interface DraftCheck {
  ok: boolean;
  problems: DraftProblem[];
}

const LIVE = new Set(['pending', 'confirmed']);

function overlaps(
  aStart: string,
  aMin: number,
  bStart: string,
  bMin: number,
): boolean {
  const a0 = Date.parse(`${aStart}:00Z`);
  const b0 = Date.parse(`${bStart}:00Z`);
  if (Number.isNaN(a0) || Number.isNaN(b0)) return false;
  const a1 = a0 + aMin * 60_000;
  const b1 = b0 + bMin * 60_000;
  return a0 < b1 && b0 < a1;
}

/**
 * Validate a draft against the existing bookings for this venue.
 *   - all fields present, datetime in the future, sane duration
 *   - the assigned trainer has no other LIVE booking overlapping this slot (§11)
 *   - not a byte-for-byte duplicate of an existing live booking
 */
export function checkAppointmentDraft(
  draft: Partial<AppointmentDraft>,
  existing: readonly ExistingBookingLite[],
  nowLocal: string,
): DraftCheck {
  const problems: DraftProblem[] = [];
  if (!draft.clientUserId) problems.push('no_client');
  if (!draft.gymServiceId) problems.push('no_service');
  if (!draft.gymTrainerId) problems.push('no_professional');
  if (!draft.startsAtLocal) problems.push('no_datetime');

  const dur = draft.durationMinutes ?? 0;
  if (draft.startsAtLocal && dur <= 0) problems.push('bad_duration');

  if (draft.startsAtLocal && draft.startsAtLocal <= nowLocal) problems.push('in_the_past');

  if (draft.gymTrainerId && draft.startsAtLocal && dur > 0) {
    for (const b of existing) {
      if (!LIVE.has(b.status)) continue;
      if (b.gymTrainerId !== draft.gymTrainerId) continue;
      if (
        b.clientUserId === draft.clientUserId &&
        b.gymServiceId === draft.gymServiceId &&
        b.startsAtLocal === draft.startsAtLocal
      ) {
        problems.push('exact_duplicate');
        break;
      }
      // We don't know the existing booking's duration here; treat it as at
      // least a minute so an identical start is always caught, and use the
      // draft's duration for the window.
      if (overlaps(draft.startsAtLocal, dur, b.startsAtLocal, 1)) {
        problems.push('trainer_slot_taken');
        break;
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

export function buildAppointmentInsert(
  draft: AppointmentDraft,
  ctx: { gymId: string; createdBy: string },
): {
  gym_id: string;
  gym_service_id: string;
  gym_trainer_id: string;
  client_user_id: string;
  starts_at: string;
  duration_minutes: number;
  status: 'confirmed';
  payment_status: 'not_collected';
  price_kes: number | null;
  created_by: string;
} {
  return {
    gym_id: ctx.gymId,
    gym_service_id: draft.gymServiceId,
    gym_trainer_id: draft.gymTrainerId,
    client_user_id: draft.clientUserId,
    // form gives minute precision; store seconds for a clean timestamptz
    starts_at: `${draft.startsAtLocal}:00`,
    duration_minutes: draft.durationMinutes,
    status: 'confirmed',
    payment_status: 'not_collected',
    price_kes: draft.priceKes,
    created_by: ctx.createdBy,
  };
}

export function problemMessage(p: DraftProblem): string {
  return {
    no_client: 'Choose a client.',
    no_service: 'Choose a service.',
    no_professional: 'Choose who delivers it.',
    no_datetime: 'Pick a date and time.',
    in_the_past: "That time has already passed.",
    bad_duration: 'This service has no length set.',
    trainer_slot_taken: 'That professional already has a booking then.',
    exact_duplicate: 'This exact booking already exists.',
  }[p];
}
