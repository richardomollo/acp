// LANA PRO — Phase 4.3: the LanaBooking domain model (PURE).
//
// ONE operational shape over the EXISTING booking tables — no unified booking
// table, no schema replacement (§2). The professional never sees pt_bookings /
// bookings / sessions.
//
//   appointment → pt_bookings           (independent PT: 1-to-1, nutrition, …)
//   appointment → gym_service_bookings  (Phase 4.6: venue-owned service, employed
//                                        professional delivery, client appointment)
//   class       → bookings + sessions   (a class occurrence + its attendees)
//   access      → RESERVED — no truthful booking home exists yet (§10); not faked
//
// Marketplace-acquired and professional-created bookings normalise IDENTICALLY
// (§8) — acquisition source is metadata, never a separate operational path.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

export type BookingKind = 'appointment' | 'class' | 'access';

/** Who owns the commercial relationship for this booking (§12/§24). */
export type CommercialOwner = 'independent' | 'venue';

/** Canonical operational status. Existing raw states are mapped truthfully
 *  (§2) — nothing is coerced in a way that loses meaning. */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'
  | 'other';

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'unknown';

export type PaymentDisplay =
  | 'paid'
  | 'pending'
  | 'pay_at_venue'
  | 'refunded'
  | 'not_collected'
  | 'unknown';

export interface LanaBooking {
  /** Prefixed composite id, unique across sources: "apt:<uuid>" | "cls:<uuid>" | "vnu:<uuid>". */
  id: string;
  sourceType: 'pt_booking' | 'gym_service_booking' | 'class_booking' | 'access_booking';
  sourceId: string;
  kind: BookingKind;
  /** independent PT booking → 'independent'; venue-owned appointment / class → 'venue'. */
  commercialOwner: CommercialOwner;
  status: BookingStatus;
  /** raw status string as stored, for debugging / audit — never shown. */
  rawStatus: string;
  /** canonical stored payment state (never fabricated). */
  paymentStatus: PaymentStatus;
  /** honest UI label, richer than paymentStatus (adds not_collected / pay_at_venue). */
  paymentDisplay: PaymentDisplay;

  title: string;

  /** ISO-like local wall-clock 'YYYY-MM-DDTHH:MM:SS' (no timezone math, §19). */
  startAt: string;
  endAt?: string;

  serviceId?: string;
  serviceName?: string;

  clientId?: string;
  clientName?: string;

  professionalId?: string;
  professionalName?: string;

  venueId?: string;
  venueName?: string;

  /** class only */
  classId?: string;
  bookedCount?: number;
  capacity?: number;

  amount?: number | null;
  currency?: 'KES';

  checkedIn?: boolean;
  noShow?: boolean;

  href: string;
}

// ── status mapping ───────────────────────────────────────────────────────

const PT_STATUS: Record<string, BookingStatus> = {
  pending: 'pending',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'no_show',
};

const SESSION_STATUS: Record<string, BookingStatus> = {
  pending: 'pending',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  cancelled_by_customer: 'cancelled',
  cancelled_by_partner: 'cancelled',
  no_show: 'no_show',
  rescheduled: 'rescheduled',
  checked_in: 'checked_in',
};

export function mapPtBookingStatus(raw: string | null | undefined): BookingStatus {
  return PT_STATUS[(raw ?? '').trim()] ?? 'pending';
}

export function mapSessionBookingStatus(raw: string | null | undefined): BookingStatus {
  return SESSION_STATUS[(raw ?? '').trim()] ?? 'confirmed';
}

/** Operationally active = still a real thing to turn up for. Cancelled /
 *  no_show / rescheduled / completed are NOT active (§21.26). `checked_in` is
 *  still "active" for an in-progress class. */
export function isOperationallyActive(status: BookingStatus): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'checked_in';
}
export function isCompleted(status: BookingStatus): boolean {
  return status === 'completed';
}
export function isCancelled(status: BookingStatus): boolean {
  return status === 'cancelled' || status === 'rescheduled';
}
export function isNoShow(status: BookingStatus): boolean {
  return status === 'no_show';
}
/** @deprecated use isOperationallyActive */
export const isActiveBooking = isOperationallyActive;
export function isPastBooking(status: BookingStatus): boolean {
  return status === 'completed' || status === 'no_show';
}

// ── payment status + display (canonical evidence only, never fabricated §23) ──

const PT_PAYMENT: Record<string, PaymentStatus> = {
  pending: 'pending', paid: 'paid', refunded: 'refunded', failed: 'failed',
};
export function mapPtPaymentStatus(raw: string | null | undefined): PaymentStatus {
  return PT_PAYMENT[(raw ?? '').trim()] ?? 'unknown';
}


export function ptPaymentDisplay(row: {
  payment_status?: string | null;
  payment_method?: string | null;
  amount_kes?: number | string | null;
}): PaymentDisplay {
  const status = (row.payment_status ?? '').trim();
  const method = (row.payment_method ?? '').trim();
  const amount = row.amount_kes == null || row.amount_kes === '' ? null : Number(row.amount_kes);

  if (status === 'refunded') return 'refunded';
  if (status === 'paid') {
    // The live PT booking flow records method='free', status='paid' even when
    // no money moved. Only say "paid" when money actually changed hands.
    return method === 'free' || !amount ? 'not_collected' : 'paid';
  }
  if (status === 'pending') return amount && amount > 0 ? 'pending' : 'not_collected';
  return 'unknown';
}

export function sessionPaymentDisplay(row: {
  deposit_paid_at?: string | null;
  remainder_collected?: boolean | null;
  session_price?: number | string | null;
  refund_status?: string | null;
}): PaymentDisplay {
  if (row.refund_status === 'completed') return 'refunded';
  const price = row.session_price == null || row.session_price === '' ? null : Number(row.session_price);
  if (!price) return 'not_collected';
  if (row.deposit_paid_at && row.remainder_collected) return 'paid';
  if (row.deposit_paid_at) return 'pending';
  return 'pending';
}

// ── raw rows (only fields we read) ──────────────────────────────────────

export interface PtBookingRow {
  id: string;
  pt_id: string | null;
  user_id: string | null;
  offering_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  amount_kes: number | string | null;
  location_type: string | null;
  checked_in?: boolean | null;
  guest_name?: string | null;
  users?: { id?: string | null; full_name?: string | null; email?: string | null } | null;
  pt_offerings?: {
    id?: string | null;
    title?: string | null;
    duration_minutes?: number | null;
    is_programme?: boolean | null;
    gym_id?: string | null;
  } | null;
}

export interface SessionBookingRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  gym_id: string | null;
  booking_date: string;
  booking_time: string | null;
  status: string | null;
  checked_in?: boolean | null;
  no_show?: boolean | null;
  session_price?: number | string | null;
  deposit_paid_at?: string | null;
  remainder_collected?: boolean | null;
  refund_status?: string | null;
  guest_name?: string | null;
  users?: { id?: string | null; name?: string | null; email?: string | null } | null;
  sessions?: {
    id?: string | null;
    name?: string | null;
    date?: string | null;
    time?: string | null;
    duration_minutes?: number | null;
    max_capacity?: number | null;
    instructor?: string | null;
  } | null;
}

/** Phase 4.6 — a venue-owned appointment (gym_service_bookings + joined
 *  gym_services), delivered by an employed gym_trainers provider. */
export interface GymServiceBookingRow {
  id: string;
  gym_id: string | null;
  gym_service_id: string | null;
  gym_trainer_id: string | null;
  client_user_id: string | null;
  starts_at: string; // timestamptz ISO
  duration_minutes: number | null;
  status: string | null;
  payment_status: string | null;
  price_kes: number | string | null;
  users?: { id?: string | null; name?: string | null; full_name?: string | null; email?: string | null } | null;
  gym_services?: { id?: string | null; name?: string | null; duration_minutes?: number | null } | null;
  gym_trainers?: { id?: string | null; full_name?: string | null } | null;
  gyms?: { id?: string | null; name?: string | null } | null;
}

const GYM_SERVICE_PAYMENT: Record<string, PaymentDisplay> = {
  not_collected: 'not_collected',
  pending: 'pending',
  paid: 'paid',
  refunded: 'refunded',
};

// ── helpers ────────────────────────────────────────────────────────────

export function toLocalIso(date: string, time: string | null | undefined): string {
  const t = (time ?? '').trim();
  const hhmmss = t.length === 0 ? '00:00:00' : t.length === 5 ? `${t}:00` : t.slice(0, 8);
  return `${date}T${hhmmss}`;
}

function addMinutes(iso: string, minutes: number | null | undefined): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const d = new Date(`${iso}Z`); // parse + format as UTC → no wall-clock shift
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 19);
}

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

// ── normalisers ────────────────────────────────────────────────────────

/**
 * pt_bookings row → LanaBooking (appointment). Returns `null` for a programme
 * intro booking — programmes are not a Lana Pro product (§23) and their
 * enrolment flow is separate.
 */
export function normalisePtBooking(
  row: PtBookingRow,
  ctx: { professionalName?: string } = {},
): LanaBooking | null {
  if (row.pt_offerings?.is_programme) return null;
  const start = toLocalIso(row.scheduled_date, row.scheduled_time);
  const status = mapPtBookingStatus(row.status);
  return {
    id: `apt:${row.id}`,
    sourceType: 'pt_booking',
    sourceId: row.id,
    kind: 'appointment',
    commercialOwner: 'independent',
    status,
    rawStatus: row.status ?? '',
    paymentStatus: mapPtPaymentStatus(row.payment_status),
    paymentDisplay: ptPaymentDisplay(row),
    title: row.pt_offerings?.title?.trim() || 'Appointment',
    startAt: start,
    endAt: addMinutes(start, row.pt_offerings?.duration_minutes ?? null),
    serviceId: row.offering_id ?? undefined,
    serviceName: row.pt_offerings?.title?.trim() || undefined,
    clientId: row.users?.id ?? row.user_id ?? undefined,
    clientName: row.users?.full_name?.trim() || row.guest_name?.trim() || row.users?.email?.split('@')[0] || undefined,
    professionalId: row.pt_id ?? undefined,
    professionalName: ctx.professionalName,
    venueId: row.pt_offerings?.gym_id ?? undefined,
    amount: num(row.amount_kes),
    currency: 'KES',
    checkedIn: !!row.checked_in,
    noShow: row.status === 'no_show',
    href: `/lana-pro/bookings/appointment/${row.id}`,
  };
}

/** bookings row (+ joined session) → LanaBooking (class attendee). */
export function normaliseSessionBooking(row: SessionBookingRow): LanaBooking {
  const start = toLocalIso(row.booking_date, row.booking_time ?? row.sessions?.time ?? null);
  const rawStatus = row.no_show ? 'no_show' : row.status ?? (row.checked_in ? 'checked_in' : 'confirmed');
  const status = mapSessionBookingStatus(rawStatus);
  return {
    id: `cls:${row.id}`,
    sourceType: 'class_booking',
    sourceId: row.id,
    kind: 'class',
    commercialOwner: 'venue',
    status,
    rawStatus,
    paymentStatus: row.refund_status === 'completed' ? 'refunded' : row.deposit_paid_at ? 'paid' : 'pending',
    paymentDisplay: sessionPaymentDisplay(row),
    title: row.sessions?.name?.trim() || 'Class',
    startAt: start,
    endAt: addMinutes(start, row.sessions?.duration_minutes ?? null),
    serviceName: row.sessions?.name?.trim() || undefined,
    clientId: row.users?.id ?? row.user_id ?? undefined,
    clientName: row.users?.name?.trim() || row.guest_name?.trim() || row.users?.email?.split('@')[0] || undefined,
    venueId: row.gym_id ?? undefined,
    classId: row.session_id ?? undefined,
    capacity: row.sessions?.max_capacity ?? undefined,
    amount: num(row.session_price),
    currency: 'KES',
    checkedIn: !!row.checked_in,
    noShow: !!row.no_show,
    href: `/lana-pro/bookings/class/${row.id}`,
  };
}

/**
 * gym_service_bookings row (+ joined service / trainer / gym) → LanaBooking
 * (appointment, commercially owned by the VENUE). `starts_at` is a real
 * timestamptz — split into local wall-clock without timezone math (§19), the
 * same convention the rest of the model uses.
 */
export function normaliseGymServiceBooking(
  row: GymServiceBookingRow,
  ctx: { professionalName?: string; venueName?: string } = {},
): LanaBooking {
  const startAt = (row.starts_at ?? '').slice(0, 19).replace(' ', 'T');
  const duration = row.duration_minutes ?? row.gym_services?.duration_minutes ?? null;
  const status = mapPtBookingStatus(row.status); // same canonical vocabulary
  const svcName = row.gym_services?.name?.trim() || 'Appointment';
  return {
    id: `vnu:${row.id}`,
    sourceType: 'gym_service_booking',
    sourceId: row.id,
    kind: 'appointment',
    commercialOwner: 'venue',
    status,
    rawStatus: row.status ?? '',
    paymentStatus:
      row.payment_status === 'paid'
        ? 'paid'
        : row.payment_status === 'refunded'
          ? 'refunded'
          : row.payment_status === 'pending'
            ? 'pending'
            : 'unknown',
    paymentDisplay: GYM_SERVICE_PAYMENT[(row.payment_status ?? '').trim()] ?? 'not_collected',
    title: svcName,
    startAt,
    endAt: addMinutes(startAt, duration),
    serviceId: row.gym_service_id ?? undefined,
    serviceName: svcName,
    clientId: row.users?.id ?? row.client_user_id ?? undefined,
    clientName:
      row.users?.name?.trim() ||
      row.users?.full_name?.trim() ||
      row.users?.email?.split('@')[0] ||
      undefined,
    professionalId: row.gym_trainer_id ?? undefined,
    professionalName: ctx.professionalName || row.gym_trainers?.full_name?.trim() || undefined,
    venueId: row.gym_id ?? undefined,
    venueName: ctx.venueName || row.gyms?.name?.trim() || undefined,
    amount: num(row.price_kes),
    currency: 'KES',
    checkedIn: row.status === 'completed',
    noShow: row.status === 'no_show',
    href: `/lana-pro/bookings/venue/${row.id}`,
  };
}

export function normaliseGymServiceBookings(
  rows: readonly GymServiceBookingRow[],
  ctx: { professionalName?: string; venueName?: string } = {},
): LanaBooking[] {
  return rows.map((r) => normaliseGymServiceBooking(r, ctx));
}

export function normalisePtBookings(rows: readonly PtBookingRow[], ctx: { professionalName?: string } = {}): LanaBooking[] {
  return rows.map((r) => normalisePtBooking(r, ctx)).filter((b): b is LanaBooking => b !== null);
}

export function normaliseSessionBookings(rows: readonly SessionBookingRow[]): LanaBooking[] {
  return rows.map(normaliseSessionBooking);
}

// ── formatting shared by list + detail ─────────────────────────────────

export function paymentLabel(p: PaymentDisplay): string {
  return {
    paid: 'Paid',
    pending: 'Payment pending',
    pay_at_venue: 'Pay at venue',
    refunded: 'Refunded',
    not_collected: 'Not collected via Lana',
    unknown: 'Payment status unknown',
  }[p];
}

export function statusLabel(s: BookingStatus): string {
  return {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
    rescheduled: 'Rescheduled',
    checked_in: 'Checked in',
    other: 'Booked',
  }[s];
}
