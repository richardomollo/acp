// app/sessions/[id]/page.tsx
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import BookButton from "../../components/BookButton";

// Create a server-side Supabase client that can access cookies
async function createServerClient() {
  const cookieStore = await cookies();
  
  return createClient(
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
}

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;

  if (!id) return <p>Session ID is missing</p>;

  const supabase = await createServerClient();

  // Fetch the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch session details
  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !session) return <p>Session not found</p>;

  // Check if user has already booked this session
  let isBooked = false;
  if (user) {
    const sessionDate = session.date || new Date(session.start_time).toISOString().split('T')[0];
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(' ')[0];

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id)
      .eq('gym_id', session.gym_id)
      .eq('booking_date', sessionDate)
      .eq('booking_time', sessionTime)
      .eq('status', 'confirmed')
      .maybeSingle();

    isBooked = !!existingBooking;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link 
        href={`/venues/${session.gym_id}`} 
        className="text-sm text-gray-500 hover:underline mb-6 inline-block"
      >
        ← Back to venue
      </Link>
      
      <h2 className="text-3xl font-semibold">
        {session.name} - {session.category}, {session.duration_minutes} min
      </h2>
      
      <p className="mb-2 text-gray-500 hover:underline text-sm">
        {session.category} · instructor {session.instructor} {session.level}
      </p>
      
      {session.image_url && (
        <img
          src={session.image_url}
          alt={session.name}
          className="w-full h-64 object-cover rounded-lg"
        />
      )}
      
      <p className="mt-4 text-sm font-semibold mb-2">{session.description}</p>
      
      <p className="text-sm text-gray-500 mb-2">
      {new Date(session.date).toLocaleDateString()} · {session.time}
      </p>
{/* 
      <BookButton 
        session={session} 
        user={user} 
        isBooked={isBooked}
      /> */}

      <BookButton 
       session={session} 
      />
    </div>
  );
}