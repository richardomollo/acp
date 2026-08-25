import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  AI_ASSESSMENT_MODEL, ASSESSMENT_JSON_SCHEMA, SYSTEM_PROMPT,
  buildUserPrompt, validateAssessment, checkAuthorization,
} from './assessment';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { userId, onboardingAnswers, accessToken } = await req.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!onboardingAnswers || typeof onboardingAnswers !== 'object') {
      return NextResponse.json({ error: 'Missing onboardingAnswers' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authResult = checkAuthorization(user, userId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI assessment is not configured' }, { status: 503 });
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_ASSESSMENT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(onboardingAnswers) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ai_assessment',
            strict: true,
            schema: ASSESSMENT_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('onboarding-assessment: OpenAI request failed', aiRes.status, errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
    }

    const completion = await aiRes.json();
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
    }

    let assessment: unknown;
    try {
      assessment = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    if (!validateAssessment(assessment)) {
      console.error('onboarding-assessment: response failed validation', raw);
      return NextResponse.json({ error: 'AI response failed validation' }, { status: 502 });
    }

    const generatedAt = new Date().toISOString();
    // upsert, not update: this route is only ever called after
    // completeOnboarding() has already written the fitness_profile row, but
    // update() silently no-ops (no error, no rows affected) if that row
    // were ever missing — upsert closes that silent-failure edge case.
    const { error: saveError } = await adminSupabase
      .from('fitness_profile')
      .upsert({ user_id: userId, ai_assessment: assessment, ai_assessment_generated_at: generatedAt }, { onConflict: 'user_id' });

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ assessment, generatedAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
