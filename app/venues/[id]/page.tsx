import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";


type Props = {
  params: Promise<{
    id: string;
  }>;
};


export async function generateMetadata({ params }: Props) {
  const { id } = await params;

  const { data: gym } = await supabase
    .from("gyms")
    .select("name, description")
    .eq("id", id)
    .single();

  return {
    title: gym?.name ?? "Gym",
    description: gym?.description,
  };
}

export default async function GymDetailPage({ params }: Props) {
  const { id } = await params;

  const { data: gym, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !gym) {
    notFound();
  }
  

  // Fetch sessions (add this after fetching the gym)
const { data: sessions, error: sessionsError } = await supabase
  .from("sessions")
  .select(`
    id,
    name,
    category,
    date,
    time,
    duration_minutes,
    instructor,
    spots_left,
    max_capacity,
    image_url
  `)
  .eq("gym_id", id)
  .order("date", { ascending: true })
  .order("time", { ascending: true });

if (sessionsError) {
  console.error("Error fetching sessions:", sessionsError);
}

  return (
    <div className="max-w-7h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12">
      <Link
        href="/venues"
        className="text-sm text-gray-500 hover:underline mb-6 inline-block"
      >
        ← Back to all venues
      </Link>

      <h1 className="text-3xl font-semibold mx-auto">{gym.name}</h1>
      <p className="text-sm text-slate-500 mb-2 mx-auto">{gym.type}</p>
      <p className="text-sm text-slate-500 mb-2 mx-auto">📍{gym.location}</p>
<div className="flex flex-row gap-6">
  <div className="w-2/3">

    <div className="w-full mb-4">
      {gym.image_url ? (
      <img
      id="main-image"
      src={gym.image_url}
      alt={gym.name}
      className="w-full rounded-lg" />
                
      ) : (
      <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-400">
         No image
      </div>
        )}
    </div>

     <div className="grid grid-cols-4 max-w-3xl gap-4 " id="thumbnail-container">
              <img src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide1.png" className="thumb rounded-lg md:h-24 h-14 object-cover cursor-pointer hover:opacity-80" alt="Thumb 1" />
              <img src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide2.png" className="thumb rounded-lg md:h-24 h-14 object-cover cursor-pointer hover:opacity-80" alt="Thumb 2" />
              <img src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide3.png" className="thumb rounded-lg md:h-24 h-14 object-cover cursor-pointer hover:opacity-80" alt="Thumb 3" />
              <img src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide4.png" className="thumb rounded-lg md:h-24 h-14 object-cover cursor-pointer hover:opacity-80" alt="Thumb 4" />
            </div>

            <script>
              {`
                const container = document.getElementById('thumbnail-container');
                if (container) {
                  container.addEventListener('click', function (e) {
                    if (e.target.classList.contains('thumb')) {
                      const mainImage = document.getElementById('main-image');
                      if (mainImage) {
                        mainImage.src = e.target.src;
                      }
                    }
                  });
                }
              `}
            </script> 
  
  </div>
  <div className="w-1/3">
      <h1 className="text-3xl font-semibold mx-auto">{gym.name}</h1>
      <p className="text-sm text-slate-500 mb-2 mx-auto">{gym.area}</p>
      <p className="text-sm text-slate-500 mb-2 mx-auto">📍{gym.location}</p>
      <p className="text-sm text-slate-500 mb-2 mx-auto">📍{gym.contact_email}</p>
      <p className="text-sm text-slate-500 mb-2 mx-auto">📍{gym.contact_phone}</p>
      
  </div>
</div>
      
      <p className="mt-6 text-sm text-gray-600 leading-relaxed">{gym.description}</p>
      {/* CLASSES / SESSIONS */}
{sessions && sessions.length > 0 ? (
  <div className="mt-12">
    <h2 className="text-xl font-semibold mb-4">
      Classes offered
    </h2>

    <ul className="grid gap-4 sm:grid-cols-5">
      {sessions.map((session) => (
          <div key={session.id} className="bg-white rounded-xl pb-4 overflow-hidden border border-gray-200 hover:-translate-y-1 transition duration-300">
            <div className="relative h-35 w-full">
              {session.image_url && (
                
                <Link
                   href={`/sessions/${session.id}`}>
                  <img
                    src={session.image_url}
                    alt={session.name}
                    className="w-full h-35 object-cover object-top" />
                </Link>
              )}
            </div>
            <div className="flex flex-col p-6">
              <h2 className="text-m font-semibold">{session.name} - {session.category}, {session.duration_minutes} min</h2>
              {session.description && (
                <p className="text-sm">
                  {session.description}
                </p>
              )}
              <p className="text-sm text-gray-600">{session.instructor}</p>
              <p className="text-sm text-gray-600">{session.duration_minutes} min</p>
              <p className="text-sm text-gray-600 mb-2">Capacity {session.max_capacity}</p>
              <p className="text-sm text-gray-700">
               📅 {new Date(session.date).toLocaleDateString()} · 🕒 {session.time}
              </p>
            </div>
          </div>
      ))}
    </ul>
  </div>
) : (
  <p className="mt-6 text-gray-500">No classes available at this gym yet.</p>
)}


      {/* IMAGE */}
     

    


      {/* CONTACT */}
      <div className=" pt-6 space-y-2">
        {gym.phone && <p>📞 {gym.phone}</p>}
        {gym.email && <p>✉️ {gym.email}</p>}
        {gym.address && <p>📍 {gym.address}</p>}
      </div>
    </div>
  );
}
