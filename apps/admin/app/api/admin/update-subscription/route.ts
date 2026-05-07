import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { userId, tier, credits, status, note, accessToken } = await req.json();

    if (!userId || !tier || !accessToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify caller is an authenticated admin
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch current user to calculate credit diff
    const { data: currentUser, error: userError } = await adminSupabase
      .from('users')
      .select('credits, subscription_tier, subscription_status')
      .eq('id', userId)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const newCredits = credits ?? currentUser.credits;
    const creditDiff = newCredits - currentUser.credits;
    const now = new Date().toISOString();
    const durationDays = tier === 'free_trial' ? 14 : 30;
    const endDate = new Date(Date.now() + durationDays * 86400000).toISOString();

    // Update users table
    const { error: updateError } = await adminSupabase
      .from('users')
      .update({
        subscription_tier: tier,
        subscription_status: status,
        credits: newCredits,
        updated_at: now,
      })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Deactivate old subscriptions
    await adminSupabase
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: now })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Create new subscription record
    const { error: subError } = await adminSupabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        tier,
        credits_allocated: newCredits,
        credits_used: 0,
        price: 0,
        start_date: now,
        end_date: endDate,
        status: status === 'cancelled' ? 'cancelled' : 'active',
        auto_renew: false,
        created_at: now,
        updated_at: now,
      });

    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    // Log credit transaction if credits changed
    if (creditDiff !== 0) {
      await adminSupabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          transaction_type: creditDiff > 0 ? 'credit' : 'debit',
          credits: Math.abs(creditDiff),
          balance_after: newCredits,
          description: note || `Admin subscription change to ${tier}`,
          created_at: now,
        });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
