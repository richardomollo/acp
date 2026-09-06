// LANA PRO — Web Partner Onboarding, Phase 1.
//
// The PURE core: step/branch/validation logic + the completion-state
// contract. No React, no DOM, no Supabase — a function of its arguments,
// unit-tested with `node --test`. The React shell (app/lana-pro/onboarding/)
// holds this as its single source of truth and never re-implements any of it.
//
// Phase 1 scope: shared account stage + single-select Professional/Business
// branch selector only. The professional branch, business branch, client
// invitation, Lana Intelligence panels, dashboard IA and migrations are
// explicitly NOT built here — but the state shape and the completion-state
// contract are designed so later phases slot in without a schema-version
// bump for every field.

import {
  isBusinessTypeValue,
  isOperatingModelValue,
} from './business-taxonomy.ts';

// ── Branch ────────────────────────────────────────────────────────────────

export type OnboardingBranch = 'professional' | 'business';
export const ONBOARDING_BRANCHES: readonly OnboardingBranch[] = ['professional', 'business'];

export function isOnboardingBranch(v: unknown): v is OnboardingBranch {
  return v === 'professional' || v === 'business';
}

// ── Steps ─────────────────────────────────────────────────────────────────

export type OnboardingStepId =
  // shared
  | 'welcome'               // §4 — opening proposition + "Get started"
  | 'account'               // §4 — first/last name, mobile, email, password
  | 'branch'                // §3 — single-select Professional vs Business
  // professional branch (Phase 2)
  | 'profession'            // §P1 — what do you do (multi-select)
  | 'client_goals'          // §P2 — who do you help (multi-select, adapts to profession)
  | 'service_model'         // §P3 — 1-to-1 / group / online (multi-select)
  | 'working_model'         // §P5 — where do you work with clients (multi-select)
  | 'location_detail'       // §P5 — progressive location detail; SKIPPED when online/outdoors-only
  | 'experience'            // §P6 — years + certifications (optional)
  | 'professional_review'   // §P10 — review + "Create my Lana profile" (the DB write)
  | 'professional_complete' // §7 — workspace ready / marketplace profile pending review
  // professional activation — existing-client acquisition (Phase 3)
  | 'bring_clients_intro'   // value prop + [Add my clients] / [I'll do this later]
  | 'add_clients'           // stage clients manually or via CSV
  | 'review_invites'        // existing-Lana-user check + preview + confirm
  | 'invite_result'         // "N invited" → Lana Pro
  // business branch (Phase 4.7)
  | 'business_basics'       // §STEP1 — business name + type
  | 'business_location'     // §STEP2 — address / city / country
  | 'business_offerings'    // §STEP3 — operational models (classes / appointments / access)
  | 'business_details'      // §STEP4 — your name / role / contact  (the DB write)
  | 'business_complete'     // §STEP5 — "workspace ready" → Open Lana Pro
  // legacy — kept only so a stale draft pointing here normalises forward
  | 'branch_handoff';

/** Every valid step id — for id validation / iteration only. Navigation uses
 *  `stepSequence(state)`, which is branch- and answer-aware. */
export const ALL_STEP_IDS: readonly OnboardingStepId[] = [
  'welcome', 'account', 'branch',
  'profession', 'client_goals', 'service_model', 'working_model', 'location_detail',
  'experience', 'professional_review', 'professional_complete',
  'bring_clients_intro', 'add_clients', 'review_invites', 'invite_result',
  'business_basics', 'business_location', 'business_offerings', 'business_details', 'business_complete',
  'branch_handoff',
];

/** @deprecated Phase-1 name kept for compatibility — prefer ALL_STEP_IDS / stepSequence. */
export const STEP_ORDER = ALL_STEP_IDS;

export function isOnboardingStepId(v: unknown): v is OnboardingStepId {
  return typeof v === 'string' && (ALL_STEP_IDS as readonly string[]).includes(v);
}

const SHARED_STEPS: readonly OnboardingStepId[] = ['welcome', 'account', 'branch'];

// Canonical answer values — part of the STATE contract (the taxonomy module
// owns their display labels and DB-column mappings, never these strings).
export const SERVICE_MODEL_VALUES = ['one_to_one', 'group', 'online'] as const;
export type ServiceModelValue = (typeof SERVICE_MODEL_VALUES)[number];

export const WORKING_MODEL_VALUES = ['gym_studio', 'own_location', 'travel', 'outdoors', 'online'] as const;
export type WorkingModelValue = (typeof WORKING_MODEL_VALUES)[number];

/** working-model values that require a follow-up `location_detail` step */
const SPATIAL_WORKING_MODES: readonly WorkingModelValue[] = ['gym_studio', 'own_location', 'travel'];

/** §P5 — true when nothing physical is offered (online only, or online+nothing).
 *  Such a professional is NOT sent through the location-detail step. */
export function isOnlineOnlyWorkingModel(workingModel: readonly string[]): boolean {
  const wm = workingModel.filter((m): m is WorkingModelValue =>
    (WORKING_MODEL_VALUES as readonly string[]).includes(m));
  if (wm.length === 0) return false;
  return wm.every((m) => m === 'online' || m === 'outdoors') && wm.includes('online');
}

function needsLocationDetail(state: OnboardingState): boolean {
  const wm = state.professional.workingModel;
  return wm.some((m) => (SPATIAL_WORKING_MODES as readonly string[]).includes(m));
}

/**
 * The ORDERED list of steps for the current state — branch- and answer-aware.
 * `nextStep`/`prevStep` walk this, so a component never decides "what's next".
 */
export function stepSequence(state: OnboardingState): OnboardingStepId[] {
  if (state.branch === 'professional') {
    return [
      ...SHARED_STEPS,
      'profession',
      'client_goals',
      'service_model',
      'working_model',
      ...(needsLocationDetail(state) ? (['location_detail'] as OnboardingStepId[]) : []),
      'experience',
      'professional_review',
      'professional_complete',
      // Phase 3 — activation: bring existing clients. Always reachable, always
      // skippable (§ "Skipping must always be possible and must never block
      // workspace access"). `add_clients`/`review_invites` are skipped when the
      // professional chose "I'll do this later".
      'bring_clients_intro',
      ...(state.professional.clientsSkipped
        ? []
        : (['add_clients', 'review_invites'] as OnboardingStepId[])),
      'invite_result',
    ];
  }
  if (state.branch === 'business') {
    return [
      ...SHARED_STEPS,
      'business_basics',
      'business_location',
      'business_offerings',
      'business_details',
      'business_complete',
    ];
  }
  return [...SHARED_STEPS];
}

// ── State shape ───────────────────────────────────────────────────────────

export interface AccountDraft {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  // `password` is deliberately NOT part of the persistable draft — it is held
  // only in React component state and is never written to any store. See
  // serializeDraft / PersistedDraft below.
}

/**
 * Professional-branch answers (Phase 2). Every field defaults to empty so a
 * fresh or migrated draft is always well-formed. `submitted` flips true once
 * the `personal_trainers` row is written at the review step.
 *
 * Storage mapping (see professional-taxonomy.ts):
 *   professions   → personal_trainers.specialisations
 *   clientGoals   → personal_trainers.client_goals   (Phase-2 additive column)
 *   serviceModel  → personal_trainers.session_types
 *   workingModel  → personal_trainers.training_locations
 *   serviceAreas  → personal_trainers.service_areas   (free-text tags — country-agnostic)
 *   yearsExperience → personal_trainers.years_of_experience
 *   certifications  → personal_trainers.certifications
 *   gymName / ownLocation → personal_trainers.base_location  (one free-text
 *     "where I'm based" line — Phase-3 hardening; NOT a verified venue link)
 *
 * Client PII is NEVER stored here — staged invitees live only in React
 * component state during the add_clients / review_invites steps. This draft
 * only records the OUTCOME: `clientsSkipped`, `invitedCount`.
 */
export interface ProfessionalDraft {
  professions: string[];
  clientGoals: string[];
  serviceModel: string[];   // ServiceModelValue[]
  workingModel: string[];   // WorkingModelValue[]
  serviceAreas: string[];   // free-text area tags (travel / own-location)
  ownLocation: string;      // free text — own_location only, intent capture
  gymName: string;          // free text — gym_studio only, intent capture
  yearsExperience: string;  // numeric string, optional
  certifications: string;   // comma-separated, optional
  submitted: boolean;
  // Phase 3 — activation outcome (no client PII)
  clientsSkipped: boolean;  // chose "I'll do this later" at bring_clients_intro
  invitedCount: number;     // how many invitations were sent at review_invites
}

export const EMPTY_PROFESSIONAL: ProfessionalDraft = {
  professions: [],
  clientGoals: [],
  serviceModel: [],
  workingModel: [],
  serviceAreas: [],
  ownLocation: '',
  gymName: '',
  yearsExperience: '',
  clientsSkipped: false,
  invitedCount: 0,
  certifications: '',
  submitted: false,
};

/**
 * Business-branch answers (Phase 4.7). Every field defaults to empty so a fresh
 * or migrated draft is always well-formed. `submitted` flips true once the
 * `partners` + `gyms` + `partner_gyms` rows are written at `business_details`.
 *
 * Storage mapping (see business-taxonomy.ts + app/lana-pro/onboarding/page.tsx):
 *   businessName    → partners.business_name / gyms.name
 *   businessType    → gyms.type            (via businessTypeToGymType())
 *   address         → gyms.address
 *   city            → gyms.location + gyms.area
 *   country         → captured for display; not a gyms column today
 *   operatingModels → INTENT ONLY — not persisted (drives onboarding copy)
 *   contactName     → partners contact person (account name is the fallback)
 *   contactRole     → captured for display; not a column today
 *   contactPhone    → partners.phone / gyms.contact_phone
 */
export interface BusinessDraft {
  businessName: string;
  businessType: string;      // BusinessTypeValue
  address: string;           // street line, optional
  city: string;
  country: string;           // ISO or free text; prefilled by the shell, editable
  operatingModels: string[]; // OperatingModelValue[]
  contactName: string;
  contactRole: string;
  contactPhone: string;
  submitted: boolean;
}

export const EMPTY_BUSINESS: BusinessDraft = {
  businessName: '',
  businessType: '',
  address: '',
  city: '',
  country: '',
  operatingModels: [],
  contactName: '',
  contactRole: '',
  contactPhone: '',
  submitted: false,
};

export interface OnboardingState {
  /** bumped only on a breaking change to this shape; normalizeState migrates older drafts up */
  schemaVersion: number;
  /** the step the user is currently on */
  stepId: OnboardingStepId;
  account: AccountDraft;
  /** an auth session has been established for this account (Supabase signUp/signIn succeeded) */
  accountCreated: boolean;
  /** the account step resolved to an EXISTING account that was signed into, not a fresh signup */
  existingAccountLinked: boolean;
  branch: OnboardingBranch | null;
  /** professional-branch answers (Phase 2). Cleared whenever `branch` changes. */
  professional: ProfessionalDraft;
  /** business-branch answers (Phase 4.7). Cleared whenever `branch` changes. */
  business: BusinessDraft;
  /** ISO timestamp of the last mutation — used for draft freshness / "resume where you left off" */
  updatedAt: string;
}

export const CURRENT_SCHEMA_VERSION = 1;

const EMPTY_ACCOUNT: AccountDraft = { firstName: '', lastName: '', mobile: '', email: '' };

export function initialOnboardingState(now: string = new Date().toISOString()): OnboardingState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    stepId: 'welcome',
    account: { ...EMPTY_ACCOUNT },
    accountCreated: false,
    existingAccountLinked: false,
    branch: null,
    professional: { ...EMPTY_PROFESSIONAL },
    business: { ...EMPTY_BUSINESS },
    updatedAt: now,
  };
}

// ── Validation (pure) ─────────────────────────────────────────────────────

export interface FieldErrors {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  password?: string;
  branch?: string;
  // professional branch — location_detail
  gymName?: string;
  ownLocation?: string;
  serviceAreas?: string;
  // business branch
  businessName?: string;
  businessType?: string;
  city?: string;
  country?: string;
  operatingModels?: string;
  contactName?: string;
  contactPhone?: string;
}

/** Loose, non-punitive email check — a local part, an @, then a dotted domain.
 *  Never rejects on exotic-but-valid addresses; just catches obvious typos. */
export function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** A mobile number is "plausible" when, stripped of spaces / dashes / parens /
 *  a leading +, it is 7–15 digits (ITU E.164 max is 15). Country-format
 *  validation is deliberately NOT done here — that belongs to the later
 *  geography/localisation work. */
export function isPlausibleMobile(value: string): boolean {
  const digits = value.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  return /^[0-9]{7,15}$/.test(digits);
}

export const MIN_PASSWORD_LENGTH = 6;

export interface AccountValidationInput extends AccountDraft {
  /** transient, never persisted */
  password: string;
}

export function validateAccount(input: AccountValidationInput): FieldErrors {
  const errors: FieldErrors = {};
  if (input.firstName.trim().length === 0) errors.firstName = 'Enter your first name.';
  if (input.lastName.trim().length === 0) errors.lastName = 'Enter your last name.';
  if (!isPlausibleMobile(input.mobile)) errors.mobile = 'Enter a valid mobile number.';
  if (!isPlausibleEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return errors;
}

export function accountIsValid(input: AccountValidationInput): boolean {
  return Object.keys(validateAccount(input)).length === 0;
}

// ── Step gating (pure) ────────────────────────────────────────────────────

export interface AdvanceCheck {
  ok: boolean;
  /** field-level errors for the current step (empty when ok) */
  errors: FieldErrors;
  /** short human reason when not ok and there is no single field to blame */
  reason?: string;
}

const OK: AdvanceCheck = { ok: true, errors: {} };

/**
 * Whether the user may advance FROM `state.stepId`. `password` is passed
 * separately because it is never in `state`. The React layer additionally
 * gates the `account` step on the async auth call succeeding — but the
 * synchronous form-completeness check lives here.
 */
function nonEmptyArray(v: readonly unknown[]): boolean {
  return v.length > 0;
}

/** Validation for the current `location_detail` step, given which spatial
 *  working modes were picked. Each picked mode must contribute *something*. */
function validateLocationDetail(p: ProfessionalDraft): AdvanceCheck {
  const errors: FieldErrors = {};
  if (p.workingModel.includes('gym_studio') && p.gymName.trim().length === 0) {
    errors.gymName = 'Add the name of the gym or studio.';
  }
  if (p.workingModel.includes('own_location') && p.ownLocation.trim().length === 0 && p.serviceAreas.length === 0) {
    errors.ownLocation = 'Add where you’re based, or the areas you cover.';
  }
  if (p.workingModel.includes('travel') && p.serviceAreas.length === 0) {
    errors.serviceAreas = 'Pick at least one area you travel to.';
  }
  return Object.keys(errors).length === 0 ? OK : { ok: false, errors };
}

/** §STEP1–4 validation for the business branch. Each returns OK or field
 *  errors for that step; the shell performs the DB write at business_details. */
function validateBusinessBasics(b: BusinessDraft): AdvanceCheck {
  const errors: FieldErrors = {};
  if (b.businessName.trim().length === 0) errors.businessName = 'Enter your business name.';
  if (!isBusinessTypeValue(b.businessType)) errors.businessType = 'Pick the type that fits best.';
  return Object.keys(errors).length === 0 ? OK : { ok: false, errors };
}

function validateBusinessLocation(b: BusinessDraft): AdvanceCheck {
  const errors: FieldErrors = {};
  if (b.city.trim().length === 0) errors.city = 'Enter the city or town.';
  if (b.country.trim().length === 0) errors.country = 'Enter the country.';
  return Object.keys(errors).length === 0 ? OK : { ok: false, errors };
}

function validateBusinessDetails(b: BusinessDraft): AdvanceCheck {
  const errors: FieldErrors = {};
  if (b.contactName.trim().length === 0) errors.contactName = 'Enter your name.';
  if (!isPlausibleMobile(b.contactPhone)) errors.contactPhone = 'Enter a valid phone number.';
  return Object.keys(errors).length === 0 ? OK : { ok: false, errors };
}

export function canAdvance(state: OnboardingState, opts: { password?: string } = {}): AdvanceCheck {
  const p = state.professional;
  const b = state.business;
  switch (state.stepId) {
    case 'welcome':
      return OK;
    case 'account': {
      if (state.accountCreated) return OK; // already signed in on a prior visit — nothing to re-validate
      const errors = validateAccount({ ...state.account, password: opts.password ?? '' });
      return Object.keys(errors).length === 0 ? OK : { ok: false, errors };
    }
    case 'branch':
      return isOnboardingBranch(state.branch)
        ? OK
        : { ok: false, errors: { branch: 'Choose how you work.' }, reason: 'No branch selected.' };

    // ── professional branch (Phase 2) ──
    case 'profession':
      return nonEmptyArray(p.professions) ? OK : { ok: false, errors: {}, reason: 'Pick at least one profession.' };
    case 'client_goals':
      return nonEmptyArray(p.clientGoals) ? OK : { ok: false, errors: {}, reason: 'Pick who you help.' };
    case 'service_model':
      return nonEmptyArray(p.serviceModel) ? OK : { ok: false, errors: {}, reason: 'Pick how you work with clients.' };
    case 'working_model':
      return nonEmptyArray(p.workingModel) ? OK : { ok: false, errors: {}, reason: 'Pick where you work.' };
    case 'location_detail':
      return validateLocationDetail(p);
    case 'experience':
      return OK; // §P6 — optional
    case 'professional_review':
      // The form is complete by construction (every prior gate passed). The
      // React layer performs the DB write here, then advances.
      return p.submitted
        ? { ok: false, errors: {}, reason: 'Already submitted.' }
        : OK;
    case 'professional_complete':
      // Non-terminal (Phase 3) — advances to the client-acquisition intro.
      return OK;

    // ── professional activation — client acquisition (Phase 3) ──
    // These steps' fine-grained validation (a viable contact per staged
    // client, "confirm before send") lives in the pure client-invite module +
    // the component, not here — the machine only owns the spine. Each step is
    // advanceable; skipping is always allowed (§ "Skipping must always be
    // possible and must never block workspace access").
    case 'bring_clients_intro':
    case 'add_clients':
    case 'review_invites':
      return OK;
    case 'invite_result':
      return { ok: false, errors: {}, reason: 'Activation complete.' };

    // ── business branch (Phase 4.7) ──
    case 'business_basics':
      return validateBusinessBasics(b);
    case 'business_location':
      return validateBusinessLocation(b);
    case 'business_offerings':
      return nonEmptyArray(b.operatingModels)
        ? OK
        : { ok: false, errors: {}, reason: 'Pick at least one thing you offer.' };
    case 'business_details':
      // The React layer performs the partners/gyms/partner_gyms write here,
      // then advances to business_complete.
      return b.submitted
        ? { ok: false, errors: {}, reason: 'Already submitted.' }
        : validateBusinessDetails(b);
    case 'business_complete':
      return { ok: false, errors: {}, reason: 'Business setup complete.' };

    case 'branch_handoff':
      return { ok: false, errors: {}, reason: 'Legacy step — normalised forward.' };
    default:
      return { ok: false, errors: {}, reason: 'Unknown step.' };
  }
}

/** The next step id, or null if there is nowhere valid to go. Walks
 *  `stepSequence(state)`, so it is branch- and answer-aware (e.g. skips
 *  `location_detail` for an online-only professional). */
export function nextStep(state: OnboardingState, opts: { password?: string } = {}): OnboardingStepId | null {
  if (!canAdvance(state, opts).ok) return null;
  const seq = stepSequence(state);
  const i = seq.indexOf(state.stepId);
  if (i < 0 || i >= seq.length - 1) return null;
  return seq[i + 1];
}

/** The previous step id, or null if already at the start. Backward navigation
 *  is always allowed — going back never destroys answers. Walks the same
 *  dynamic `stepSequence`, so returning from `experience` lands on
 *  `location_detail` only when that step applies. */
export function prevStep(state: OnboardingState): OnboardingStepId | null {
  const seq = stepSequence(state);
  const i = seq.indexOf(state.stepId);
  if (i <= 0) return null;
  return seq[i - 1];
}

// ── Mutations (pure — always return a new state) ──────────────────────────

function touch(state: OnboardingState, now?: string): OnboardingState {
  return { ...state, updatedAt: now ?? new Date().toISOString() };
}

export function setAccountField(
  state: OnboardingState,
  field: keyof AccountDraft,
  value: string,
  now?: string,
): OnboardingState {
  return touch({ ...state, account: { ...state.account, [field]: value } }, now);
}

export function markAccountCreated(
  state: OnboardingState,
  opts: { existingAccountLinked: boolean },
  now?: string,
): OnboardingState {
  return touch({ ...state, accountCreated: true, existingAccountLinked: opts.existingAccountLinked }, now);
}

/**
 * §3 — select (or change) the branch.
 *
 * Changing to a DIFFERENT branch clears every downstream branch answer (§12
 * acceptance: "clearing downstream answers when branch changes") and pins the
 * step back to `branch` so the user is never stranded mid-way through a branch
 * that no longer applies. Re-selecting the SAME branch is a no-op on the
 * answers (idempotent) and only refreshes `updatedAt`.
 */
export function selectBranch(state: OnboardingState, branch: OnboardingBranch, now?: string): OnboardingState {
  if (state.branch === branch) return touch(state, now);
  const pastBranch = ALL_STEP_IDS.indexOf(state.stepId) > ALL_STEP_IDS.indexOf('branch');
  return touch(
    {
      ...state,
      branch,
      professional: { ...EMPTY_PROFESSIONAL },
      business: { ...EMPTY_BUSINESS },
      // never leave the user stranded on a step that belongs to the branch
      // they just left
      stepId: pastBranch ? 'branch' : state.stepId,
    },
    now,
  );
}

export function goToStep(state: OnboardingState, stepId: OnboardingStepId, now?: string): OnboardingState {
  return touch({ ...state, stepId }, now);
}

// ── Professional-branch mutations (pure) ──────────────────────────────────

function setProfessional(state: OnboardingState, patch: Partial<ProfessionalDraft>, now?: string): OnboardingState {
  return touch({ ...state, professional: { ...state.professional, ...patch } }, now);
}

export function setProfessionalField(
  state: OnboardingState,
  field: 'ownLocation' | 'gymName' | 'yearsExperience' | 'certifications',
  value: string,
  now?: string,
): OnboardingState {
  return setProfessional(state, { [field]: value }, now);
}

/** Toggling a profession also prunes any selected client goals that the new
 *  profession set no longer offers (§P2 — goals adapt to profession). The
 *  caller passes the still-valid goal set for the new professions. */
export function setProfessions(
  state: OnboardingState,
  professions: string[],
  stillValidGoals: string[],
  now?: string,
): OnboardingState {
  return setProfessional(
    state,
    {
      professions,
      clientGoals: state.professional.clientGoals.filter((g) => stillValidGoals.includes(g)),
    },
    now,
  );
}

export function setClientGoals(state: OnboardingState, clientGoals: string[], now?: string): OnboardingState {
  return setProfessional(state, { clientGoals }, now);
}

export function setServiceModel(state: OnboardingState, serviceModel: string[], now?: string): OnboardingState {
  return setProfessional(state, { serviceModel }, now);
}

/** Changing the working model prunes location-detail answers whose mode is no
 *  longer selected, so a user who deselects "I travel" then advances doesn't
 *  carry stale service areas into their profile (§P5 / "clear downstream
 *  answers"). If the change makes the professional online/outdoors-only, the
 *  `location_detail` step drops out of `stepSequence` automatically. */
export function setWorkingModel(state: OnboardingState, workingModel: string[], now?: string): OnboardingState {
  const wm = new Set(workingModel);
  return setProfessional(
    state,
    {
      workingModel,
      gymName: wm.has('gym_studio') ? state.professional.gymName : '',
      ownLocation: wm.has('own_location') ? state.professional.ownLocation : '',
      serviceAreas:
        wm.has('travel') || wm.has('own_location') ? state.professional.serviceAreas : [],
    },
    now,
  );
}

export function markProfessionalSubmitted(state: OnboardingState, now?: string): OnboardingState {
  return setProfessional(state, { submitted: true }, now);
}

/** §3-Phase-3 — "I'll do this later" at bring_clients_intro. Drops add_clients
 *  / review_invites from the sequence; the next step becomes invite_result
 *  (which the component treats as "skipped → straight to Lana Pro"). */
export function skipClientInvites(state: OnboardingState, now?: string): OnboardingState {
  return setProfessional(state, { clientsSkipped: true, invitedCount: 0 }, now);
}

/** Records the outcome of review_invites — a COUNT only, never any invitee
 *  PII (that never enters onboarding state). */
export function markClientsInvited(state: OnboardingState, count: number, now?: string): OnboardingState {
  return setProfessional(state, { clientsSkipped: false, invitedCount: Math.max(0, Math.floor(count)) }, now);
}

// ── Business-branch mutations (pure) ──────────────────────────────────────

function setBusiness(state: OnboardingState, patch: Partial<BusinessDraft>, now?: string): OnboardingState {
  return touch({ ...state, business: { ...state.business, ...patch } }, now);
}

export function setBusinessField(
  state: OnboardingState,
  field: 'businessName' | 'address' | 'city' | 'country' | 'contactName' | 'contactRole' | 'contactPhone',
  value: string,
  now?: string,
): OnboardingState {
  return setBusiness(state, { [field]: value }, now);
}

export function setBusinessType(state: OnboardingState, businessType: string, now?: string): OnboardingState {
  return setBusiness(state, { businessType }, now);
}

export function setOperatingModels(state: OnboardingState, operatingModels: string[], now?: string): OnboardingState {
  return setBusiness(state, { operatingModels: operatingModels.filter(isOperatingModelValue) }, now);
}

/** Prefill the contact block from the account name/mobile — called by the shell
 *  when the business branch is first entered. Never overwrites a value the user
 *  has already typed. */
export function seedBusinessContact(
  state: OnboardingState,
  seed: { contactName?: string; contactPhone?: string; country?: string },
  now?: string,
): OnboardingState {
  const b = state.business;
  return setBusiness(
    state,
    {
      contactName: b.contactName || (seed.contactName ?? ''),
      contactPhone: b.contactPhone || (seed.contactPhone ?? ''),
      country: b.country || (seed.country ?? ''),
    },
    now,
  );
}

export function markBusinessSubmitted(state: OnboardingState, now?: string): OnboardingState {
  return setBusiness(state, { submitted: true }, now);
}

export function advance(state: OnboardingState, opts: { password?: string } = {}, now?: string): OnboardingState {
  const next = nextStep(state, opts);
  return next ? goToStep(state, next, now) : state;
}

export function back(state: OnboardingState, now?: string): OnboardingState {
  const prev = prevStep(state);
  return prev ? goToStep(state, prev, now) : state;
}

// ── Normalisation / draft compatibility (pure) ────────────────────────────

/** What actually gets written to a draft store: everything except a password
 *  (which is never in `OnboardingState` anyway) — kept as an explicit type so
 *  the persistence boundary is unambiguous. */
export type PersistedDraft = OnboardingState;

export function serializeDraft(state: OnboardingState): PersistedDraft {
  // Structural clone of the serialisable fields only; `account` has no
  // password field to strip, but we rebuild it explicitly so a future added
  // transient field can never leak into a draft by accident.
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    stepId: state.stepId,
    account: {
      firstName: state.account.firstName,
      lastName: state.account.lastName,
      mobile: state.account.mobile,
      email: state.account.email,
    },
    accountCreated: state.accountCreated,
    existingAccountLinked: state.existingAccountLinked,
    branch: state.branch,
    professional: normalizeProfessional(state.professional),
    business: normalizeBusiness(state.business),
    updatedAt: state.updatedAt,
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function bool(v: unknown): boolean {
  return v === true;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Coerce any stored/partial professional blob into a well-formed
 *  ProfessionalDraft. Unknown keys dropped; missing keys defaulted. */
export function normalizeProfessional(input: unknown): ProfessionalDraft {
  const r = obj(input);
  return {
    professions: strArray(r.professions),
    clientGoals: strArray(r.clientGoals),
    serviceModel: strArray(r.serviceModel).filter((v) => (SERVICE_MODEL_VALUES as readonly string[]).includes(v)),
    workingModel: strArray(r.workingModel).filter((v) => (WORKING_MODEL_VALUES as readonly string[]).includes(v)),
    serviceAreas: strArray(r.serviceAreas),
    ownLocation: str(r.ownLocation),
    gymName: str(r.gymName),
    yearsExperience: str(r.yearsExperience),
    certifications: str(r.certifications),
    submitted: bool(r.submitted),
    clientsSkipped: bool(r.clientsSkipped),
    invitedCount: typeof r.invitedCount === 'number' && r.invitedCount >= 0 ? Math.floor(r.invitedCount) : 0,
  };
}

/** Coerce any stored/partial business blob into a well-formed BusinessDraft.
 *  Unknown keys dropped; missing keys defaulted. */
export function normalizeBusiness(input: unknown): BusinessDraft {
  const r = obj(input);
  return {
    businessName: str(r.businessName),
    businessType: isBusinessTypeValue(r.businessType) ? r.businessType : '',
    address: str(r.address),
    city: str(r.city),
    country: str(r.country),
    operatingModels: strArray(r.operatingModels).filter(isOperatingModelValue),
    contactName: str(r.contactName),
    contactRole: str(r.contactRole),
    contactPhone: str(r.contactPhone),
    submitted: bool(r.submitted),
  };
}

/**
 * The one robust entry point for turning ANY previously-persisted blob (a
 * current draft, an older-schema draft, a legacy `partner-signup` draft shape,
 * a partial, `null`, or corrupt JSON already parsed to a value) into a valid
 * `OnboardingState`. Never throws. Unknown keys are ignored; missing keys get
 * defaults; an out-of-range `stepId`/`branch` is coerced to a safe value and
 * the step is clamped so the user can never resume into an impossible state.
 */
export function normalizeState(input: unknown, now: string = new Date().toISOString()): OnboardingState {
  const raw = obj(input);
  const base = initialOnboardingState(now);

  const account: AccountDraft = {
    firstName: str(obj(raw.account).firstName),
    lastName: str(obj(raw.account).lastName),
    mobile: str(obj(raw.account).mobile),
    email: str(obj(raw.account).email),
  };

  const branch = isOnboardingBranch(raw.branch) ? raw.branch : null;
  const accountCreated = bool(raw.accountCreated);

  const professional = normalizeProfessional(raw.professional);

  let stepId: OnboardingStepId = isOnboardingStepId(raw.stepId) ? raw.stepId : 'welcome';

  const PRO_STEPS: readonly OnboardingStepId[] = [
    'profession', 'client_goals', 'service_model', 'working_model',
    'location_detail', 'experience', 'professional_review', 'professional_complete',
    'bring_clients_intro', 'add_clients', 'review_invites', 'invite_result',
  ];
  const BUSINESS_STEPS: readonly OnboardingStepId[] = [
    'business_basics', 'business_location', 'business_offerings', 'business_details', 'business_complete',
  ];
  // Any step that only exists once a branch has been chosen.
  const isBranchStep = (s: OnboardingStepId) =>
    (PRO_STEPS as readonly string[]).includes(s) ||
    (BUSINESS_STEPS as readonly string[]).includes(s) ||
    s === 'branch_handoff';

  // Clamp the resumed step to what the state actually supports, so an old or
  // hand-edited draft can't drop the user past a gate they haven't cleared.
  if (!accountCreated && (stepId === 'branch' || isBranchStep(stepId))) {
    // Never resume past the account step without a session; the React layer
    // still re-checks the live Supabase session and may push forward.
    stepId = 'account';
  } else if (accountCreated && !branch && isBranchStep(stepId)) {
    stepId = 'branch';
  } else if (branch === 'business' && (PRO_STEPS as readonly string[]).includes(stepId)) {
    stepId = 'branch';
  } else if (branch === 'business' && stepId === 'branch_handoff') {
    // stale "coming soon" placeholder — the real business flow now starts here
    stepId = 'business_basics';
  } else if (branch === 'professional' && ((BUSINESS_STEPS as readonly string[]).includes(stepId) || stepId === 'branch_handoff')) {
    stepId = 'branch';
  } else if (
    branch === 'professional' &&
    stepId === 'location_detail' &&
    !professional.workingModel.some((m) => (['gym_studio', 'own_location', 'travel'] as string[]).includes(m))
  ) {
    // resumed onto a location step that no longer applies (online-only) — step forward
    stepId = 'experience';
  }

  return {
    ...base,
    schemaVersion: CURRENT_SCHEMA_VERSION, // any older/absent version is migrated up to current
    stepId,
    account,
    accountCreated,
    existingAccountLinked: bool(raw.existingAccountLinked),
    branch,
    professional,
    business: normalizeBusiness(raw.business),
    updatedAt: str(raw.updatedAt) || now,
  };
}

// ── Completion-state contract (pure, derived) ─────────────────────────────
//
// The spec (§7) requires four INDEPENDENT states that today's UX conflates.
// This function maps the existing DB fields onto them. Phase 1 writes no
// records, so callers pass nulls and only `workspace` resolves — but the
// contract is complete and tested so later phases pass real values without
// changing this file.

export type WorkspaceState = 'workspace_ready';

export type MarketplaceVerificationState =
  | 'marketplace_verification_pending'
  | 'marketplace_verification_approved'
  | 'marketplace_verification_rejected'
  | 'marketplace_verification_suspended';

export type ListingState = 'listing_draft' | 'listing_live';

export type CertificationState =
  | 'certification_not_required'
  | 'certification_pending'
  | 'certification_verified';

export interface DerivedCompletionState {
  /** an auth account exists → the Lana Pro workspace is usable now, regardless of verification */
  workspace: WorkspaceState | null;
  /** whether the public marketplace listing has been approved by review */
  marketplaceVerification: MarketplaceVerificationState | null;
  /** whether the listing is actually visible to consumers */
  listing: ListingState | null;
  /** professional-only: certificate verification, tracked separately from marketplace approval */
  certification: CertificationState | null;
}

export interface CompletionInput {
  accountCreated: boolean;
  branch: OnboardingBranch | null;
  /** personal_trainers.status — professional branch only */
  personalTrainerStatus?: 'pending' | 'approved' | 'rejected' | 'suspended' | null;
  /** personal_trainers.is_certified_verified — professional branch only */
  isCertifiedVerified?: boolean | null;
  /** whether any certifications were declared (drives not_required vs pending) */
  hasDeclaredCertifications?: boolean | null;
  /** gyms.is_active — business branch */
  gymIsActive?: boolean | null;
  /** partners.verified — business branch */
  partnerVerified?: boolean | null;
}

export function deriveCompletionState(input: CompletionInput): DerivedCompletionState {
  const workspace: WorkspaceState | null = input.accountCreated ? 'workspace_ready' : null;

  let marketplaceVerification: MarketplaceVerificationState | null = null;
  let listing: ListingState | null = null;
  let certification: CertificationState | null = null;

  if (input.branch === 'professional') {
    switch (input.personalTrainerStatus ?? null) {
      case 'approved':
        marketplaceVerification = 'marketplace_verification_approved';
        listing = 'listing_live';
        break;
      case 'rejected':
        marketplaceVerification = 'marketplace_verification_rejected';
        listing = 'listing_draft';
        break;
      case 'suspended':
        marketplaceVerification = 'marketplace_verification_suspended';
        listing = 'listing_draft';
        break;
      case 'pending':
        marketplaceVerification = 'marketplace_verification_pending';
        listing = 'listing_draft';
        break;
      default:
        marketplaceVerification = null;
        listing = null;
    }
    if (input.personalTrainerStatus != null) {
      certification = input.isCertifiedVerified
        ? 'certification_verified'
        : input.hasDeclaredCertifications
          ? 'certification_pending'
          : 'certification_not_required';
    }
  } else if (input.branch === 'business') {
    if (input.partnerVerified != null || input.gymIsActive != null) {
      marketplaceVerification = input.partnerVerified
        ? 'marketplace_verification_approved'
        : 'marketplace_verification_pending';
      listing = input.gymIsActive ? 'listing_live' : 'listing_draft';
    }
    // certification is not a business-branch concept
  }

  return { workspace, marketplaceVerification, listing, certification };
}

/**
 * Convenience for the completion screen: builds the CompletionInput from the
 * onboarding state itself (the professional row is `pending` the moment it is
 * written; certifications declared → `certification_pending`, else
 * `certification_not_required`). A submitted business row is `is_active:false` /
 * `partners.verified:false` — workspace ready, marketplace pending.
 */
export function deriveOnboardingCompletion(state: OnboardingState): DerivedCompletionState {
  if (state.branch === 'professional') {
    return deriveCompletionState({
      accountCreated: state.accountCreated,
      branch: 'professional',
      personalTrainerStatus: state.professional.submitted ? 'pending' : null,
      isCertifiedVerified: false,
      hasDeclaredCertifications:
        state.professional.certifications.split(',').map((s) => s.trim()).filter(Boolean).length > 0,
    });
  }
  if (state.branch === 'business') {
    return deriveCompletionState({
      accountCreated: state.accountCreated,
      branch: 'business',
      partnerVerified: state.business.submitted ? false : null,
      gymIsActive: state.business.submitted ? false : null,
    });
  }
  return deriveCompletionState({ accountCreated: state.accountCreated, branch: state.branch });
}

// ── Progress (pure, for the shell's progress bar) ─────────────────────────

/** Nominal total step count, so the bar doesn't jump when a branch is picked
 *  (before a branch, the real remaining length is unknown). The professional
 *  path is the longest, so it anchors the denominator. */
const NOMINAL_TOTAL_STEPS = SHARED_STEPS.length + 8; // + profession…professional_complete

/** Steps at/after which onboarding "progress" is done. `professional_complete`
 *  is the finish line for the measured flow; everything after it (the optional
 *  Bring-your-clients sequence) is a post-onboarding bonus, not measured
 *  progress — so the bar stays full and never drops back. */
const COMPLETE_OR_BEYOND: readonly OnboardingStepId[] = [
  'professional_complete',
  'bring_clients_intro',
  'add_clients',
  'review_invites',
  'invite_result',
  'business_complete',
];

/** 0..1 progress. Measured as position along the CURRENT dynamic sequence
 *  (branch- and answer-aware), against a FIXED nominal denominator — so
 *  choosing a branch (or answers that add/remove a step) never snaps the bar.
 *  A terminal step, and any step in the post-onboarding bonus flow, reads as
 *  complete. */
export function progressFraction(state: OnboardingState): number {
  const seq = stepSequence(state);
  const i = seq.indexOf(state.stepId);
  if (i < 0) return 0;
  if (
    COMPLETE_OR_BEYOND.includes(state.stepId) ||
    (i === seq.length - 1 && state.stepId === 'branch_handoff')
  ) {
    return 1;
  }
  return Math.min(1, i / (NOMINAL_TOTAL_STEPS - 1));
}
