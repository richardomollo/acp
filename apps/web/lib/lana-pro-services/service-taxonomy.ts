// LANA PRO — Phase 4.2: capability-aware service taxonomy (PURE).
//
// The professional never sees database terms (pt_offerings / sessions / gym
// access). They pick from a short, provider-appropriate list. This module maps
// "what kind of account is this?" → "which service types can they create?" and
// owns the display labels.
//
// HARD RULE: programme / experience / community are NEVER service types. Lana
// does not sell programmes; experiences and communities are out of scope.
// Tests assert they can never appear.
//
// No React, no DOM, no Supabase. Unit-tested with `node --test`.

/** The three shapes anything bookable can take. */
export const SERVICE_CATEGORIES = ['appointment', 'class', 'access'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** A concrete option in the "what do you offer?" picker. `id` is stable and
 *  used by the add-service flow to choose the persistence target + defaults. */
export interface ServiceTypeOption {
  id: string;
  label: string;
  category: ServiceCategory;
  /** one-line helper shown under the label */
  hint: string;
  /** true when the venue's team delivers it (gym Personal Training) rather than
   *  the account holder personally. Never triggers auto-assignment in 4.2. */
  teamDelivered?: boolean;
}

// ── capability input ──────────────────────────────────────────────────────

/** Coarse "flavour" of an independent professional, from EXPLICIT structured
 *  data (onboarding professions / `personal_trainers.specialisations`) — never
 *  inferred from bio text (§16). Drives terminology only, not gating. */
export type ProfessionalFlavour = 'training' | 'nutrition' | 'therapy' | 'general';

export interface ServiceCapabilityInput {
  /** has an independent `personal_trainers` profile */
  isIndependentPro: boolean;
  professionalFlavour: ProfessionalFlavour;
  /** owns ≥1 venue via partners → partner_gyms */
  ownsVenue: boolean;
  /** lowercased `gyms.type` across owned venues */
  venueTypes: string[];
  /** the venue employs staff trainers (`gym_trainers`) */
  employsTeam: boolean;
}

export interface ServiceCapability {
  categories: ServiceCategory[];
  options: ServiceTypeOption[];
  /** true when the account has exactly one venue and only ever creates things
   *  at it — so the add-service "Where?" step can be skipped (§5 step 3). */
  singleVenueImplicit: boolean;
}

// ── venue-type helpers ────────────────────────────────────────────────────

const CLASS_VENUE_HINTS = ['pilates', 'yoga', 'studio', 'barre', 'spin', 'cycle', 'dance', 'crossfit', 'hiit'];
const GYM_VENUE_HINTS = ['gym', 'fitness', 'strength', 'weights'];
const SPA_VENUE_HINTS = ['spa', 'wellness', 'massage', 'recovery', 'sauna', 'therapy'];

function venueIs(types: string[], hints: string[]): boolean {
  return types.some((t) => hints.some((h) => t.includes(h)));
}

// ── option builders ───────────────────────────────────────────────────────

function trainingAppointmentOptions(): ServiceTypeOption[] {
  return [
    { id: 'personal_training', label: 'Personal training', category: 'appointment', hint: 'One-to-one session' },
    { id: 'consultation', label: 'Consultation', category: 'appointment', hint: 'Talk through goals and plan' },
    { id: 'assessment', label: 'Assessment', category: 'appointment', hint: 'Movement, fitness or body assessment' },
    { id: 'online_session', label: 'Online session', category: 'appointment', hint: 'Delivered over video' },
    { id: 'other_appointment', label: 'Other appointment', category: 'appointment', hint: 'Anything else one-to-one' },
  ];
}

function nutritionAppointmentOptions(): ServiceTypeOption[] {
  return [
    { id: 'initial_consultation', label: 'Initial consultation', category: 'appointment', hint: 'First full appointment' },
    { id: 'follow_up', label: 'Follow-up', category: 'appointment', hint: 'Shorter review appointment' },
    { id: 'online_consultation', label: 'Online consultation', category: 'appointment', hint: 'Delivered over video' },
    { id: 'assessment', label: 'Assessment', category: 'appointment', hint: 'Body composition or intake assessment' },
    { id: 'other_appointment', label: 'Other appointment', category: 'appointment', hint: 'Anything else one-to-one' },
  ];
}

function therapyAppointmentOptions(): ServiceTypeOption[] {
  return [
    { id: 'appointment', label: 'Appointment', category: 'appointment', hint: 'Massage, treatment or wellness appointment' },
    { id: 'assessment', label: 'Assessment', category: 'appointment', hint: 'Intake or review appointment' },
    { id: 'online_consultation', label: 'Online consultation', category: 'appointment', hint: 'Delivered over video' },
    { id: 'other_appointment', label: 'Other appointment', category: 'appointment', hint: 'Anything else one-to-one' },
  ];
}

function appointmentOptionsForFlavour(flavour: ProfessionalFlavour): ServiceTypeOption[] {
  switch (flavour) {
    case 'nutrition':
      return nutritionAppointmentOptions();
    case 'therapy':
      return therapyAppointmentOptions();
    case 'training':
      return trainingAppointmentOptions();
    default:
      return trainingAppointmentOptions();
  }
}

const GROUP_CLASS_OPTION: ServiceTypeOption = {
  id: 'group_class',
  label: 'Group class',
  category: 'class',
  hint: 'Scheduled, with a capacity',
};
const PRIVATE_SESSION_OPTION: ServiceTypeOption = {
  id: 'private_session',
  label: 'Private session',
  category: 'appointment',
  hint: 'One-to-one, by appointment',
};
const FACILITY_ACCESS_OPTION: ServiceTypeOption = {
  id: 'facility_access',
  label: 'Facility access',
  category: 'access',
  hint: 'Sauna, pool or facility pass',
};
const GYM_ACCESS_OPTION: ServiceTypeOption = {
  id: 'gym_access',
  label: 'Gym access',
  category: 'access',
  hint: 'Open gym or day pass',
};
const GYM_TEAM_PT_OPTION: ServiceTypeOption = {
  id: 'team_personal_training',
  label: 'Personal training',
  category: 'appointment',
  hint: 'Delivered by your team',
  teamDelivered: true,
};

// ── the derivation ────────────────────────────────────────────────────────

/**
 * Which service types this account can create. Provider-appropriate and
 * capability-driven — a solo PT is never offered "Open gym"; a Pilates studio
 * is never asked to pick a venue every time.
 */
export function deriveServiceCapability(input: ServiceCapabilityInput): ServiceCapability {
  const options: ServiceTypeOption[] = [];
  const isClassVenue = venueIs(input.venueTypes, CLASS_VENUE_HINTS);
  const isGymVenue = venueIs(input.venueTypes, GYM_VENUE_HINTS);
  const isSpaVenue = venueIs(input.venueTypes, SPA_VENUE_HINTS);

  if (input.isIndependentPro) {
    options.push(...appointmentOptionsForFlavour(input.professionalFlavour));
  }

  if (input.ownsVenue) {
    if (isClassVenue || (!isGymVenue && !isSpaVenue)) {
      // class-led studio (or an unclassified venue → safest default is classes)
      options.push(GROUP_CLASS_OPTION, PRIVATE_SESSION_OPTION);
    }
    if (isSpaVenue) {
      options.push(
        { id: 'appointment', label: 'Appointment', category: 'appointment', hint: 'Massage or treatment' },
        FACILITY_ACCESS_OPTION,
      );
    }
    if (isGymVenue) {
      options.push(GYM_ACCESS_OPTION, GROUP_CLASS_OPTION);
      if (input.employsTeam) options.push(GYM_TEAM_PT_OPTION);
    }
  }

  const deduped = dedupeById(options);
  const categories = SERVICE_CATEGORIES.filter((c) => deduped.some((o) => o.category === c));

  // "Where?" can be skipped when the account holder has exactly one place they
  // ever deliver at: a single-venue business with no independent online-capable
  // profile.
  const singleVenueImplicit =
    input.ownsVenue && input.venueTypes.length === 1 && !input.isIndependentPro;

  return { categories, options: deduped, singleVenueImplicit };
}

function dedupeById(options: ServiceTypeOption[]): ServiceTypeOption[] {
  const seen = new Set<string>();
  const out: ServiceTypeOption[] = [];
  for (const o of options) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  return out;
}

// ── forbidden types (defence-in-depth + explicit contract) ────────────────

/** Words that must never name a Lana Pro service type. */
export const FORBIDDEN_SERVICE_WORDS = ['programme', 'program', 'experience', 'community'] as const;

export function isForbiddenServiceOption(o: { id: string; label: string }): boolean {
  const hay = `${o.id} ${o.label}`.toLowerCase();
  return FORBIDDEN_SERVICE_WORDS.some((w) => hay.includes(w));
}

/** Every options list passes through here — a guarantee, not a hope. */
export function assertNoForbiddenOptions(options: readonly { id: string; label: string }[]): void {
  const bad = options.find(isForbiddenServiceOption);
  if (bad) {
    throw new Error(`Forbidden service type in taxonomy: ${bad.id}`);
  }
}

// ── professional flavour from EXPLICIT specialisations (never bio text, §16) ──

/** Coarse flavour used to tune terminology + which session fields render.
 *  Derived from structured `personal_trainers.specialisations` / onboarding
 *  professions — NOT from free-text bio. */
export function flavourFromSpecialisations(specs: readonly string[] | null | undefined): ProfessionalFlavour {
  const hay = (specs ?? []).join(' ').toLowerCase();
  if (/nutrition|diet|dietitian/.test(hay)) return 'nutrition';
  if (/massage|recovery|physio|therap|rehab|soft tissue/.test(hay)) return 'therapy';
  if (hay.trim().length > 0) return 'training';
  return 'general';
}
