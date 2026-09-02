// ACP Intelligence™ — Beta Feedback #009.
//
// Connection state must represent REAL integration state, never "the user
// tapped Connect". This module holds the pure, testable derivation for
// Apple Health connection state so `node --test` can cover it — the
// services/ modules that call into native HealthKit are not unit-tested.
//
// Apple Health and Strava use very different authorization models and are
// deliberately NOT forced into one shared boolean:
//   - Strava connection state is server truth (strava_connections row, read
//     via the strava-status edge function) and lives in services/strava.ts.
//   - Apple Health has no server record and no persisted boolean. iOS never
//     reveals whether a READ permission was granted or denied (privacy), so
//     the only durable, re-queryable signal is
//     HealthKit.getRequestStatusForAuthorization(), which reports whether
//     the user has been through Apple's permission sheet for our read set.

/**
 * Mirrors `AuthorizationRequestStatus` from
 * `@kingstinct/react-native-healthkit` (`src/types/Auth.ts`):
 *   unknown = 0        — cannot determine (HealthKit unavailable, etc.)
 *   shouldRequest = 1  — at least one requested type has never been presented
 *   unnecessary = 2    — every requested type has already been presented to
 *                        the user (each individually allowed OR denied —
 *                        iOS will not say which, by design)
 */
export const AUTH_REQUEST_STATUS = {
  unknown: 0,
  shouldRequest: 1,
  unnecessary: 2,
} as const;

/**
 * The five deterministic states the Apple Health screen renders.
 * There is deliberately no PARTIAL state — Apple does not expose per-type
 * read grants, so partial permissions are handled in copy, not in state.
 */
export type AppleHealthState =
  | 'unavailable' // not iOS / simulator / Expo Go / no HealthKit / status unknown
  | 'not_connected' // Apple's permission flow has not been completed
  | 'connecting' // request in flight (set by the screen only, never derived)
  | 'connected' // Apple's permission flow has been completed for our read set
  | 'error'; // the authorization request itself threw

export interface AppleHealthSignals {
  /** Platform.OS === 'ios' */
  isIos: boolean;
  /** Device.isDevice — HealthKit is inert in the simulator */
  isRealDevice: boolean;
  /** Constants.appOwnership === 'expo' — Nitro modules don't exist in Expo Go */
  isExpoGo: boolean;
  /** the @kingstinct/react-native-healthkit module loaded successfully */
  moduleLoaded: boolean;
  /** HealthKit.isHealthDataAvailableAsync(); null when not checked */
  healthDataAvailable: boolean | null;
  /**
   * HealthKit.getRequestStatusForAuthorization({ toRead }) result; null when
   * not checked or the check threw (treated as `unknown`).
   */
  requestStatus: number | null;
  /** the last requestAuthorization() call threw */
  lastRequestFailed?: boolean;
}

/**
 * ACP considers Apple Health connected when iOS reports the user has
 * completed Apple's Health permission flow for ACP's read set — i.e.
 * `getRequestStatusForAuthorization` returns `unnecessary`. This does not
 * require any health data to exist, does not claim every category was
 * allowed, and is re-derived live on screen focus / app launch rather than
 * persisted (a stored boolean would go stale against iOS Settings).
 */
export function deriveAppleHealthState(s: AppleHealthSignals): AppleHealthState {
  if (!s.isIos || !s.isRealDevice || s.isExpoGo) return 'unavailable';
  if (!s.moduleLoaded) return 'unavailable';
  if (s.healthDataAvailable === false) return 'unavailable';

  // An explicit authorization failure is a distinct, retryable state.
  if (s.lastRequestFailed) return 'error';

  // No status yet, or iOS could not determine one → treat as unknown, which
  // Apple's own semantics map to "unavailable" rather than "not connected"
  // (we must not claim the user hasn't connected when we simply don't know).
  if (s.requestStatus == null || s.requestStatus === AUTH_REQUEST_STATUS.unknown) {
    return 'unavailable';
  }

  if (s.requestStatus === AUTH_REQUEST_STATUS.unnecessary) return 'connected';
  if (s.requestStatus === AUTH_REQUEST_STATUS.shouldRequest) return 'not_connected';

  return 'unavailable';
}

/** Whether a state should show a "Connected" affordance in Profile. */
export function isConnectedState(state: AppleHealthState): boolean {
  return state === 'connected';
}
