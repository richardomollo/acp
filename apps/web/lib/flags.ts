// ACP Intelligence™ Day 10 — operational kill switches (§20-22).
//
// Three env-controlled flags. Each defaults to ENABLED; a flag is off ONLY
// when its env var is exactly the string "false". These are incident
// controls, not a feature-management platform — keep the count at three.
//
//   ACP_WEEKLY_ADAPTATION_ENABLED=false
//     → the weekly-adaptation route returns the user's CURRENT plan
//       unchanged (never an error, never a regenerate). Onboarding,
//       My Plan, completion and execution feedback are unaffected.
//
//   ACP_RAG_ENABLED=false
//     → weekly adaptation still runs, with no RELEVANT ACP KNOWLEDGE block
//       (identical to a live RAG outage, which is already handled).
//
//   ACP_EXECUTION_FEEDBACK_ENABLED=false
//     → the adaptation prompt gets no EXECUTION EVIDENCE block and no
//       execution-pattern coaching memory is written. Completion, partial
//       and skip still work; the mobile feedback UI hides itself via the
//       matching EXPO_PUBLIC_ flag.

function isOff(name: string): boolean {
  return process.env[name] === 'false';
}

export function isWeeklyAdaptationEnabled(): boolean {
  return !isOff('ACP_WEEKLY_ADAPTATION_ENABLED');
}

export function isRagEnabled(): boolean {
  return !isOff('ACP_RAG_ENABLED');
}

export function isExecutionFeedbackEnabled(): boolean {
  return !isOff('ACP_EXECUTION_FEEDBACK_ENABLED');
}

/** Snapshot for a single structured log line at request start. */
export function flagSnapshot(): { weeklyAdaptation: boolean; rag: boolean; executionFeedback: boolean } {
  return {
    weeklyAdaptation: isWeeklyAdaptationEnabled(),
    rag: isRagEnabled(),
    executionFeedback: isExecutionFeedbackEnabled(),
  };
}
