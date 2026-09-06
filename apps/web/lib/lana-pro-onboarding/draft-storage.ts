// LANA PRO onboarding — browser draft persistence.
//
// A thin, defensive wrapper over localStorage. All shape logic lives in the
// pure onboarding-machine (serializeDraft / normalizeState); this file only
// does the read/write and never throws (a private window, cleared storage,
// or a quota error all degrade to "no draft" / "not saved", and the flow
// still works — it just doesn't resume).

import { ONBOARDING_DRAFT_STORAGE_KEY } from './config.ts';
import {
  normalizeState,
  serializeDraft,
  type OnboardingState,
} from './onboarding-machine.ts';

export function loadOnboardingDraft(): OnboardingState | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    // Corrupt JSON — treat as no draft. Clearing it here would race with a
    // concurrent tab; leave it and let the next successful save overwrite.
    return null;
  }
}

export function saveOnboardingDraft(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ONBOARDING_DRAFT_STORAGE_KEY,
      JSON.stringify(serializeDraft(state)),
    );
  } catch {
    /* quota / disabled storage — non-fatal, the draft just won't resume */
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
