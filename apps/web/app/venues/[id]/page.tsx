import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import GymGallery from "@/app/components/GymGallery";
import Link from "next/link";
import VenueSessionsFilter from "./VenueSessionsFilter";



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
  

  const todayStr = new Date().toISOString().split("T")[0];
  const windowEndStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  })();

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
      image_url,
      credits_required
    `)
    .eq("gym_id", id)
    .gte("date", todayStr)
    .lte("date", windowEndStr)
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
  <div className="">

  
  <GymGallery
    name={gym.name}
    images={[
      gym.image_url,
      // "https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide1.png",
      // "https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide2.png",
      // "https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/gallery/slide3.png",
    ].filter(Boolean)}
  />
  </div>
 
</div>
      
      <p className="mt-6 text-sm text-gray-600 leading-relaxed">{gym.description}</p>
      {/* CLASSES / SESSIONS */}
      {sessions && sessions.length > 0 ? (
        <VenueSessionsFilter sessions={sessions} />
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
