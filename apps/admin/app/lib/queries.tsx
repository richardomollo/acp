import { supabase } from './supabase';

export async function getPendingNegotiations() {
  const { data, error } = await supabase
    .from('rate_floor_negotiations')
    .select(`
      *,
      gyms (
        name,
        drop_in_price,
        location
      ),
      partners (
        name,
        email
      )
    `)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function approveNegotiation(id: string) {
  const { error: updateError } = await supabase
    .from('rate_floor_negotiations')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .eq('id', id);

  if (updateError) throw updateError;

  // Get the negotiation to update gym
  const { data: negotiation } = await supabase
    .from('rate_floor_negotiations')
    .select('gym_id, proposed_amount, proposed_percentage')
    .eq('id', id)
    .single();

  if (negotiation) {
    await supabase
      .from('gyms')
      .update({
        rate_floor: negotiation.proposed_amount,
        rate_floor_percentage: negotiation.proposed_percentage,
      })
      .eq('id', negotiation.gym_id);
  }
}

export async function rejectNegotiation(id: string, reason: string) {
  const { error } = await supabase
    .from('rate_floor_negotiations')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id,
    })
    .eq('id', id);

  if (error) throw error;
}