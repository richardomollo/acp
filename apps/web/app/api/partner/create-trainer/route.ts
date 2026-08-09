import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { gymId?: string; fullName?: string; email?: string; phone?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { gymId, fullName, phone } = body;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!gymId || !fullName?.trim() || !email || !password) {
    return NextResponse.json({ error: 'gymId, fullName, email, and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  // ── Verify the caller owns this gym (same partner_gyms join as everywhere else) ──
  const { data: partner } = await admin.from('partners').select('id').eq('user_id', user.id).maybeSingle();
  const { data: link } = partner
    ? await admin.from('partner_gyms').select('gym_id').eq('partner_id', partner.id).eq('gym_id', gymId).maybeSingle()
    : { data: null };
  if (!link) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // ── Resolve or create the trainer's auth account ──────────────────────────
  let trainerUserId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });

  if (created?.user) {
    trainerUserId = created.user.id;
  } else if (createErr?.message?.toLowerCase().includes('already been registered') || createErr?.code === 'email_exists') {
    const { data: existing } = await admin.from('users').select('id').eq('email', email).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'An account with this email already exists but could not be linked.' }, { status: 409 });
    trainerUserId = existing.id;
  } else {
    return NextResponse.json({ error: createErr?.message || 'Could not create account' }, { status: 500 });
  }

  const { error: insertErr } = await admin.from('gym_trainers').insert({
    gym_id: gymId,
    user_id: trainerUserId,
    full_name: fullName.trim(),
    email,
    phone: phone?.trim() || null,
    status: 'active',
    invited_by: partner!.id,
  });

  if (insertErr) {
    const message = insertErr.code === '23505' ? 'This email is already a trainer at this gym.' : insertErr.message;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
