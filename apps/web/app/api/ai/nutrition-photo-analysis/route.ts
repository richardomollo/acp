import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  NUTRITION_PHOTO_MODEL, NUTRITION_PHOTO_REQUEST_CONFIG, NUTRITION_PHOTO_JSON_SCHEMA,
  NUTRITION_PHOTO_SYSTEM_PROMPT, NUTRITION_PHOTO_USER_PROMPT,
  validateImageInput, parseVisionAnalysis,
} from './photo-analysis';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../../../../lib/observability';
import { isNutritionCameraEnabled } from '../../../../lib/flags';

// Nutrition N5 — the camera INPUT ASSISTANT (§2/§38). This endpoint turns one
// photo into a short list of textual food candidate labels. It does NOT search
// the nutrient database, calculate nutrients, log foods, coach, or persist the
// image. The photo is held only for this request and discarded when it returns
// (§10/§32). Base64 body only — no client-supplied URLs, so no SSRF (§39).
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
    const { accessToken, imageBase64, mimeType } = body ?? {};

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isNutritionCameraEnabled()) {
      return NextResponse.json({ error: 'Camera logging is disabled' }, { status: 503 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Camera logging is not configured' }, { status: 503 });
    }

    // §39 — image type + size, base64 body only. No `imageUrl` field is read.
    const image = validateImageInput(imageBase64, mimeType);
    if (!image.ok) {
      return NextResponse.json({ error: image.error }, { status: image.status });
    }
    const base64Body = (imageBase64 as string).replace(/^data:[^,]*,/, '').replace(/\s/g, '');

    const startedAt = Date.now();
    logAcpEvent('nutrition_camera_started', {});

    let aiRes: Response;
    try {
      aiRes = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: NUTRITION_PHOTO_MODEL,
          messages: [
            { role: 'system', content: NUTRITION_PHOTO_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: NUTRITION_PHOTO_USER_PROMPT },
                {
                  type: 'image_url',
                  image_url: { url: `data:${image.mimeType};base64,${base64Body}`, detail: 'low' },
                },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'nutrition_photo_analysis', strict: true, schema: NUTRITION_PHOTO_JSON_SCHEMA },
          },
          ...NUTRITION_PHOTO_REQUEST_CONFIG,
        }),
      }, OPENAI_CHAT_TIMEOUT_MS);
    } catch (fetchErr) {
      logAcpEvent('nutrition_camera_analysis_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(null, fetchErr),
        httpStatus: 502,
      });
      return NextResponse.json({ error: 'Photo analysis failed' }, { status: 502 });
    }

    if (!aiRes.ok) {
      logAcpEvent('nutrition_camera_analysis_failed', {
        durationMs: Date.now() - startedAt,
        failureCode: classifyOpenAiFailure(aiRes.status),
        httpStatus: aiRes.status,
      });
      return NextResponse.json({ error: 'Photo analysis failed' }, { status: 502 });
    }

    const completion = await aiRes.json();
    const rawContent = completion.choices?.[0]?.message?.content;
    const validated = parseVisionAnalysis(rawContent);
    if (!validated) {
      logAcpEvent('nutrition_camera_analysis_failed', { failureCode: 'OPENAI_INVALID_RESPONSE', httpStatus: 502 });
      return NextResponse.json({ error: 'Photo analysis returned an unusable result' }, { status: 502 });
    }

    logAcpEvent('nutrition_camera_analysis_completed', {
      durationMs: Date.now() - startedAt,
      model: NUTRITION_PHOTO_MODEL,
      candidateCount: validated.foods.length,
      uncertain: validated.uncertain,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });
    // Candidate LABELS only — no calories, macros, micronutrients, portions,
    // judgement or coaching (§6). The client matches these to canonical foods.
    return NextResponse.json({ foods: validated.foods, uncertain: validated.uncertain });
  } catch (err: unknown) {
    logAcpEvent('nutrition_camera_analysis_failed', { failureCode: 'UNKNOWN_ERROR', httpStatus: 500 });
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
