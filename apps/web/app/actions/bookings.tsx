'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Helper function to generate confirmation code
function generateConfirmationCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

// Create Supabase client with service role (only for server actions)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function bookSession(
  sessionId: string, 
  userId: string,
  creditsToUse: number = 1
) {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Get session details
    console.log('Looking for session with ID:', sessionId);
    
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    console.log('Session query result:', { session, sessionError });

    if (sessionError || !session) {
      return { 
        success: false, 
        error: `Session not found: ${sessionError?.message || 'Unknown error'}` 
      }
    }

    if (session.spots_left <= 0) {
      return { 
        success: false, 
        error: 'No spots available' 
      }
    }

    // Extract date and time from session
    const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0]
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0]

    // 2. Check if user already booked this session
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
      return { 
        success: false, 
        error: 'You have already booked this session' 
      }
    }

    // 3. Create booking
    const confirmationCode = generateConfirmationCode()
    
    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        session_id: sessionId,  // Add session_id
        user_id: userId,
        gym_id: session.gym_id,
        booking_date: sessionDate,
        booking_time: sessionTime,
        credits_used: creditsToUse,
        status: 'confirmed',
        confirmation_code: confirmationCode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (bookingError) {
      console.error('Booking insert error:', bookingError)
      return { 
        success: false, 
        error: bookingError.message 
      }
    }

    // 4. Decrease spots_left
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ 
        spots_left: session.spots_left - 1 
      })
      .eq('id', sessionId)

    if (updateError) {
      // Rollback: delete the booking if update fails
      await supabase
        .from('bookings')
        .delete()
        .eq('user_id', userId)
        .eq('confirmation_code', confirmationCode)

      return { 
        success: false, 
        error: 'Failed to update session capacity' 
      }
    }

    // Revalidate pages
    revalidatePath('/sessions')
    revalidatePath('/users/dashboard')

    return { 
      success: true, 
      message: 'Session booked successfully!',
      confirmationCode
    }

  } catch (error) {
    console.error('Booking error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }
  }
}

export async function cancelBooking(bookingId: string, userId: string) {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Get booking details
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*, gym_id, booking_date, booking_time')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !booking) {
      return { 
        success: false, 
        error: 'Booking not found' 
      }
    }

    // 2. Update booking status to cancelled
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)

    if (updateError) {
      return { 
        success: false, 
        error: updateError.message 
      }
    }

    // 3. Find the session and increase spots_left
    const { data: session } = await supabase
      .from('sessions')
      .select('id, spots_left')
      .eq('gym_id', booking.gym_id)
      .eq('date', booking.booking_date)
      .single()

    if (session) {
      await supabase
        .from('sessions')
        .update({ 
          spots_left: session.spots_left + 1 
        })
        .eq('id', session.id)
    }

    revalidatePath('/sessions')
    revalidatePath('/users/dashboard')

    return { 
      success: true, 
      message: 'Booking cancelled successfully' 
    }

  } catch (error) {
    console.error('Cancel error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to cancel booking'
    }
  }
}