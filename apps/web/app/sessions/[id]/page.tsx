import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import BookButton from "../../components/BookButton";
import VenueDetailMapWrapper from "../../venues/[id]/VenueDetailMapWrapper";

async function createServerClient() {
  const cookieStore = await cookies();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: {
          getItem: async (key: string) => cookieStore.get(key)?.value ?? null,
          setItem: async (key: string, value: string) => { cookieStore.set(key, value); },
          removeItem: async (key: string) => { cookieStore.delete(key); },
        },
      },
    }
  );
}

type Props = { params: Promise<{ id: string }> };

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) return notFound();

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: session, error } = await supabase
    .from("sessions")
    .select(`*, gyms!gym_id (id, name, location, area, type, description, contact_email, contact_phone, image_url)`)
    .eq("id", id)
    .single();

  if (error || !session) return notFound();

  let isBooked = false;
  if (user) {
    const sessionDate = session.date || new Date(session.start_time).toISOString().split("T")[0];
    const sessionTime = session.time || new Date(session.start_time).toTimeString().split(" ")[0];
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("user_id", user.id)
      .eq("gym_id", session.gym_id)
      .eq("booking_date", sessionDate)
      .eq("booking_time", sessionTime)
      .eq("status", "confirmed")
      .maybeSingle();
    isBooked = !!existing;
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 py-12">
      <Link href={`/venues/${session.gym_id}`} className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        Back to venue
      </Link>

      <div className="flex gap-10 items-start">
        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">

          {/* Hero image */}
          {session.image_url && (
            <img
              src={session.image_url}
              alt={session.name}
              className="w-full h-64 object-cover rounded-2xl mb-6"
            />
          )}

          {/* Title + meta */}
          <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-1">
            {session.category}{session.instructor ? ` · ${session.instructor}` : ""}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{session.name}</h1>

          {/* Detail pills */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className=" text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Date</p>
              <p className="font-medium text-gray-900">{fmtDate(session.date)}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-gray-400 mb-0.5">Time</p>
              <p className="font-medium text-gray-900">{session.time?.slice(0, 5)}</p>
            </div>
            {session.duration_minutes && (
              <div className=" text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Duration</p>
                <p className="font-medium text-gray-900">{session.duration_minutes} min</p>
              </div>
            )}
            {session.spots_left != null && (
              <div className=" text-sm">
                <p className="text-xs text-gray-400 mb-0.5">Spots left</p>
                <p className={`font-medium ${session.spots_left > 0 ? "text-green-600" : "text-red-500"}`}>
                  {session.spots_left > 0 ? session.spots_left : "Full"}
                </p>
              </div>
            )}
            {session.credits_required != null && (
              <div className="flex items-center">
                <span className="border border-blue-500 text-blue-500 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap">
                  {session.credits_required} credit{session.credits_required !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          {session.description && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-2">About this class</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{session.description}</p>
            </div>
          )}

          {/* Book button */}
          <div className="mt-2">
            <BookButton session={session} isBooked={isBooked} />
          </div>
        </div>

        {/* ── Right: sticky sidebar ── */}
        {session.gyms && (
          <div className="hidden md:block w-80 lg:w-96 flex-shrink-0">
            <div className="sticky top-[86px] space-y-3">
              {/* Map */}
              <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: 240 }}>
                <VenueDetailMapWrapper
                  name={session.gyms.name}
                  area={session.gyms.area ?? session.gyms.location ?? ""}
                  location={session.gyms.location ?? ""}
                />
              </div>

              {/* Venue info card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-3">
                <div>
                  <p className="font-semibold text-gray-900">{session.gyms.name}</p>
                  <p className="text-gray-500 capitalize mt-0.5">{session.gyms.type}</p>
                </div>

                {session.gyms.description && (
                  <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                    {session.gyms.description}
                  </p>
                )}

                {(session.gyms.location || session.gyms.contact_phone || session.gyms.contact_email) && (
                  <div className="border-t border-gray-100 pt-3 space-y-1.5">
                    {session.gyms.location && (
                      <p className="text-gray-500 flex gap-1.5">
                        <span>📍</span>
                        <span>{session.gyms.location}{session.gyms.area ? `, ${session.gyms.area}` : ""}</span>
                      </p>
                    )}
                    {session.gyms.contact_phone && (
                      <p className="text-gray-500 flex gap-1.5">
                        <span>📞</span>
                        <span>{session.gyms.contact_phone}</span>
                      </p>
                    )}
                    {session.gyms.contact_email && (
                      <a href={`mailto:${session.gyms.contact_email}`} className="text-blue-600 hover:underline flex gap-1.5">
                        <span>✉️</span>
                        <span>{session.gyms.contact_email}</span>
                      </a>
                    )}
                  </div>
                )}

                <Link
                  href={`/venues/${session.gym_id}`}
                  className="block text-sm text-blue-600 hover:underline font-medium pt-1 border-t border-gray-100"
                >
                  View venue 
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
