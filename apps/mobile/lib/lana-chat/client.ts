// Lana Chat V1 — the one client boundary for "Ask Lana". Pure aside from
// the injected fetch (mirrors lib/nutrition/nutrition-coaching.ts's own
// convention exactly): POST to the shared ACP OpenAI route, race it against
// a short UX timeout, never throw. All personal evidence (workout status,
// meals, weekly objective, coaching patterns, nutrition_day totals) is
// fetched SERVER-SIDE from canonical tables, keyed only to the caller's own
// verified auth token — this file sends just the message, capped recent
// history, and the one already-computed personal fact the server can't
// safely re-derive itself (the personalised protein range — see the
// screen's own resolveChatProteinTarget, which calls the SAME
// nutritionReferenceService/resolveDailyMacroTargets Today already uses).
import { isLanaChatEnabled } from '../flags.ts';

const CHAT_ENDPOINT = `${process.env.EXPO_PUBLIC_API_URL || 'https://activecitypass.com'}/api/ai/lana-chat`;
const REQUEST_TIMEOUT_MS = 20_000;

export interface LanaChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProteinTargetRange {
  min: number;
  max: number;
}

export interface LanaChatResult {
  ok: boolean;
  reply: string | null;
}

export const lanaChatFallbackReply = "I couldn't get an answer just now — please try again in a moment.";

/**
 * Never throws. Resolves within `timeoutMs` to `{ok:true, reply}` or
 * `{ok:false, reply: null}` (disabled / empty message / timeout / network /
 * server error) — the caller shows a plain, honest error state on
 * `ok:false`, never a raw API error (§15).
 */
export async function sendLanaChatMessage(
  userId: string,
  accessToken: string,
  message: string,
  history: LanaChatTurn[],
  proteinTargetG: ProteinTargetRange | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<LanaChatResult> {
  if (!isLanaChatEnabled() || !message.trim()) return { ok: false, reply: null };

  const request = (async (): Promise<LanaChatResult> => {
    try {
      const res = await fetchImpl(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId, accessToken, message,
          conversationHistory: history,
          proteinTargetG,
        }),
      });
      if (!res.ok) return { ok: false, reply: null };
      const json = await res.json();
      if (!json || typeof json.reply !== 'string') return { ok: false, reply: null };
      return { ok: true, reply: json.reply };
    } catch {
      return { ok: false, reply: null };
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const uiTimeout = new Promise<LanaChatResult>(resolve => {
    timer = setTimeout(() => resolve({ ok: false, reply: null }), timeoutMs);
  });
  try {
    return await Promise.race([request, uiTimeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
