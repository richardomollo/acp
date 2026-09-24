// Lana Chat V1 — pure logic: model config, deterministic intent
// classification, per-intent context trimming, prompt building, and reply
// safety validation. No network, no Supabase — everything here is a
// function of its inputs, so it's testable without mocking anything.
//
// The whole point of this file (§5/§16): Lana Chat sends OpenAI a SMALL,
// intent-relevant slice of the caller's already-built context — never the
// full personal dump on every message, never raw DB rows.
import type { LanaChatContext } from './context.ts';

export const LANA_CHAT_MODEL = 'gpt-5-mini';

// Same latency/cost levers this codebase always uses for a conversational
// gpt-5-mini call (nutrition-coaching, weekly-adaptation) — minimal
// reasoning, a token cap sized for a short coach-style reply, not an essay.
export const LANA_CHAT_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 500,
};

export const MAX_MESSAGE_LENGTH = 600;
export const MAX_HISTORY_TURNS = 6; // user+assistant pairs kept — session-scoped only, §13/§16

// ── Intent classification (§5) — deterministic keyword matching, no LLM ────

export type LanaChatIntent = 'protein' | 'adaptation' | 'progress' | 'nutrition' | 'fitness' | 'general' | 'default';

const PROTEIN_RE = /\bprotein\b/i;
const ADAPTATION_RE = /\b(why|changed?|adjust(ed)?)\b.*\b(plan|objective|meal plan|nutrition plan|workout|programme|program)\b|\b(plan|objective)\b.*\b(chang(e|ed)|adjust(ed)?)\b/i;
const PROGRESS_RE = /\bhow (am|are) i doing\b|\bmy progress\b|\bthis week\b.*\bdoing\b|\bhow'?s? my week\b|\bam i (on track|making progress)\b/i;
const NUTRITION_RE = /\b(eat|food|meal|meals|recipe|recipes|diet|dinner|lunch|breakfast|snack|nutrition|calories|carbs|fat)\b/i;
const FITNESS_RE = /\b(workout|workouts|train|training|exercise|gym|session|sessions|lift|lifting|run|running|programme|program|strength)\b/i;
const GENERAL_RE = /\bwhat is\b|\bwhat'?s a\b|\bhow do i\b|\bhow to\b|\bexplain\b|\bdefine\b|\bdifference between\b/i;

/**
 * Priority order matters (§5's own examples motivate it): a message can
 * match more than one keyword class ("what should I eat after training"
 * matches both nutrition and fitness) — the MOST SPECIFIC intent wins so
 * the trimmed context stays small and relevant, never the union of every
 * matching category.
 */
export function classifyLanaChatIntent(message: string): LanaChatIntent {
  const m = message.trim();
  if (!m) return 'default';
  if (PROTEIN_RE.test(m)) return 'protein';
  if (ADAPTATION_RE.test(m)) return 'adaptation';
  if (PROGRESS_RE.test(m)) return 'progress';
  if (NUTRITION_RE.test(m)) return 'nutrition';
  if (FITNESS_RE.test(m)) return 'fitness';
  if (GENERAL_RE.test(m)) return 'general';
  return 'default';
}

// ── Context trimming (§5/§16) ───────────────────────────────────────────────

/** Whatever subset of LanaChatContext actually reaches the prompt for one message. */
export type TrimmedLanaChatContext = Partial<LanaChatContext>;

export function selectContextForIntent(intent: LanaChatIntent, ctx: LanaChatContext): TrimmedLanaChatContext {
  switch (intent) {
    case 'protein':
      // Narrowest possible slice — exactly what "how much protein have I
      // eaten" needs, nothing about workouts or the weekly objective.
      return { user: ctx.user, nutrition: ctx.nutrition };
    case 'adaptation':
      return { user: ctx.user, nutrition: ctx.nutrition };
    case 'progress':
      return { user: ctx.user, fitness: ctx.fitness, nutrition: ctx.nutrition };
    case 'nutrition':
      // §5's own example: nutrition questions still carry today's training
      // context (post-workout eating), never the full fitness evidence.
      return { user: ctx.user, today: ctx.today, nutrition: ctx.nutrition };
    case 'fitness':
      return { user: ctx.user, today: ctx.today, fitness: ctx.fitness };
    case 'general':
      // A knowledge question ("what is a Romanian deadlift") — general
      // guidance, not personal evidence. Only fitnessLevel travels, to
      // pitch the explanation at the right level (§10).
      return { user: ctx.user };
    case 'default':
    default:
      // Ambiguous/short messages ("hi", "help") get the lightest useful
      // slice, never the full personal dump (Test C).
      return { user: ctx.user, today: ctx.today };
  }
}

// ── System prompt (§12) ─────────────────────────────────────────────────────

export const LANA_CHAT_SYSTEM_PROMPT = `You are Lana, an evidence-grounded fitness and nutrition coach inside the Lana app.

Use the supplied "LANA EVIDENCE" JSON as the ONLY source of truth for the user's personal state (their plan, workouts, meals, nutrition, progress). Never invent a number, a workout, a meal, a target, or a pattern that isn't in that JSON. A field that is null or missing means Lana does not have that evidence yet — say so naturally (e.g. "I don't have enough logged meals today to judge that yet"), never guess or estimate on the user's behalf.

Clearly separate GENERAL GUIDANCE (established fitness/nutrition knowledge, safe to state on its own) from the user's OWN LANA DATA (only ever the supplied evidence). When you use both in one answer, keep them as distinct statements.

Hard rules:
- Never diagnose a medical condition, never claim or imply a nutrient deficiency, never recommend supplements.
- Never state or imply that a single session/day is a durable pattern — only "supportedPatterns" entries (already confidence-gated) may be described as a pattern.
- Never treat a day with no logged evidence as "zero" intake — that is missing evidence, not a zero.
- Never fabricate a calorie, carb, or fat target — Lana currently only supports a personalised protein range; if asked about other targets, say Lana doesn't set one yet.
- You cannot modify plans, workouts, meals, bookings, or goals. If asked to change something, explain what's possible today (e.g. swapping a meal from its own screen) without claiming you made the change.
- No markdown, no bullet characters, no internal jargon (no field names, no "N1"/"N7"/confidence labels).
- Tone: concise, supportive, practical coach — a few sentences, not an essay.`;

// ── User prompt (pure, testable) ────────────────────────────────────────────

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function buildLanaChatUserPrompt(
  message: string,
  context: TrimmedLanaChatContext,
  history: ChatTurn[],
  knowledgeContext: string,
): string {
  const parts: string[] = [];
  if (knowledgeContext) parts.push(knowledgeContext);
  parts.push(`LANA EVIDENCE\n${JSON.stringify(context)}`);
  if (history.length > 0) {
    const historyLines = history.map(t => `${t.role === 'user' ? 'User' : 'Lana'}: ${t.content}`).join('\n');
    parts.push(`RECENT CONVERSATION\n${historyLines}`);
  }
  parts.push(`User: ${message}`);
  return parts.join('\n\n');
}

// ── Reply safety (mirrors nutrition-coaching's BANNED-phrase convention) ───

const BANNED_REPLY_PATTERNS = [
  /\bdeficien\w*/i, /\bmalnutr\w*/i, /\bdiagnos\w*/i,
  /\bsupplement\w*/i, /\bprotein powder\b/i, /\bmultivitamin\b/i,
  /\btdee\b/i, /\bbmr\b/i,
  /\bi'?ve (updated|changed|modified|adjusted|rescheduled|rebuilt|regenerated) your\b/i,
  /\bi'?ll (update|change|modify|adjust|reschedule|rebuild|regenerate) your\b/i,
  /\byou have (a deficiency|low levels of)\b/i,
  /\bmedical (advice|condition)\b/i, /\bsee a doctor\b/i,
];

export interface ChatReplyValidation {
  ok: boolean;
  text: string;
}

const SAFE_FALLBACK_REPLY =
  "I can't quite answer that safely right now — could you rephrase, or ask about your plan, workouts, meals, or nutrition instead?";

/**
 * Never edits the model's text (a rewritten sentence could invent its own
 * claim) — either the whole reply is clean, or it's replaced wholesale with
 * a safe, honest fallback (§7/§8/§9's hard rules must hold for the ENTIRE
 * reply, not just be probabilistically likely).
 */
export function validateChatReply(raw: unknown): ChatReplyValidation {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, text: SAFE_FALLBACK_REPLY };
  const text = raw.trim();
  if (BANNED_REPLY_PATTERNS.some(re => re.test(text))) return { ok: false, text: SAFE_FALLBACK_REPLY };
  return { ok: true, text };
}

// ── Request sanitisation ────────────────────────────────────────────────────

export function sanitiseMessage(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_MESSAGE_LENGTH);
}

export function sanitiseHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  const out: ChatTurn[] = [];
  for (const raw of input.slice(-MAX_HISTORY_TURNS * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if ((r.role !== 'user' && r.role !== 'assistant') || typeof r.content !== 'string') continue;
    out.push({ role: r.role, content: r.content.slice(0, MAX_MESSAGE_LENGTH) });
  }
  return out;
}

/** A personal-protein-range passthrough (§4/§7 — the one client-computed fact this route trusts, exactly mirroring the existing resolver's own shape; never a calorie/carb/fat number, those don't exist to send). */
export function sanitiseProteinTarget(input: unknown): { min: number; max: number } | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  if (typeof r.min !== 'number' || typeof r.max !== 'number') return null;
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min < 0 || r.max < r.min) return null;
  return { min: r.min, max: r.max };
}
