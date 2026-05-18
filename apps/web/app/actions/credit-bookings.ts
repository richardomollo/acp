// ============================================
// FILE: app/actions/credit-bookings.ts
// Booking actions with credit system
// ============================================
'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

import { walletService } from '@/app/lib/wallet/service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

export async function bookSessionWithCredits(
  sessionId: string, 
  userId: string
) {
  try {
    // 1. Get session details
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, gyms(id, name)')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Session not found' }
    }

    if (session.spots_left <= 0) {
      return { success: false, error: 'No spots available' }
    }

    // 2. Get user profile and check credits
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return { success: false, error: 'User not found' }
    }

    // 3. Check if user has enough credits
    const creditsRequired = session.credits_required || 1
    if (user.credits < creditsRequired) {
      return { 
        success: false, 
        error: `Insufficient credits. You need ${creditsRequired} credits but have ${user.credits}.`,
        needsUpgrade: true
      }
    }

    // 4. Check trial restrictions
    if (user.subscription_tier === 'free_trial') {
      // Check if user already visited this gym during trial
      const { data: existingVisit } = await supabase
        .from('trial_gym_visits')
        .select('id')
        .eq('user_id', userId)
        .eq('gym_id', session.gym_id)
        .single()

      if (existingVisit) {
        return { 
          success: false, 
          error: 'Trial users can only visit each gym once. Upgrade to book again!',
          needsUpgrade: true
        }
      }

      // Check if trial has expired
      if (new Date(user.trial_end_date) < new Date()) {
        return { 
          success: false, 
          error: 'Your trial has expired. Please upgrade to continue.',
          needsUpgrade: true
        }
      }
    }

    // 5. Check for existing booking
    const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0]
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0]

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('gym_id', session.gym_id)
      .eq('booking_date', sessionDate)
      .eq('booking_time', sessionTime)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existingBooking) {
      return { success: false, error: 'You have already booked this session' }
    }

    // 6. Create booking
    const confirmationCode = generateConfirmationCode()
    
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id: sessionId,
        user_id: userId,
        gym_id: session.gym_id,
        booking_date: sessionDate,
        booking_time: sessionTime,
        credits_used: creditsRequired,
        status: 'confirmed',
        confirmation_code: confirmationCode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Booking insert error:', bookingError)
      return { success: false, error: bookingError.message }
    }

    // 7. Deduct credits from user
    const { error: creditError } = await supabase
      .from('users')
      .update({ 
        credits: user.credits - creditsRequired,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (creditError) {
      // Rollback booking
      await supabase.from('bookings').delete().eq('id', booking.id)
      return { success: false, error: 'Failed to deduct credits' }
    }

    // 8. Log credit transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        booking_id: booking.id,
        transaction_type: 'debit',
        credits: -creditsRequired,
        balance_after: user.credits - creditsRequired,
        description: `Booked ${session.name} at ${session.gyms?.name || 'gym'}`
      })

    // 9. Record trial gym visit if applicable
    if (user.subscription_tier === 'free_trial') {
      await supabase
        .from('trial_gym_visits')
        .insert({
          user_id: userId,
          gym_id: session.gym_id
        })
    }

    // 10. Decrease spots_left
    await supabase
      .from('sessions')
      .update({ spots_left: session.spots_left - 1 })
      .eq('id', sessionId)

    // 11. Create gym payout record
    await supabase
      .from('gym_payouts')
      .insert({
        gym_id: session.gym_id,
        booking_id: booking.id,
        session_id: sessionId,
        user_id: userId,
        amount: 400.00,
        status: 'pending'
      })

    revalidatePath('/sessions')
    revalidatePath('/bookings')
    revalidatePath('/users/dashboard')

    return { 
      success: true, 
      message: 'Session booked successfully!',
      confirmationCode,
      creditsRemaining: user.credits - creditsRequired
    }

  } catch (error) {
    console.error('Booking error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }
  }
}

export async function cancelBookingWithRefund(bookingId: string, userId: string) {
  try {
    // 1. Get booking details
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !booking) {
      return { success: false, error: 'Booking not found' }
    }

    // 2. Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return { success: false, error: 'Booking already cancelled' }
    }

    // 3. Get user details
    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('id', userId)
      .single()

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // 4. Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // 5. Refund credits (only if not trial expired)
    const creditsToRefund = booking.credits_used || 1
    
    await supabase
      .from('users')
      .update({ 
        credits: user.credits + creditsToRefund,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    // 6. Log refund transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        booking_id: bookingId,
        transaction_type: 'refund',
        credits: creditsToRefund,
        balance_after: user.credits + creditsToRefund,
        description: 'Booking cancelled - credits refunded'
      })

    // 7. Increase spots_left
    const { data: session } = await supabase
      .from('sessions')
      .select('id, spots_left')
      .eq('id', booking.session_id)
      .single()

    if (session) {
      await supabase
        .from('sessions')
        .update({ spots_left: session.spots_left + 1 })
        .eq('id', session.id)
    }

    // 8. Cancel gym payout
    await supabase
      .from('gym_payouts')
      .update({ status: 'cancelled' })
      .eq('booking_id', bookingId)

    revalidatePath('/sessions')
    revalidatePath('/bookings')

    return { 
      success: true, 
      message: `Booking cancelled. ${creditsToRefund} credit(s) refunded.`
    }

  } catch (error) {
    console.error('Cancel error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cancel booking'
    }
  }
}

export async function purchaseCredits(userId: string, tier: string) {
  try {
    // 1. Get subscription plan
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return { success: false, error: 'Subscription plan not found' }
    }

    // 2. Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return { success: false, error: 'User not found' }
    }

    if (!user.email) {
      return { success: false, error: 'User email is required to charge the wallet.' }
    }

    const walletSummary = await walletService.getWalletSummaryIfExistsByEmail(user.email)

    if (!walletSummary) {
      return {
        success: false,
        error: 'No wallet found. Top up your wallet first before buying a plan.',
        needsTopup: true,
      }
    }

    const availableBalance = Number(walletSummary.balance.balance)
    const planPrice = Number(plan.price)

    if (!Number.isFinite(availableBalance) || availableBalance < planPrice) {
      return {
        success: false,
        error: `Insufficient wallet balance. You need KES ${planPrice.toLocaleString()} but have KES ${Number.isFinite(availableBalance) ? availableBalance.toLocaleString() : '0'}.`,
        needsTopup: true,
      }
    }

    const paymentReference = `PLAN-${tier.toUpperCase()}-${userId.slice(0, 8)}-${Date.now()}`

    const paymentResult = await walletService.payWallet({
      walletId: walletSummary.wallet.walletId,
      amount: plan.price,
      description: `Purchase ${plan.name} plan`,
      reference: paymentReference,
    })

    if (paymentResult.success !== true) {
      return {
        success: false,
        error: paymentResult.message || 'Wallet payment did not complete successfully.',
      }
    }

    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + plan.duration_days)

    // 3. Create subscription record
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        tier: tier,
        credits_allocated: plan.credits,
        credits_used: 0,
        price: plan.price,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active'
      })

    if (subError) {
      return { success: false, error: subError.message }
    }

    // 4. Add credits to user
    const newCredits = user.credits + plan.credits
    
    const { error: creditError } = await supabase
      .from('users')
      .update({ 
        credits: newCredits,
        subscription_tier: tier,
        subscription_status: 'active',
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (creditError) {
      return { success: false, error: creditError.message }
    }

    // 5. Log transaction
    await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'credit',
        credits: plan.credits,
        balance_after: newCredits,
        description: `Wallet purchase ${paymentReference} - ${plan.name} - ${plan.credits} credits`
      })

    revalidatePath('/subscriptions')
    revalidatePath('/users/dashboard')

      return { 
        success: true, 
        message: `Successfully purchased ${plan.name}! ${plan.credits} credits added.`,
        creditsAdded: plan.credits,
        totalCredits: newCredits,
        paymentReference,
        transactionId: paymentResult.transactionId,
        walletBalance: paymentResult.balance,
      }

  } catch (error) {
    console.error('Purchase error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to purchase credits'
    }
  }
}
