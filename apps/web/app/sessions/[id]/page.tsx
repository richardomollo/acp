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

  // Fetch session details with gym information
  const { data: session, error } = await supabase
    .from("sessions")
    .select(`
      *,
      gyms!gym_id (
        id,
        name,
        location,
        area,
        type,
        description,
        contact_email,
        contact_phone,
        image_url
      )
    `)
    .eq("id", id)
    .single();

  if (error || !session) {
    console.error("Error fetching session:", error);
    return notFound();
  }

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
    <div className="max-w-4h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12 ">
      <Link 
        href={`/venues/${session.gym_id}`} 
        className="text-sm text-blue-600 hover:text-blue-800 hover:underline mb-6 inline-flex items-center"
      >
        <svg
          className="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to venue
      </Link>
      
      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2">
          <h1 className="text-3xl font-bold mb-2">
            {session.name}
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {session.category}
            </span>
            {session.level && (
              <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                {session.level}
              </span>
            )}
          </div>
          
          {session.image_url && (
            <img
              src={session.image_url}
              alt={session.name}
              className="w-full h-80 object-cover rounded-xl mb-6 shadow-md"
            />
          )}

          {/* Description */}
          {session.description && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">About this session</h2>
              <p className="text-gray-700 leading-relaxed">{session.description}</p>
            </div>
          )}

          {/* Session Details */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Session Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {session.instructor && (
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 mr-3 mt-0.5 text-gray-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">Instructor</p>
                    <p className="font-medium">{session.instructor}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start">
                <svg
                  className="w-5 h-5 mr-3 mt-0.5 text-gray-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">
                    {new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <svg
                  className="w-5 h-5 mr-3 mt-0.5 text-gray-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium">{session.time}</p>
                </div>
              </div>

              {session.duration_minutes && (
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 mr-3 mt-0.5 text-gray-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="font-medium">{session.duration_minutes} minutes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1">
          {/* Location Card */}
          {session.gyms && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 sticky top-6">
              <h3 className="font-semibold text-lg mb-2 flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
               {session.gyms.name}
              </h3>
{/* 
              {session.gyms.image_url && (
                <img
                  src={session.gyms.image_url}
                  alt={session.gyms.name}
                  className="w-full h-32 object-cover rounded-lg mb-4"
                />
              )} */}

              <div className="space-y-2">
                <div>
                  {/* <p className="font-semibold text-gray-900">{session.gyms.name}</p> */}
                  <p className="text-sm text-gray-600 mt-1">{session.gyms.location}</p>
                  {session.gyms.area && (
                    <p className="text-sm text-gray-600">{session.gyms.area}</p>
                  )}
                </div>

                {session.gyms.type && (
                  <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                    {session.gyms.type}
                  </span>
                )}

                {session.gyms.description && (
                  <p className="text-sm text-gray-600 pt-2">
                    {session.gyms.description}
                  </p>
                )}

                <div className="pt-3 space-y-2">
                  {session.gyms.contact_phone && (
                    <a 
                      href={`tel:${session.gyms.contact_phone}`}
                      className="flex items-center text-sm text-gray-700 hover:text-blue-600"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      {session.gyms.contact_phone}
                    </a>
                  )}
                  
                  {session.gyms.contact_email && (
                    <a 
                      href={`mailto:${session.gyms.contact_email}`}
                      className="flex items-center text-sm text-gray-700 hover:text-blue-600"
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      {session.gyms.contact_email}
                    </a>
                  )}
                </div>

                <Link
                  href={`/venues/${session.gym_id}`}
                  className="block text-right text-sm text-blue-600 hover:text-blue-800 font-medium pt-3"
                >
                  View venue details →
                </Link>
              </div>
            </div>
          )}

          {/* Booking Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <BookButton session={session} isBooked={isBooked} />
          </div>
        </div>
      </div>
    </div>
  );
}