import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  NUTRITION_COACHING_MODEL, NUTRITION_COACHING_REQUEST_CONFIG, NUTRITION_COACHING_JSON_SCHEMA,
  NUTRITION_COACHING_SYSTEM_PROMPT, buildNutritionCoachingUserPrompt,
  sanitiseOpportunities, validateCoachingResponse,
} from './coaching';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../../../../lib/observability';
import { isNutritionCoachingEnabled } from '../../../../lib/flags';

// Reuse the assessment route's bounded-single-attempt convention (§25). The
// mobile client additionally races this against a short UX deadline and shows
// deterministic coaching immediately if this doesn't answer in time.
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
    const { accessToken } = body ?? {};

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isNutritionCoachingEnabled()) {
      return NextResponse.json({ error: 'Nutrition coaching is disabled' }, { status: 503 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Nutrition coaching is not configured' }, { status: 503 });
    }

    const opportunities = sanitiseOpportunities(body?.opportunities);
    if (opportunities.length === 0) {
      // Nothing eligible — the client renders no coaching section. Not an error.
      return NextResponse.json({ summary: '', opportunities: [] });
    }

    const startedAt = Date.now();
    logAcpEvent('nutrition_coaching_started', { opportunityCount: opportunities.length });

    let aiRes: Response;
    try {
      aiRes = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: NUTRITION_COACHING_MODEL,
          messages: [
            { role: 'system', content: NUTRITION_COACHING_SYSTEM_PROMPT },
            { role: 'user', content: buildNutritionCoachingUserPrompt(opportunities) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'nutrition_coaching', strict: true, schema: NUTRITION_COACHING_JSON_SCHEMA },
          },
          ...NUTRITION_COACHING_REQUEST_CONFIG,
        }),
      }, OPENAI_CHAT_TIMEOUT_MS);
    } catch (fetchErr) {
      logAcpEvent('nutrition_coaching_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(null, fetchErr),
        httpStatus: 502,
      });
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    if (!aiRes.ok) {
      logAcpEvent('nutrition_coaching_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(aiRes.status),
        httpStatus: aiRes.status,
      });
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const completion = await aiRes.json();
    const rawContent = completion.choices?.[0]?.message?.content;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      logAcpEvent('nutrition_coaching_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    const validated = validateCoachingResponse(parsed, opportunities);
    if (!validated) {
      logAcpEvent('nutrition_coaching_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'AI response failed validation' }, { status: 502 });
    }

    logAcpEvent('nutrition_coaching_completed', {
      durationMs: Date.now() - startedAt,
      model: NUTRITION_COACHING_MODEL,
      opportunityCount: opportunities.length,
      llmUsedCount: validated.opportunities.length,
      droppedCount: opportunities.length - validated.opportunities.length,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });
    return NextResponse.json(validated);
  } catch (err: unknown) {
    logAcpEvent('nutrition_coaching_failed', { failureCode: 'UNKNOWN_ERROR', httpStatus: 500 });
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
