// LANA PRO — business-branch taxonomy (Phase 4.7). Pure: the MVP business-type
// list, the operational models, and the mapping from onboarding answers onto
// the EXISTING `gyms` column vocabulary.
//
//   businessType → gyms.type   (reuses the `venue_types` tokens the consumer
//                               marketplace already filters/displays:
//                               gym / studio / pilates / spa)
//
// Operational models (classes / appointments / facility access) are captured as
// INTENT only — the Lana Pro workspace derives nav / Home / Services from
// `ownsBusiness` + `gyms.type` + real inventory, never from a stored operational
// flag. They exist here to drive onboarding + completion copy.
//
// HARD RULE: experience providers, communities and programme sellers are NEVER
// business types (mirrors service-taxonomy's rule for the professional side).

export interface Option<V extends string = string> {
  value: V;
  label: string;
}

// ── §3 Business type ─────────────────────────────────────────────────────

export const BUSINESS_TYPE_VALUES = [
  'gym',
  'fitness_studio',
  'pilates_yoga_studio',
  'spa_wellness',
  'other',
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_VALUES)[number];

export interface BusinessTypeOption extends Option<BusinessTypeValue> {
  sub: string;
  /** value written to `gyms.type` — an existing `venue_types.name` token */
  gymType: string;
}

export const BUSINESS_TYPE_OPTIONS: readonly BusinessTypeOption[] = [
  { value: 'gym',                 label: 'Gym',                           sub: 'A fitness centre with equipment and space',   gymType: 'gym' },
  { value: 'fitness_studio',      label: 'Fitness studio',                sub: 'Group training, HIIT, spin, strength',        gymType: 'studio' },
  { value: 'pilates_yoga_studio', label: 'Pilates or yoga studio',        sub: 'Mat and reformer classes, yoga',              gymType: 'pilates' },
  { value: 'spa_wellness',        label: 'Spa or wellness centre',        sub: 'Massage, recovery, treatments',               gymType: 'spa' },
  { value: 'other',               label: 'Other fitness & wellness venue', sub: 'Anything else people book to move and feel better', gymType: 'studio' },
];

export function isBusinessTypeValue(v: unknown): v is BusinessTypeValue {
  return typeof v === 'string' && (BUSINESS_TYPE_VALUES as readonly string[]).includes(v);
}

/** Onboarding business type → the `gyms.type` string. Unknown / empty falls
 *  back to 'gym' so a row is never written with an out-of-vocabulary type. */
export function businessTypeToGymType(value: string): string {
  const opt = BUSINESS_TYPE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.gymType : 'gym';
}

export function businessTypeLabel(value: string): string {
  return BUSINESS_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// ── §4 STEP 3 Operational models ─────────────────────────────────────────

export const OPERATING_MODEL_VALUES = ['classes', 'appointments', 'facility_access'] as const;
export type OperatingModelValue = (typeof OPERATING_MODEL_VALUES)[number];

export interface OperatingModelOption extends Option<OperatingModelValue> {
  sub: string;
}

export const OPERATING_MODEL_OPTIONS: readonly OperatingModelOption[] = [
  { value: 'classes',         label: 'Classes',                sub: 'Scheduled group sessions clients book onto' },
  { value: 'appointments',    label: 'Appointments',           sub: '1-to-1 bookings with you or your team' },
  { value: 'facility_access',  label: 'Gym or facility access', sub: 'Open access to your space' },
];

export function isOperatingModelValue(v: unknown): v is OperatingModelValue {
  return typeof v === 'string' && (OPERATING_MODEL_VALUES as readonly string[]).includes(v);
}

export function operatingModelLabel(value: string): string {
  return OPERATING_MODEL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
