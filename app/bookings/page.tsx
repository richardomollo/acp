// app/bookings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  booking_date: string;
  booking_time: string;
  confirmation_code: string;
  status: string;
  credits_used: number;
  session_id: string;
  sessions?: {
    id: string;
    name: string;
    instructor: string;
    category: string;
    description: string;
    duration_minutes: number;
    gym_id: string;
  };
  gym?: {
    name: string;
    location: string;
    address: string;
  };
};

export default function BookingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentBookings, setCurrentBookings] = useState<Booking[]>([]);
  const [previousBookings, setPreviousBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      setUser(user);
      await fetchBookings(user.id);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const fetchBookings = async (userId: string) => {
    const today = new Date().toISOString().split('T')[0];

    // Fetch current bookings with session details
    const { data: current } = await supabase
      .from('bookings')
      .select(`
        *,
        sessions (
          id,
          name,
          instructor,
          category,
          description,
          duration_minutes,
          gym_id
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    // Fetch previous bookings with session details
    const { data: previous } = await supabase
      .from('bookings')
      .select(`
        *,
        sessions (
          id,
          name,
          instructor,
          category,
          description,
          duration_minutes,
          gym_id
        )
      `)
      .eq('user_id', userId)
      .or(`booking_date.lt.${today},status.eq.cancelled`)
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false })
      .limit(20);

    // Fetch gym details for all bookings
    const allBookings = [...(current || []), ...(previous || [])];
    const gymIds = [...new Set(allBookings.map(b => b.sessions?.gym_id).filter(Boolean))];
    
    const { data: gyms } = await supabase
      .from('gyms')
      .select('id, name, location, address')
      .in('id', gymIds);

    const gymsMap = new Map(gyms?.map(g => [g.id, g]) || []);

    // Attach gym details to bookings
    const currentWithGyms = current?.map(booking => ({
      ...booking,
      gym: booking.sessions?.gym_id ? gymsMap.get(booking.sessions.gym_id) : undefined
    })) || [];

    const previousWithGyms = previous?.map(booking => ({
      ...booking,
      gym: booking.sessions?.gym_id ? gymsMap.get(booking.sessions.gym_id) : undefined
    })) || [];

    setCurrentBookings(currentWithGyms);
    setPreviousBookings(previousWithGyms);
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    const { error } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      alert('Failed to cancel booking');
    } else {
      alert('Booking cancelled successfully');
      if (user) {
        await fetchBookings(user.id);
      }
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-center text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-semibold mb-8">My Bookings</h1>

      {/* Current Bookings */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Current Bookings</h2>
        {currentBookings.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-lg text-center">
            <p className="text-gray-500 mb-4">No upcoming bookings</p>
            <Link href="/sessions" className="text-indigo-600 hover:text-indigo-700 underline">
              Browse sessions
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {currentBookings.map((booking) => (
              <div key={booking.id} className="bg-white border border-gray-200 p-6 rounded-lg shadow-sm hover:shadow-md transition">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    {booking.sessions ? (
                      <>
                        <h3 className="text-xl font-semibold text-gray-800 mb-1">
                          {booking.sessions.name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          <span className="inline-block mr-4">
                            👤 Instructor: {booking.sessions.instructor}
                          </span>
                          <span className="inline-block">
                            ⏱️ {booking.sessions.duration_minutes} minutes
                          </span>
                        </p>
                        {booking.gym && (
                          <p className="text-sm text-gray-600 mb-1">
                            📍 {booking.gym.name}
                          </p>
                        )}
                        {booking.gym?.location && (
                          <p className="text-sm text-gray-500">
                            📌 {booking.gym.location}
                          </p>
                        )}
                        {booking.sessions.category && (
                          <p className="text-xs text-gray-500 mt-2 inline-block px-2 py-1 bg-gray-100 rounded">
                            {booking.sessions.category}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500">Session details unavailable</p>
                    )}
                    
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-lg font-semibold text-gray-800">
                        📅 {new Date(booking.booking_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-gray-600">
                        🕒 Time: {booking.booking_time.substring(0, 5)}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Credits used: {booking.credits_used}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right ml-6">
                    <p className="text-sm text-gray-500 mb-1">Confirmation Code</p>
                    <p className="text-2xl font-mono font-bold text-indigo-600">
                      {booking.confirmation_code}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => handleCancelBooking(booking.id)}
                  className="text-sm text-red-600 hover:text-red-700 transition underline"
                >
                  Cancel Booking
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Previous Bookings */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Previous Bookings</h2>
        {previousBookings.length === 0 ? (
          <div className="bg-gray-50 p-8 rounded-lg text-center">
            <p className="text-gray-500">No previous bookings</p>
          </div>
        ) : (
          <div className="space-y-3">
            {previousBookings.map((booking) => (
              <div key={booking.id} className="bg-gray-50 border border-gray-100 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {booking.sessions ? (
                      <>
                        <p className="font-semibold text-gray-700">{booking.sessions.name}</p>
                        <p className="text-sm text-gray-600">
                          Instructor: {booking.sessions.instructor}
                          {booking.gym && ` • ${booking.gym.name}`}
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-500 text-sm">Session details unavailable</p>
                    )}
                    <p className="font-medium text-gray-700 mt-2">
                      {new Date(booking.booking_date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })} at {booking.booking_time.substring(0, 5)}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <span className={`text-xs px-3 py-1 rounded-full ${
                      booking.status === 'cancelled' 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {booking.status}
                    </span>
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      {booking.confirmation_code}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}