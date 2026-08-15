import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { experienceId, name, email, phone } = body;

    if (!experienceId || !email) {
      return NextResponse.json({ error: 'experienceId and email are required.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/guest-book-experience`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey!,
      },
      body: JSON.stringify({ experienceId, name, email, phone, platform: 'web' }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create booking.' },
      { status: 500 }
    );
  }
}
