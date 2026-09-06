import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialOnboardingState,
  normalizeState,
  serializeDraft,
  canAdvance,
  nextStep,
  prevStep,
  advance,
  back,
  selectBranch,
  setAccountField,
  markAccountCreated,
  validateAccount,
  accountIsValid,
  isPlausibleEmail,
  isPlausibleMobile,
  deriveCompletionState,
  progressFraction,
  CURRENT_SCHEMA_VERSION,
  ALL_STEP_IDS,
  EMPTY_PROFESSIONAL,
  EMPTY_BUSINESS,
  setBusinessField,
  setBusinessType,
  setOperatingModels,
  seedBusinessContact,
  markBusinessSubmitted,
  type OnboardingState,
} from '../onboarding-machine.ts';

const NOW = '2026-09-06T10:00:00.000Z';

function validAccount(state: OnboardingState): OnboardingState {
  let s = state;
  s = setAccountField(s, 'firstName', 'Richard', NOW);
  s = setAccountField(s, 'lastName', 'Omollo', NOW);
  s = setAccountField(s, 'mobile', '+254 712 345 678', NOW);
  s = setAccountField(s, 'email', 'richard@example.com', NOW);
  return s;
}

// ── field-level validation ───────────────────────────────────────────────

describe('account field validation', () => {
  test('isPlausibleEmail catches obvious typos but accepts ordinary addresses', () => {
    assert.equal(isPlausibleEmail('a@b.co'), true);
    assert.equal(isPlausibleEmail('first.last+tag@sub.domain.co.ke'), true);
    assert.equal(isPlausibleEmail('no-at-sign'), false);
    assert.equal(isPlausibleEmail('missing@dot'), false);
    assert.equal(isPlausibleEmail('  spaced @x.com'), false);
  });

  test('isPlausibleMobile accepts E.164-ish, rejects too short/long/non-numeric', () => {
    assert.equal(isPlausibleMobile('+254712345678'), true);
    assert.equal(isPlausibleMobile('0712 345 678'), true);
    assert.equal(isPlausibleMobile('(020) 123-4567'), true);
    assert.equal(isPlausibleMobile('12345'), false);
    assert.equal(isPlausibleMobile('+1234567890123456'), false); // 16 digits
    assert.equal(isPlausibleMobile('phone'), false);
  });

  test('validateAccount reports one error per missing/invalid field, none when complete', () => {
    assert.deepEqual(
      Object.keys(validateAccount({ firstName: '', lastName: '', mobile: 'x', email: 'x', password: '123' })).sort(),
      ['email', 'firstName', 'lastName', 'mobile', 'password'],
    );
    assert.equal(
      accountIsValid({ firstName: 'A', lastName: 'B', mobile: '+254712345678', email: 'a@b.co', password: 'secret' }),
      true,
    );
  });
});

// ── step gating + navigation ─────────────────────────────────────────────

describe('step gating', () => {
  test('welcome always advances', () => {
    assert.equal(canAdvance(initialOnboardingState(NOW)).ok, true);
    assert.equal(nextStep(initialOnboardingState(NOW)), 'account');
  });

  test('account step blocks until every field + password is valid', () => {
    let s = initialOnboardingState(NOW);
    s = { ...s, stepId: 'account' };
    assert.equal(canAdvance(s, { password: 'secret' }).ok, false); // empty name/mobile/email
    s = validAccount(s);
    assert.equal(canAdvance(s, { password: '12345' }).ok, false); // short password
    assert.equal(canAdvance(s, { password: '123456' }).ok, true);
    assert.equal(nextStep(s, { password: '123456' }), 'branch');
  });

  test('an already-created account skips re-validation on the account step', () => {
    const s = markAccountCreated({ ...initialOnboardingState(NOW), stepId: 'account' }, { existingAccountLinked: false }, NOW);
    assert.equal(canAdvance(s).ok, true); // no password needed
  });

  test('branch step blocks until a valid branch is chosen, then routes into the chosen branch', () => {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    const blocked = canAdvance(s);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.errors.branch, 'Choose how you work.');
    s = selectBranch(s, 'professional', NOW);
    assert.equal(canAdvance(s).ok, true);
    assert.equal(nextStep(s), 'profession'); // Phase 2 — the professional path
    // Phase 4.7 — business routes into the real business flow
    const b = selectBranch({ ...s }, 'business', NOW);
    assert.equal(nextStep(b), 'business_basics');
  });

  test('business_complete is terminal', () => {
    const s = { ...initialOnboardingState(NOW), stepId: 'business_complete' as const, accountCreated: true, branch: 'business' as const };
    assert.equal(canAdvance(s).ok, false);
    assert.equal(nextStep(s), null);
  });
});

// ── backward navigation ──────────────────────────────────────────────────

describe('backward navigation', () => {
  test('prevStep walks the shared spine back and stops at the start', () => {
    assert.equal(prevStep({ ...initialOnboardingState(NOW), stepId: 'branch' }), 'account');
    assert.equal(prevStep({ ...initialOnboardingState(NOW), stepId: 'account' }), 'welcome');
    assert.equal(prevStep(initialOnboardingState(NOW)), null);
    // business flow walks back down its own sequence
    assert.equal(
      prevStep({ ...initialOnboardingState(NOW), branch: 'business', stepId: 'business_basics' }),
      'branch',
    );
    assert.equal(
      prevStep({ ...initialOnboardingState(NOW), branch: 'business', stepId: 'business_offerings' }),
      'business_location',
    );
  });

  test('going back never destroys answers', () => {
    let s = validAccount(initialOnboardingState(NOW));
    s = markAccountCreated({ ...s, stepId: 'branch' }, { existingAccountLinked: false }, NOW);
    s = selectBranch(s, 'professional', NOW);
    s = advance(s, {}, NOW); // → profession
    assert.equal(s.stepId, 'profession');
    const beforeBack = { ...s };
    s = back(s, NOW); // → branch
    assert.equal(s.stepId, 'branch');
    assert.deepEqual(s.account, beforeBack.account);
    assert.equal(s.branch, 'professional');
    assert.equal(s.accountCreated, true);
  });

  test('returning to the account step after accountCreated still passes the gate', () => {
    let s = markAccountCreated({ ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' }, { existingAccountLinked: true }, NOW);
    s = back(s, NOW); // → account
    assert.equal(s.stepId, 'account');
    assert.equal(canAdvance(s).ok, true);
  });
});

// ── branch selection + downstream clearing ───────────────────────────────

describe('branch selection', () => {
  test('professional branch selection', () => {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    s = selectBranch(s, 'professional', NOW);
    assert.equal(s.branch, 'professional');
    assert.equal(canAdvance(s).ok, true);
  });

  test('business branch selection', () => {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    s = selectBranch(s, 'business', NOW);
    assert.equal(s.branch, 'business');
    assert.equal(canAdvance(s).ok, true);
  });

  test('re-selecting the same branch is idempotent (answers untouched)', () => {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    s = selectBranch(s, 'professional', NOW);
    s = { ...s, professional: { ...EMPTY_PROFESSIONAL, professions: ['personal_training'] } };
    const again = selectBranch(s, 'professional', NOW);
    assert.deepEqual(again.professional, { ...EMPTY_PROFESSIONAL, professions: ['personal_training'] });
  });

  test('changing branch clears BOTH downstream answer bags and pins the step back to branch', () => {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    s = selectBranch(s, 'professional', NOW);
    s = {
      ...s,
      stepId: 'working_model',
      professional: { ...EMPTY_PROFESSIONAL, professions: ['yoga'], clientGoals: ['Mobility'], workingModel: ['gym_studio'] },
      business: { ...EMPTY_BUSINESS, businessName: 'Stale Co' },
    };
    s = selectBranch(s, 'business', NOW);
    assert.equal(s.branch, 'business');
    assert.deepEqual(s.professional, EMPTY_PROFESSIONAL);
    assert.deepEqual(s.business, EMPTY_BUSINESS);
    assert.equal(s.stepId, 'branch', 'user is not left stranded on a now-wrong branch step');
  });

  test('invalid branch state', () => {
    // A hand-edited / corrupt draft claiming a branch that does not exist.
    const s = normalizeState({
      schemaVersion: 1,
      stepId: 'branch',
      accountCreated: true,
      branch: 'gym', // not a real branch
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
    });
    assert.equal(s.branch, null, 'unknown branch is coerced to null');
    assert.equal(canAdvance(s).ok, false, 'cannot advance from branch step with no valid branch');
  });
});

// ── resume draft / persistence round-trip ────────────────────────────────

describe('draft resume + serialisation', () => {
  test('resume draft — serialize → normalize round-trips the resumable fields', () => {
    let s = validAccount(initialOnboardingState(NOW));
    s = markAccountCreated({ ...s, stepId: 'branch' }, { existingAccountLinked: false }, NOW);
    s = selectBranch(s, 'professional', NOW);

    const persisted = serializeDraft(s);
    const restored = normalizeState(persisted);

    assert.equal(restored.stepId, 'branch');
    assert.deepEqual(restored.account, s.account);
    assert.equal(restored.accountCreated, true);
    assert.equal(restored.branch, 'professional');
    assert.equal(restored.schemaVersion, CURRENT_SCHEMA_VERSION);
  });

  test('a password can never reach a serialised draft', () => {
    const s = { ...validAccount(initialOnboardingState(NOW)), account: { ...validAccount(initialOnboardingState(NOW)).account } };
    // Even if a caller sneaks a password onto the account object, serialize drops it.
    (s.account as Record<string, unknown>).password = 'super-secret';
    const persisted = serializeDraft(s) as unknown as Record<string, unknown>;
    assert.equal((persisted.account as Record<string, unknown>).password, undefined);
    assert.equal(JSON.stringify(persisted).includes('super-secret'), false);
  });

  test('normalizeState never throws on junk input', () => {
    for (const junk of [null, undefined, 42, 'a string', [], { stepId: 999 }, { account: 'nope' }]) {
      const s = normalizeState(junk, NOW);
      assert.ok(ALL_STEP_IDS.includes(s.stepId));
      assert.equal(s.schemaVersion, CURRENT_SCHEMA_VERSION);
      assert.equal(typeof s.account.firstName, 'string');
    }
  });

  test('old persisted draft compatibility — a legacy partner-signup-shaped blob is coerced, unknown keys ignored', () => {
    const legacy = {
      // no schemaVersion at all (v0)
      stepIndex: 3, // old numeric step field — ignored
      partnerTypes: ['pt', 'venue'], // old multi-select taxonomy — ignored
      formData: { contactName: 'Old User', email: 'old@user.com' }, // old nested shape — ignored
      email: 'top-level@leftover.com', // stray key — ignored
    };
    const s = normalizeState(legacy, NOW);
    assert.equal(s.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(s.stepId, 'welcome'); // no valid stepId → safe default
    assert.equal(s.branch, null);
    assert.deepEqual(s.account, { firstName: '', lastName: '', mobile: '', email: '' });
    assert.deepEqual(s.professional, EMPTY_PROFESSIONAL);
  });

  test('resume is clamped so an impossible step cannot be re-entered', () => {
    // Draft says a business step but no account/branch — must clamp back.
    const noAccount = normalizeState({ stepId: 'business_basics', accountCreated: false, branch: null });
    assert.equal(noAccount.stepId, 'account');

    // A stale "branch_handoff" placeholder with a business branch → the real start.
    const staleHandoff = normalizeState({
      stepId: 'branch_handoff', accountCreated: true, branch: 'business',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
    });
    assert.equal(staleHandoff.stepId, 'business_basics');

    // Draft says "branch" but no session — clamp to account.
    const noSession = normalizeState({ stepId: 'branch', accountCreated: false, branch: null });
    assert.equal(noSession.stepId, 'account');

    // Draft says a professional step with account but no branch — clamp to branch.
    const noBranch = normalizeState({ stepId: 'profession', accountCreated: true, branch: null });
    assert.equal(noBranch.stepId, 'branch');

    // Draft claims a business step but branch is professional — clamp.
    const wrongTerminal = normalizeState({
      stepId: 'business_details', accountCreated: true, branch: 'professional',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
    });
    assert.equal(wrongTerminal.stepId, 'branch');

    // Draft claims a professional step but branch is business — clamp.
    const wrongBranchStep = normalizeState({ stepId: 'service_model', accountCreated: true, branch: 'business' });
    assert.equal(wrongBranchStep.stepId, 'branch');

    // Fully valid professional resume is preserved.
    const ok = normalizeState({
      stepId: 'professional_review', accountCreated: true, branch: 'professional',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
      professional: { professions: ['yoga'], clientGoals: ['Mobility'], serviceModel: ['one_to_one'], workingModel: ['online'] },
    });
    assert.equal(ok.stepId, 'professional_review');

    // Resumed onto a location step that no longer applies (online-only) → step forward.
    const staleLocation = normalizeState({
      stepId: 'location_detail', accountCreated: true, branch: 'professional',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
      professional: { professions: ['nutrition'], clientGoals: ['Healthy eating habits'], serviceModel: ['online'], workingModel: ['online'] },
    });
    assert.equal(staleLocation.stepId, 'experience');
  });
});

// ── completion-state contract ────────────────────────────────────────────

describe('deriveCompletionState — four independent states', () => {
  test('Phase 1: only the workspace resolves once the account exists', () => {
    assert.deepEqual(deriveCompletionState({ accountCreated: false, branch: null }), {
      workspace: null, marketplaceVerification: null, listing: null, certification: null,
    });
    assert.deepEqual(deriveCompletionState({ accountCreated: true, branch: 'professional' }), {
      workspace: 'workspace_ready', marketplaceVerification: null, listing: null, certification: null,
    });
  });

  test('professional: pending status → workspace ready, listing draft, verification pending', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'professional',
      personalTrainerStatus: 'pending', isCertifiedVerified: false, hasDeclaredCertifications: true,
    });
    assert.equal(d.workspace, 'workspace_ready');
    assert.equal(d.marketplaceVerification, 'marketplace_verification_pending');
    assert.equal(d.listing, 'listing_draft');
    assert.equal(d.certification, 'certification_pending');
  });

  test('professional: approved + certs verified → listing live, certification verified', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'professional',
      personalTrainerStatus: 'approved', isCertifiedVerified: true, hasDeclaredCertifications: true,
    });
    assert.equal(d.marketplaceVerification, 'marketplace_verification_approved');
    assert.equal(d.listing, 'listing_live');
    assert.equal(d.certification, 'certification_verified');
  });

  test('professional: approved with no certs declared → certification not required (not "pending")', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'professional',
      personalTrainerStatus: 'approved', isCertifiedVerified: false, hasDeclaredCertifications: false,
    });
    assert.equal(d.certification, 'certification_not_required');
  });

  test('business: verified partner + active gym → approved + live; certification stays null', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'business', partnerVerified: true, gymIsActive: true,
    });
    assert.equal(d.marketplaceVerification, 'marketplace_verification_approved');
    assert.equal(d.listing, 'listing_live');
    assert.equal(d.certification, null);
  });

  test('business: unverified partner, inactive gym → pending + draft', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'business', partnerVerified: false, gymIsActive: false,
    });
    assert.equal(d.marketplaceVerification, 'marketplace_verification_pending');
    assert.equal(d.listing, 'listing_draft');
  });

  test('workspace_ready is independent of verification — a pending pro still has a usable workspace', () => {
    const d = deriveCompletionState({
      accountCreated: true, branch: 'professional', personalTrainerStatus: 'rejected',
    });
    assert.equal(d.workspace, 'workspace_ready');
    assert.equal(d.marketplaceVerification, 'marketplace_verification_rejected');
  });
});

// ── progress ─────────────────────────────────────────────────────────────

describe('progressFraction', () => {
  test('monotonic 0 → 1; a terminal step reads as complete; choosing a branch does not snap the bar', () => {
    assert.equal(progressFraction({ ...initialOnboardingState(NOW), stepId: 'welcome' }), 0);
    assert.equal(
      progressFraction({ ...initialOnboardingState(NOW), branch: 'business', stepId: 'business_complete' }),
      1,
    );
    assert.equal(
      progressFraction({ ...initialOnboardingState(NOW), branch: 'professional', stepId: 'professional_complete' }),
      1,
    );
    const atBranchNoBranch = progressFraction({ ...initialOnboardingState(NOW), stepId: 'branch' });
    const atBranchPro = progressFraction({ ...initialOnboardingState(NOW), branch: 'professional', stepId: 'branch' });
    assert.ok(atBranchNoBranch > 0 && atBranchNoBranch < 0.5, 'branch step is early, not near-complete');
    assert.equal(atBranchNoBranch, atBranchPro, 'picking a branch does not jump the progress bar');
  });
});

// ── Phase 2 — professional branch ────────────────────────────────────────

import {
  setProfessions,
  setClientGoals,
  setServiceModel,
  setWorkingModel,
  setProfessionalField,
  markProfessionalSubmitted,
  stepSequence,
  isOnlineOnlyWorkingModel,
  deriveOnboardingCompletion,
} from '../onboarding-machine.ts';

function proAtBranch(): OnboardingState {
  let s = validAccount(initialOnboardingState(NOW));
  s = markAccountCreated({ ...s, stepId: 'branch' }, { existingAccountLinked: false }, NOW);
  return selectBranch(s, 'professional', NOW);
}

describe('professional branch — step sequence', () => {
  test('full sequence for an in-person professional includes location_detail', () => {
    let s = proAtBranch();
    s = setWorkingModel({ ...s, stepId: 'working_model' }, ['gym_studio', 'online'], NOW);
    assert.deepEqual(stepSequence(s), [
      'welcome', 'account', 'branch',
      'profession', 'client_goals', 'service_model', 'working_model',
      'location_detail', 'experience', 'professional_review', 'professional_complete',
      'bring_clients_intro', 'add_clients', 'review_invites', 'invite_result',
    ]);
  });

  test('online-only professional skips location_detail entirely (§P5)', () => {
    let s = proAtBranch();
    s = setWorkingModel({ ...s, stepId: 'working_model' }, ['online'], NOW);
    assert.equal(stepSequence(s).includes('location_detail'), false);
    assert.equal(isOnlineOnlyWorkingModel(['online']), true);
    assert.equal(isOnlineOnlyWorkingModel(['online', 'outdoors']), true);
    assert.equal(isOnlineOnlyWorkingModel(['online', 'gym_studio']), false);
    assert.equal(isOnlineOnlyWorkingModel(['outdoors']), false); // outdoors alone is physical
  });

  test('nextStep hops working_model → experience when online-only', () => {
    let s = proAtBranch();
    s = setProfessions({ ...s, stepId: 'working_model' }, ['nutrition'], ['Healthy eating habits'], NOW);
    s = setClientGoals(s, ['Healthy eating habits'], NOW);
    s = setServiceModel(s, ['online'], NOW);
    s = setWorkingModel(s, ['online'], NOW);
    assert.equal(nextStep(s), 'experience');
  });
});

describe('professional branch — gating', () => {
  test('each answer step blocks until at least one option is picked', () => {
    let s = { ...proAtBranch(), stepId: 'profession' as const };
    assert.equal(canAdvance(s).ok, false);
    s = setProfessions(s, ['yoga'], ['Mobility'], NOW);
    assert.equal(canAdvance(s).ok, true);

    s = { ...s, stepId: 'client_goals' };
    assert.equal(canAdvance(s).ok, false);
    s = setClientGoals(s, ['Mobility'], NOW);
    assert.equal(canAdvance(s).ok, true);

    s = { ...s, stepId: 'service_model' };
    assert.equal(canAdvance(s).ok, false);
    s = setServiceModel(s, ['one_to_one'], NOW);
    assert.equal(canAdvance(s).ok, true);

    s = { ...s, stepId: 'working_model' };
    assert.equal(canAdvance(s).ok, false);
    s = setWorkingModel(s, ['online'], NOW);
    assert.equal(canAdvance(s).ok, true);
  });

  test('experience is optional — always advanceable', () => {
    const s = { ...proAtBranch(), stepId: 'experience' as const };
    assert.equal(canAdvance(s).ok, true);
  });

  test('location_detail requires a contribution per selected spatial mode', () => {
    let s = { ...proAtBranch(), stepId: 'location_detail' as const };
    s = setWorkingModel(s, ['gym_studio', 'travel'], NOW);
    assert.equal(canAdvance(s).ok, false);
    assert.deepEqual(Object.keys(canAdvance(s).errors).sort(), ['gymName', 'serviceAreas']);
    s = setProfessionalField(s, 'gymName', 'Iron Haven', NOW);
    s = setClientGoals(s, [], NOW); // unrelated, no-op on this gate
    s = { ...s, professional: { ...s.professional, serviceAreas: ['Westlands'] } };
    assert.equal(canAdvance(s).ok, true);
  });

  test('own_location accepts EITHER a typed base OR picked areas', () => {
    let s = { ...proAtBranch(), stepId: 'location_detail' as const };
    s = setWorkingModel(s, ['own_location'], NOW);
    assert.equal(canAdvance(s).ok, false);
    const withText = setProfessionalField(s, 'ownLocation', 'Studio 5, Kilimani', NOW);
    assert.equal(canAdvance(withText).ok, true);
    const withAreas = { ...s, professional: { ...s.professional, serviceAreas: ['Kilimani'] } };
    assert.equal(canAdvance(withAreas).ok, true);
  });

  test('professional_review advances once, then reports "already submitted"', () => {
    let s = { ...proAtBranch(), stepId: 'professional_review' as const };
    assert.equal(canAdvance(s).ok, true);
    s = markProfessionalSubmitted(s, NOW);
    assert.equal(canAdvance(s).ok, false);
    assert.equal(nextStep({ ...s, professional: { ...s.professional, submitted: false } }), 'professional_complete');
  });
});

describe('professional branch — downstream clearing', () => {
  test('changing professions prunes now-invalid client goals', () => {
    let s = proAtBranch();
    // yoga offers Mobility + Stress & recovery; strength does not offer Stress & recovery
    s = setProfessions(s, ['yoga'], ['Mobility', 'Stress & recovery', 'General fitness'], NOW);
    s = setClientGoals(s, ['Mobility', 'Stress & recovery', 'General fitness'], NOW);
    s = setProfessions(s, ['strength_conditioning'], ['Mobility', 'General fitness'], NOW);
    assert.deepEqual(s.professional.clientGoals, ['Mobility', 'General fitness']);
  });

  test('deselecting a spatial working mode clears its location answers', () => {
    let s = proAtBranch();
    s = setWorkingModel({ ...s, stepId: 'working_model' }, ['gym_studio', 'travel'], NOW);
    s = setProfessionalField(s, 'gymName', 'Iron Haven', NOW);
    s = { ...s, professional: { ...s.professional, serviceAreas: ['Westlands', 'Kilimani'] } };
    s = setWorkingModel(s, ['online'], NOW); // drop both spatial modes
    assert.equal(s.professional.gymName, '');
    assert.deepEqual(s.professional.serviceAreas, []);
    assert.equal(stepSequence(s).includes('location_detail'), false);
  });
});

describe('professional branch — completion', () => {
  test('before submit: null verification; after submit: workspace ready + pending review', () => {
    let s = proAtBranch();
    s = setProfessionalField({ ...s, stepId: 'experience' }, 'certifications', 'NASM CPT, REPS Kenya', NOW);
    const before = deriveOnboardingCompletion(s);
    assert.equal(before.workspace, 'workspace_ready');
    assert.equal(before.marketplaceVerification, null);

    s = markProfessionalSubmitted(s, NOW);
    const after = deriveOnboardingCompletion(s);
    assert.equal(after.workspace, 'workspace_ready');
    assert.equal(after.marketplaceVerification, 'marketplace_verification_pending');
    assert.equal(after.listing, 'listing_draft');
    assert.equal(after.certification, 'certification_pending'); // certs declared
  });

  test('no certifications declared → certification_not_required after submit', () => {
    const s = markProfessionalSubmitted(proAtBranch(), NOW);
    assert.equal(deriveOnboardingCompletion(s).certification, 'certification_not_required');
  });
});

describe('professional branch — resume', () => {
  test('a mid-flow professional draft round-trips', () => {
    let s = proAtBranch();
    s = setProfessions({ ...s, stepId: 'service_model' }, ['personal_training', 'nutrition'], ['Lose weight', 'Build muscle'], NOW);
    s = setClientGoals(s, ['Lose weight', 'Build muscle'], NOW);
    s = setServiceModel(s, ['one_to_one', 'online'], NOW);
    const restored = normalizeState(serializeDraft(s));
    assert.equal(restored.stepId, 'service_model');
    assert.deepEqual(restored.professional.professions, ['personal_training', 'nutrition']);
    assert.deepEqual(restored.professional.clientGoals, ['Lose weight', 'Build muscle']);
    assert.deepEqual(restored.professional.serviceModel, ['one_to_one', 'online']);
    assert.equal(restored.professional.submitted, false);
  });

  test('normalizeProfessional drops unknown service/working-model values', () => {
    const s = normalizeState({
      accountCreated: true, branch: 'professional', stepId: 'working_model',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
      professional: { serviceModel: ['one_to_one', 'telepathy'], workingModel: ['online', 'space_station'] },
    });
    assert.deepEqual(s.professional.serviceModel, ['one_to_one']);
    assert.deepEqual(s.professional.workingModel, ['online']);
  });
});

// ── Phase 3 — existing-client acquisition ────────────────────────────────

import {
  skipClientInvites,
  markClientsInvited,
  goToStep,
} from '../onboarding-machine.ts';

/** A professional who has submitted their profile and is sitting on the
 *  completion screen (`professional_complete`). */
function proAtComplete(): OnboardingState {
  let s = proAtBranch();
  s = setProfessions({ ...s, stepId: 'profession' }, ['personal_training'], ['Lose weight'], NOW);
  s = setClientGoals(s, ['Lose weight'], NOW);
  s = setServiceModel(s, ['one_to_one'], NOW);
  s = setWorkingModel(s, ['online'], NOW); // online-only → no location_detail
  s = markProfessionalSubmitted(s, NOW);
  return goToStep(s, 'professional_complete', NOW);
}

describe('Phase 3 — client-invite step spine', () => {
  test('professional_complete is non-terminal and leads into bring_clients_intro', () => {
    const s = proAtComplete();
    assert.equal(canAdvance(s).ok, true);
    assert.equal(nextStep(s), 'bring_clients_intro');
  });

  test('default sequence includes the full invite flow', () => {
    const s = proAtComplete();
    assert.deepEqual(stepSequence(s).slice(-4), [
      'bring_clients_intro', 'add_clients', 'review_invites', 'invite_result',
    ]);
  });

  test('bring_clients_intro → add_clients → review_invites → invite_result, then terminal', () => {
    let s = proAtComplete();
    s = advance(s, {}, NOW);
    assert.equal(s.stepId, 'bring_clients_intro');
    s = advance(s, {}, NOW);
    assert.equal(s.stepId, 'add_clients');
    s = advance(s, {}, NOW);
    assert.equal(s.stepId, 'review_invites');
    s = advance(s, {}, NOW);
    assert.equal(s.stepId, 'invite_result');
    assert.equal(canAdvance(s).ok, false); // terminal
    assert.equal(nextStep(s), null);
  });

  test('skipClientInvites collapses add_clients/review_invites out of the sequence', () => {
    const s = skipClientInvites(proAtComplete(), NOW);
    assert.equal(s.professional.clientsSkipped, true);
    assert.equal(s.professional.invitedCount, 0);
    const seq = stepSequence(s);
    assert.equal(seq.includes('add_clients'), false);
    assert.equal(seq.includes('review_invites'), false);
    // from the intro, the only place forward is the result screen
    assert.equal(nextStep({ ...s, stepId: 'bring_clients_intro' }), 'invite_result');
  });

  test('markClientsInvited records a non-negative integer count', () => {
    assert.equal(markClientsInvited(proAtComplete(), 3, NOW).professional.invitedCount, 3);
    assert.equal(markClientsInvited(proAtComplete(), -2, NOW).professional.invitedCount, 0);
    assert.equal(markClientsInvited(proAtComplete(), 2.9, NOW).professional.invitedCount, 2);
    assert.equal(markClientsInvited(proAtComplete(), 1, NOW).professional.clientsSkipped, false);
  });

  test('progress bar stays full across the whole post-onboarding bonus flow', () => {
    for (const stepId of ['professional_complete', 'bring_clients_intro', 'add_clients', 'review_invites', 'invite_result'] as const) {
      assert.equal(progressFraction({ ...proAtComplete(), stepId }), 1, `${stepId} should read as complete`);
    }
  });

  test('back from bring_clients_intro returns to professional_complete (non-destructive)', () => {
    const s = advance(proAtComplete(), {}, NOW); // now at bring_clients_intro
    assert.equal(prevStep(s), 'professional_complete');
  });

  test('resume: a persisted invite-step draft round-trips and stays put', () => {
    let s = proAtComplete();
    s = advance(s, {}, NOW); // bring_clients_intro
    s = advance(s, {}, NOW); // add_clients
    s = markClientsInvited(s, 2, NOW);
    const restored = normalizeState(serializeDraft(s));
    assert.equal(restored.stepId, 'add_clients');
    assert.equal(restored.professional.invitedCount, 2);
  });

  test('resume: an invite step with no branch is clamped back to account', () => {
    const s = normalizeState({
      stepId: 'review_invites',
      account: { firstName: '', lastName: '', mobile: '', email: '' },
    });
    assert.equal(s.stepId, 'account');
  });

  test('resume: an invite step on the business branch is clamped back to branch', () => {
    const s = normalizeState({
      accountCreated: true, branch: 'business', stepId: 'add_clients',
      account: { firstName: 'A', lastName: 'B', mobile: '0712345678', email: 'a@b.co' },
    });
    assert.equal(s.stepId, 'branch');
  });

  test('staged client PII never enters the serialised draft', () => {
    const s = markClientsInvited(proAtComplete(), 4, NOW);
    const raw = JSON.stringify(serializeDraft(s));
    assert.equal(raw.includes('invitedCount'), true);
    // the draft carries only the count + skip flag, never names/emails/phones
    assert.equal(/firstName":"[^"]*@|invitedEmail|stagedClient/i.test(raw), false);
  });
});

// ── Phase 4.7 — business branch ──────────────────────────────────────────

describe('business branch', () => {
  function bizAtBranch(): OnboardingState {
    let s = { ...validAccount(initialOnboardingState(NOW)), stepId: 'branch' as const, accountCreated: true };
    s = selectBranch(s, 'business', NOW);
    return s;
  }

  test('stepSequence is the five business steps after the shared spine', () => {
    assert.deepEqual(stepSequence(bizAtBranch()), [
      'welcome', 'account', 'branch',
      'business_basics', 'business_location', 'business_offerings', 'business_details', 'business_complete',
    ]);
  });

  test('business_basics gates on name + a valid type', () => {
    let s = { ...bizAtBranch(), stepId: 'business_basics' as const };
    assert.equal(canAdvance(s).ok, false);
    s = setBusinessField(s, 'businessName', 'Iron Haven', NOW);
    assert.equal(canAdvance(s).ok, false, 'still needs a type');
    s = setBusinessType(s, 'not-a-type', NOW);
    assert.equal(canAdvance(s).ok, false, 'rejects an unknown type');
    s = setBusinessType(s, 'gym', NOW);
    assert.equal(canAdvance(s).ok, true);
  });

  test('business_location needs city + country; address stays optional; Kenya is never inferred', () => {
    let s = { ...bizAtBranch(), stepId: 'business_location' as const };
    assert.equal(canAdvance(s).ok, false);
    s = setBusinessField(s, 'city', 'Nairobi', NOW);
    assert.equal(canAdvance(s).errors.country, 'Enter the country.');
    s = setBusinessField(s, 'country', 'Kenya', NOW);
    assert.equal(canAdvance(s).ok, true, 'address is optional');
  });

  test('business_offerings needs at least one operating model; unknown values are dropped', () => {
    let s = { ...bizAtBranch(), stepId: 'business_offerings' as const };
    assert.equal(canAdvance(s).ok, false);
    s = setOperatingModels(s, ['classes', 'nonsense'], NOW);
    assert.deepEqual(s.business.operatingModels, ['classes']);
    assert.equal(canAdvance(s).ok, true);
  });

  test('business_details gates on contact name + a plausible phone; submitted blocks re-advance', () => {
    let s = { ...bizAtBranch(), stepId: 'business_details' as const };
    assert.equal(canAdvance(s).ok, false);
    s = setBusinessField(s, 'contactName', 'Amara W', NOW);
    s = setBusinessField(s, 'contactPhone', '0712345678', NOW);
    assert.equal(canAdvance(s).ok, true);
    s = markBusinessSubmitted(s, NOW);
    assert.equal(canAdvance(s).ok, false);
  });

  test('seedBusinessContact prefills from the account but never overwrites typed values', () => {
    let s = bizAtBranch();
    s = seedBusinessContact(s, { contactName: 'Richard Omollo', contactPhone: '+254712345678', country: 'KE' }, NOW);
    assert.equal(s.business.contactName, 'Richard Omollo');
    assert.equal(s.business.country, 'KE');
    s = setBusinessField(s, 'contactName', 'Someone Else', NOW);
    s = seedBusinessContact(s, { contactName: 'Richard Omollo' }, NOW);
    assert.equal(s.business.contactName, 'Someone Else');
  });

  test('full walk: branch → business_complete, then terminal', () => {
    let s = bizAtBranch();
    s = advance(s, {}, NOW); // → business_basics
    assert.equal(s.stepId, 'business_basics');
    s = setBusinessField(s, 'businessName', 'Zen Flow', NOW);
    s = setBusinessType(s, 'pilates_yoga_studio', NOW);
    s = advance(s, {}, NOW); // → business_location
    s = setBusinessField(s, 'city', 'Lisbon', NOW);
    s = setBusinessField(s, 'country', 'Portugal', NOW);
    s = advance(s, {}, NOW); // → business_offerings
    s = setOperatingModels(s, ['classes'], NOW);
    s = advance(s, {}, NOW); // → business_details
    s = setBusinessField(s, 'contactName', 'Priya M', NOW);
    s = setBusinessField(s, 'contactPhone', '+351912345678', NOW);
    s = advance(s, {}, NOW); // → business_complete
    assert.equal(s.stepId, 'business_complete');
    assert.equal(nextStep(s), null);
    assert.equal(progressFraction(s), 1);
  });

  test('deriveOnboardingCompletion: submitted business → workspace ready, marketplace pending, listing draft', () => {
    let s = { ...bizAtBranch(), stepId: 'business_complete' as const };
    s = markBusinessSubmitted(s, NOW);
    const d = deriveOnboardingCompletion(s);
    assert.equal(d.workspace, 'workspace_ready');
    assert.equal(d.marketplaceVerification, 'marketplace_verification_pending');
    assert.equal(d.listing, 'listing_draft');
    assert.equal(d.certification, null);
  });

  test('a persisted business draft round-trips through serialize + normalize', () => {
    let s = bizAtBranch();
    s = setBusinessField(s, 'businessName', 'Iron Haven', NOW);
    s = setBusinessType(s, 'gym', NOW);
    s = setOperatingModels(s, ['classes', 'facility_access'], NOW);
    s = { ...s, stepId: 'business_offerings' };
    const round = normalizeState(JSON.parse(JSON.stringify(serializeDraft(s))), NOW);
    assert.equal(round.business.businessName, 'Iron Haven');
    assert.equal(round.business.businessType, 'gym');
    assert.deepEqual(round.business.operatingModels, ['classes', 'facility_access']);
    assert.equal(round.stepId, 'business_offerings');
  });
});
