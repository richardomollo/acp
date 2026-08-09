import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());

async function requireAdmin(token: string | null) {
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user?.email) return null;
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) return null;
  return user;
}

// GET /api/admin/refunds — list all pending/processing refunds
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
  const adminUser = await requireAdmin(token);
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status'); // optional filter

  let query = admin
    .from('refund_transactions')
    .select(`
      *,
      bookings!left(
        id, status, cancelled_by, booking_date, booking_time, deposit_amount,
        user_id, guest_email,
        sessions!left(name, date, time),
        gyms!left(name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ refunds: data ?? [] });
}

// PATCH /api/admin/refunds — update a refund record (mark completed/failed)
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
  const adminUser = await requireAdmin(token);
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: {
    refundId?: string;
    status?: string;
    providerReference?: string;
    notes?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { refundId, status, providerReference, notes } = body;
  if (!refundId) return NextResponse.json({ error: 'refundId required' }, { status: 400 });

  const validStatuses = ['pending', 'processing', 'completed', 'failed'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    processed_by: adminUser.email,
  };
  if (status) updatePayload.status = status;
  if (providerReference) updatePayload.provider_reference = providerReference;
  if (notes) updatePayload.notes = notes;
  if (status === 'completed') updatePayload.completed_at = now;

  const { data, error } = await admin
    .from('refund_transactions')
    .update(updatePayload)
    .eq('id', refundId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // When a refund is marked completed, also update the booking refund_status
  if (status === 'completed' && data?.booking_id) {
    await admin
      .from('bookings')
      .update({ refund_status: 'completed' })
      .eq('id', data.booking_id);
  }

  return NextResponse.json({ success: true, refund: data });
}
