// LANA PRO — Phase 4.2: the LanaService domain model (PURE).
//
// ONE normalised shape the Services UI speaks, assembled from the EXISTING
// supply tables — no generic `services` table, no destructive consolidation
// (§17). The professional never sees pt_offerings / sessions / gym access rows;
// they see Services.
//
//   appointment / PT class → pt_offerings   (is_programme rows are DROPPED)
//   studio / gym class      → sessions        (grouped into one service)
//   gym team appointment    → gym_services    (+ gym_service_providers)
//   gym / spa access        → gym_access_passes
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

import type { ServiceCategory } from './service-taxonomy.ts';
import {
  statusFromOfferingFlags,
  statusFromSessionGroup,
  type ServiceStatus,
} from './service-status.ts';

export type DeliveryMode = 'in_person' | 'online' | 'client_location' | 'outdoor';

export type ServiceSourceType = 'pt_offering' | 'session_group' | 'gym_service' | 'gym_access_pass';

export interface LanaService {
  /** Prefixed composite id, unique across sources. */
  id: string;
  sourceType: ServiceSourceType;
  /** Raw source id (or the group key for session_group). */
  sourceId: string;
  category: ServiceCategory;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  price: number | null;
  currency: 'KES';
  capacity: number | null;
  deliveryModes: DeliveryMode[];
  venueIds: string[];
  /** `gym_trainers` ids for team-delivered services; [] otherwise. */
  providerIds: string[];
  teamDelivered: boolean;
  status: ServiceStatus;
  /** session_group only: how many scheduled occurrences (total / future). */
  occurrences?: { total: number; future: number };
}

// ── raw row shapes (only the fields we read) ──────────────────────────────

export interface OfferingRow {
  id: string;
  title: string;
  description: string | null;
  type: string; // '1-on-1' | 'group' | 'online' | 'outdoor' | 'home-visit' | 'drop-in'
  duration_minutes: number | null;
  price_kes: number | string | null;
  max_participants: number | null;
  gym_id: string | null;
  is_active: boolean | null;
  is_draft: boolean | null;
  is_programme?: boolean | null;
}

export interface SessionRow {
  id: string;
  gym_id: string;
  name: string | null;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string | null;
  duration_minutes: number | null;
  max_capacity: number | null;
  category: string | null;
  instructor_id: string | null;
  drop_in_price: number | string | null;
  is_active: boolean | null;
}

export interface GymServiceRow {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price_kes: number | string | null;
  capacity: number | null;
  status: string; // 'draft' | 'active' | 'inactive'
  provider_ids?: string[] | null; // from gym_service_providers
}

export interface GymAccessRow {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price_kes: number | string | null;
  capacity: number | null;
  status: string;
}

// ── helpers ──────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

const OFFERING_TYPE_MAP: Record<string, { category: ServiceCategory; mode: DeliveryMode }> = {
  '1-on-1': { category: 'appointment', mode: 'in_person' },
  online: { category: 'appointment', mode: 'online' },
  outdoor: { category: 'appointment', mode: 'outdoor' },
  'home-visit': { category: 'appointment', mode: 'client_location' },
  group: { category: 'class', mode: 'in_person' },
  'drop-in': { category: 'class', mode: 'in_person' },
};

// ── normalisers ──────────────────────────────────────────────────────────

/**
 * pt_offerings row → LanaService, or `null` when the row is a PROGRAMME
 * (never a sellable service, §2/§16) or an unrecognised type.
 */
export function normaliseOffering(row: OfferingRow): LanaService | null {
  if (row.is_programme) return null;
  const map = OFFERING_TYPE_MAP[row.type];
  if (!map) return null;
  return {
    id: `off:${row.id}`,
    sourceType: 'pt_offering',
    sourceId: row.id,
    category: map.category,
    name: row.title,
    description: row.description ?? null,
    durationMinutes: num(row.duration_minutes),
    price: num(row.price_kes),
    currency: 'KES',
    capacity: map.category === 'class' ? (row.max_participants ?? null) : null,
    deliveryModes: [map.mode],
    venueIds: row.gym_id ? [row.gym_id] : [],
    providerIds: [],
    teamDelivered: false,
    status: statusFromOfferingFlags(row),
  };
}

/** All pt_offerings → services, programmes dropped, stable order preserved. */
export function normaliseOfferings(rows: readonly OfferingRow[]): LanaService[] {
  return rows.map(normaliseOffering).filter((s): s is LanaService => s !== null);
}

/** Group key: same name + start time + category = "the same class". Mirrors the
 *  grouping the existing partner-dashboard already uses for recurring series. */
export function sessionGroupKey(row: Pick<SessionRow, 'name' | 'time' | 'category'>): string {
  return [row.name?.trim().toLowerCase() ?? '', (row.time ?? '').slice(0, 5), row.category ?? ''].join('|');
}

/**
 * A set of `sessions` rows that belong to one class → one LanaService.
 * `todayStr` splits total vs future occurrences (drives status + the "N
 * scheduled" line). Rows must be pre-filtered to a single group.
 */
export function normaliseSessionGroup(rows: readonly SessionRow[], todayStr: string): LanaService | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  const rep = sorted[0];
  const future = sorted.filter((r) => r.date >= todayStr).length;
  const anyActive = sorted.some((r) => r.is_active !== false);
  const providerIds = Array.from(
    new Set(sorted.map((r) => r.instructor_id).filter((v): v is string => !!v)),
  );
  return {
    id: `cls:${rep.gym_id}:${sessionGroupKey(rep)}`,
    sourceType: 'session_group',
    sourceId: sessionGroupKey(rep),
    category: 'class',
    name: rep.name?.trim() || 'Class',
    description: rep.description ?? null,
    durationMinutes: num(rep.duration_minutes),
    price: num(rep.drop_in_price),
    currency: 'KES',
    capacity: rep.max_capacity ?? null,
    deliveryModes: ['in_person'],
    venueIds: [rep.gym_id],
    providerIds,
    teamDelivered: providerIds.length > 0,
    status: statusFromSessionGroup({ anyActive, futureOccurrences: future }),
    occurrences: { total: sorted.length, future },
  };
}

/** All `sessions` rows for a venue → one LanaService per class group. */
export function normaliseSessions(rows: readonly SessionRow[], todayStr: string): LanaService[] {
  const groups = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const k = sessionGroupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return Array.from(groups.values())
    .map((g) => normaliseSessionGroup(g, todayStr))
    .filter((s): s is LanaService => s !== null);
}

export function normaliseGymService(row: GymServiceRow): LanaService {
  return {
    id: `gsv:${row.id}`,
    sourceType: 'gym_service',
    sourceId: row.id,
    category: 'appointment',
    name: row.name,
    description: row.description ?? null,
    durationMinutes: num(row.duration_minutes),
    price: num(row.price_kes),
    currency: 'KES',
    capacity: row.capacity ?? null,
    deliveryModes: ['in_person'],
    venueIds: [row.gym_id],
    providerIds: (row.provider_ids ?? []).filter(Boolean),
    teamDelivered: true,
    status: (['draft', 'active', 'inactive'].includes(row.status) ? row.status : 'draft') as ServiceStatus,
  };
}

export function normaliseGymAccess(row: GymAccessRow): LanaService {
  return {
    id: `acc:${row.id}`,
    sourceType: 'gym_access_pass',
    sourceId: row.id,
    category: 'access',
    name: row.name,
    description: row.description ?? null,
    durationMinutes: num(row.duration_minutes),
    price: num(row.price_kes),
    currency: 'KES',
    capacity: row.capacity ?? null,
    deliveryModes: ['in_person'],
    venueIds: [row.gym_id],
    providerIds: [],
    teamDelivered: false,
    status: (['draft', 'active', 'inactive'].includes(row.status) ? row.status : 'draft') as ServiceStatus,
  };
}

// ── assembly + views ─────────────────────────────────────────────────────

export interface ServiceSources {
  offerings?: readonly OfferingRow[];
  sessions?: readonly SessionRow[];
  gymServices?: readonly GymServiceRow[];
  gymAccess?: readonly GymAccessRow[];
  todayStr: string;
}

export function assembleServices(src: ServiceSources): LanaService[] {
  return [
    ...normaliseOfferings(src.offerings ?? []),
    ...normaliseSessions(src.sessions ?? [], src.todayStr),
    ...(src.gymServices ?? []).map(normaliseGymService),
    ...(src.gymAccess ?? []).map(normaliseGymAccess),
  ];
}

export interface GroupedServices {
  active: LanaService[];
  drafts: LanaService[];
  inactive: LanaService[];
}

export function groupServicesByStatus(services: readonly LanaService[]): GroupedServices {
  return {
    active: services.filter((s) => s.status === 'active'),
    drafts: services.filter((s) => s.status === 'draft'),
    inactive: services.filter((s) => s.status === 'inactive'),
  };
}

export function hasAnyActiveService(services: readonly LanaService[]): boolean {
  return services.some((s) => s.status === 'active');
}

// ── formatting (shared by list + review) ─────────────────────────────────

export function formatPrice(price: number | null, currency: 'KES' = 'KES'): string {
  if (price == null) return 'Free';
  return `${currency} ${Math.round(price).toLocaleString('en-KE')}`;
}

export function deliveryModeLabel(mode: DeliveryMode): string {
  return {
    in_person: 'In person',
    online: 'Online',
    client_location: "At client's location",
    outdoor: 'Outdoor',
  }[mode];
}

export function serviceSummaryLine(s: LanaService): string {
  const bits: string[] = [];
  if (s.category === 'appointment') bits.push('1-to-1');
  if (s.category === 'class') bits.push('Class');
  if (s.category === 'access') bits.push('Access');
  if (s.durationMinutes) bits.push(`${s.durationMinutes} min`);
  if (s.category === 'class' && s.capacity) bits.push(`capacity ${s.capacity}`);
  return bits.join(' · ');
}
