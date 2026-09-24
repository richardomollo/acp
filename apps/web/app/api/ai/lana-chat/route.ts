import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthorization } from '../onboarding-assessment/assessment';
import {
  LANA_CHAT_MODEL, LANA_CHAT_REQUEST_CONFIG, LANA_CHAT_SYSTEM_PROMPT,
  classifyLanaChatIntent, selectContextForIntent, buildLanaChatUserPrompt, validateChatReply,
  sanitiseMessage, sanitiseHistory, sanitiseProteinTarget,
} from './chat';
import { buildLanaChatContext } from './context';
import { retrieveKnowledge } from '../../../../lib/knowledge/retrieval';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../../../../lib/observability';
import { isLanaChatEnabled } from '../../../../lib/flags';

// §16 — a chat reply should feel conversational; bounded well under the
// platform ceiling so a hung request fails fast into a clear UI error
// rather than holding the connection open (same convention as the other
// ACP OpenAI routes).
const OPENAI_CHAT_TIMEOUT_MS = 20_000;
export const maxDuration = 30;

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, accessToken, message: rawMessage, conversationHistory, proteinTargetG: rawProteinTarget } = body ?? {};

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // §K — a client can never fetch or influence another user's context:
    // every downstream read is keyed ONLY to `user.id` from the verified
    // token, never to the request body's own `userId`. This check exists
    // purely to reject an obviously-mismatched request early with a clear
    // error, not to select whose data gets read.
    const authResult = checkAuthorization(user, userId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!isLanaChatEnabled()) {
      return NextResponse.json({ error: 'Lana Chat is disabled' }, { status: 503 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Lana Chat is not configured' }, { status: 503 });
    }

    const message = sanitiseMessage(rawMessage);
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const history = sanitiseHistory(conversationHistory);
    const proteinTargetG = sanitiseProteinTarget(rawProteinTarget);

    const intent = classifyLanaChatIntent(message);
    const startedAt = Date.now();
    logAcpEvent('lana_chat_message_sent', { intent, messageLength: message.length });

    // user.id — the VERIFIED token's own id, never the request body's
    // userId — is the only key used to build context (§K).
    const fullContext = await buildLanaChatContext(user!.id, proteinTargetG, {});
    const trimmedContext = selectContextForIntent(intent, fullContext);

    // §11 — general-knowledge questions only: stable Lana-controlled
    // knowledge via the EXISTING RAG service, never personal evidence.
    // A RAG outage never fails the chat — an empty knowledge block is
    // handled identically to "nothing relevant found" (mirrors weekly-
    // adaptation's own RAG-failure tolerance).
    let knowledgeContext = '';
    if (intent === 'general') {
      const knowledge = await retrieveKnowledge({ query: message, topK: 3 }).catch(() => null);
      if (knowledge?.ok && knowledge.results.length > 0) {
        knowledgeContext = `RELEVANT LANA KNOWLEDGE\n\n${knowledge.results.map(r => r.content).join('\n\n')}`;
      }
    }

    const userPrompt = buildLanaChatUserPrompt(message, trimmedContext, history, knowledgeContext);

    let aiRes: Response;
    try {
      aiRes = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: LANA_CHAT_MODEL,
          messages: [
            { role: 'system', content: LANA_CHAT_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          ...LANA_CHAT_REQUEST_CONFIG,
        }),
      }, OPENAI_CHAT_TIMEOUT_MS);
    } catch (fetchErr) {
      logAcpEvent('lana_chat_failed', {
        durationMs: Date.now() - startedAt, intent,
        failureCode: classifyOpenAiFailure(null, fetchErr), httpStatus: 502,
      });
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    if (!aiRes.ok) {
      logAcpEvent('lana_chat_failed', {
        durationMs: Date.now() - startedAt, intent,
        failureCode: classifyOpenAiFailure(aiRes.status), httpStatus: aiRes.status,
      });
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const completion = await aiRes.json();
    const rawReply = completion.choices?.[0]?.message?.content;
    const validated = validateChatReply(rawReply);

    logAcpEvent('lana_chat_response_received', {
      durationMs: Date.now() - startedAt, intent, model: LANA_CHAT_MODEL,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });
    return NextResponse.json({ reply: validated.text, intent });
  } catch (err: unknown) {
    logAcpEvent('lana_chat_failed', { failureCode: 'UNKNOWN_ERROR', httpStatus: 500 });
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
