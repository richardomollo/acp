// app/api/cancel-booking/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: {
          getItem: async (key: string) => {
            return cookieStore.get(key)?.value ?? null;
          },
          setItem: async (key: string, value: string) => {
            cookieStore.set(key, value);
          },
          removeItem: async (key: string) => {
            cookieStore.delete(key);
          },
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const formData = await request.formData();
  const bookingId = formData.get('booking_id') as string;

  // Update booking status
  const { error } = await supabase
    .from('bookings')
    .update({ 
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .eq('user_id', user.id); // Ensure user can only cancel their own bookings

  if (error) {
    console.error('Cancel error:', error);
  }

  return NextResponse.redirect(new URL('/bookings', request.url));
}