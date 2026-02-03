import { supabase } from "../lib/supabase";
import Image from "next/image"; 
import Link from "next/link";

export default async function GymsPage() {
  const { data: gyms, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return <p>Error loading gyms</p>;
  }

  return (
    <div className="max-w-7h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12 ">
      <h1 className="text-2xl font-bold mb-8">Discover our venues in Nairobi</h1>
      <div className="grid gap-6 md:grid-cols-4 w-full lg:grid-cols-5">
        {gyms?.map((gym) => (
          <div 
            key={gym.id}
            className="bg-white rounded-xl pb-4 overflow-hidden border border-gray-200 hover:-translate-y-1 transition duration-300">
            
             {/* IMAGE */}
            {gym.image_url ? (
              <Link href={`/venues/${gym.id}/`}>
                <div className="relative h-40 w-full">
                  <img
                    src={gym.image_url}
                    alt={gym.name}
                    className="w-full h-40 object-cover object-top" />
                </div>
              </Link>
            ) : (
              <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-400">
                No image
              </div>
            )}
            <div className="flex flex-col px-5 py-3">
              <h2 className="text-m font-semibold">{gym.name}</h2>
              <p className="text-sm mb-1">{gym.type}</p>
              <p className="text-sm text-gray-500 mb-1">{gym.description}</p>
              <p className="text-sm">
                {gym.location}, {gym.area}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
