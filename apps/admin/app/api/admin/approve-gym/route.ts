import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { gymId, action, accessToken } = await req.json();

    if (!gymId || !action || !accessToken) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'approve' || action === 'activate') {
      const { error } = await adminSupabase
        .from('gyms')
        .update({ is_active: true })
        .eq('id', gymId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'deactivate') {
      const { error } = await adminSupabase
        .from('gyms')
        .update({ is_active: false })
        .eq('id', gymId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'reject') {
      const { error } = await adminSupabase
        .from('gyms')
        .delete()
        .eq('id', gymId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
