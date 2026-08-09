// Unified Pesapal initiation route, now forwarded to Supabase edge booking checkout.
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[api/pesapal/initiate] POST', {
      type: body?.type,
      hasSessionId: !!body?.sessionId,
      hasExperienceId: !!body?.experienceId,
      hasPtMeta: !!body?.ptMeta,
      paymentMethod: body?.paymentMethod,
    });
    if (body?.type === 'pt' || body?.ptMeta) {
      return NextResponse.json({ error: 'PT PesaPal flow is not centralized yet.' }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authHeader = req.headers.get('authorization') ?? `Bearer ${anonKey}`;

    const res = await fetch(`${supabaseUrl}/functions/v1/checkout-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: anonKey!,
      },
      body: JSON.stringify({
        ...body,
        paymentMethod: 'pesapal',
        type: body?.type ?? (body?.sessionId ? 'session' : body?.experienceId ? 'experience' : body?.ptMeta ? 'pt' : undefined),
        itemId: body?.sessionId ?? body?.experienceId ?? body?.itemId,
        name: body?.firstName ?? body?.name,
        email: body?.email,
        phone: body?.phone,
        userId: body?.userId,
      }),
    });

    const data = await res.json();
    console.log('[api/pesapal/initiate] edge response', { status: res.status, ok: res.ok });
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[api/pesapal/initiate] error', err);
    console.error('pesapal/initiate error:', err);
    return NextResponse.json({ error: err.message ?? 'Payment initiation failed' }, { status: 500 });
  }
}
