// LANA PRO — HOME INTELLIGENCE V1: "Clients needing attention".
//
// A compact HOME-level projection of the canonical client intelligence chain
//   L1 FACT → L2 EVIDENCE → L3 SIGNAL → L4 INSIGHT → L5 SUGGESTED ACTION
// for the small number of clients who currently have something worth a look.
//
// It answers: "Who should I pay attention to today, and why?" — WITHOUT the
// PT opening every client. It carries NO raw client comments (those stay on
// the client detail page behind Insight → See evidence → CLIENT SAID) and
// invents NO new intelligence family: every item is a real L4 insight + its
// real L5 action.

import type { PTInsightFamily } from '../lana-pro-insights/types.ts';
import type { SuggestedCoachingActionPriority } from '../lana-pro-coaching-actions/types.ts';

export interface HomeAttentionItem {
  /** the client this is about */
  clientId: string;
  clientName: string;
  /** canonical client detail route — the only navigation Home V1 offers */
  href: string;

  /** the originating L4 insight (traceability — §23) */
  insightId: string;
  insightFamily: PTInsightFamily;
  insightTitle: string;

  /** the L5 suggested coaching action derived from that insight (§23) */
  actionId: string;
  actionTitle: string;
  /** the advisory L5 statement — deterministic, never prescriptive */
  actionStatement: string;

  /** reused L5 priority semantics — NOT a new severity model (§5) */
  priority: SuggestedCoachingActionPriority;
  /** the insight's newest contributing signal (ISO) — drives ordering */
  observedAt: string;
  /** insight.window.sessionCount — for the "Based on N sessions" line */
  basedOnSessions: number;
  /** insight.subject.label (exercise / human category / workout title), or null */
  subjectLabel: string | null;
  /** `adherence` family only — the most recent completed week's counts, for a
   *  factual Home meta line ("Completed 1 of 3 scheduled last week"). */
  adherenceRecent?: { completed: number; scheduled: number };
}
