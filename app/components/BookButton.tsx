// app/components/BookButton.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { bookSessionWithCredits } from "../../app/actions/credit-bookings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type BookButtonProps = {
  session: {
    id: string;
    spots_left: number;
    gym_id: string;
    start_time?: string;
    date?: string;
    time?: string;
  };
  isBooked?: boolean;
};

export default function BookButton({ 
  session, 
  isBooked: initialIsBooked = false,
}: BookButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isBooked, setIsBooked] = useState(initialIsBooked);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Client-side user check:', user);
      setUser(user);
      
      // Check if user has booked this session
      if (user) {
        const sessionDate = session.date || (session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : '');
        const sessionTime = session.time || (session.start_time ? new Date(session.start_time).toTimeString().split(' ')[0] : '');

        const { data: existingBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('user_id', user.id)
          .eq('gym_id', session.gym_id)
          .eq('booking_date', sessionDate)
          .eq('booking_time', sessionTime)
          .eq('status', 'confirmed')
          .maybeSingle();

        setIsBooked(!!existingBooking);
      }
      
      setCheckingAuth(false);
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [session.gym_id, session.date, session.time, session.start_time]);

  const handleBooking = async () => {
    if (!user || !user.id) {
      console.log('No user found, redirecting to login');
      router.push("/login");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await bookSessionWithCredits(session.id, user.id);

    setLoading(false);

    if (result.success) {
      setIsBooked(true);
      alert(`${result.message}\nConfirmation: ${result.confirmationCode}\nCredits remaining: ${result.creditsRemaining}`);
      router.refresh();
    } else {
      setError(result.error || "Booking failed");
      
      if (result.needsUpgrade) {
        const upgrade = confirm(`${result.error}\n\nWould you like to view subscription plans?`);
        if (upgrade) {
          router.push('/subscriptions');
        }
      } else {
        alert(result.error);
      }
    }
  };

  if (checkingAuth) {
    return (
      <div className="mt-4">
        <button
          disabled
          className="px-4 py-2 text-sm rounded bg-gray-200 text-gray-500 cursor-not-allowed"
        >
          Loading...
        </button>
      </div>
    );
  }

  const isDisabled = session.spots_left === 0 || loading || isBooked;

  return (
    <div className="mt-4">
      <button
        disabled={isDisabled}
        onClick={handleBooking}
        className="px-4 py-2 text-sm rounded bg-black text-white disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-gray-800 transition mb-2"
      >
        {loading
          ? "Booking..."
          : isBooked
          ? "Already Booked"
          : session.spots_left > 0
          ? `Book (${session.spots_left} spots left)`
          : "Full"}
      </button>
      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
      {!user && (
        <p className="text-gray-500 text-xs mt-1">
          Please <button onClick={() => router.push('/login')} className="underline">log in</button> to book
        </p>
      )}
    </div>
  );
}