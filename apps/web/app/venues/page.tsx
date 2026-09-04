import type { Metadata } from "next";
import { supabase } from "../lib/supabase";
import VenuesClient from "./VenuesClient";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Partner Venues | Lana Health",
  description:
    "Explore 50+ gyms, yoga studios, swimming pools, spas and wellness centres across Nairobi — all bookable with Lana Health.",
  openGraph: {
    title: "Partner Venues | Lana Health",
    description:
      "Explore 50+ gyms, yoga studios, pools, spas and wellness centres across Nairobi.",
    url: "https://activecitypass.com/venues",
  },
};

export default async function GymsPage() {
  const { data: gyms, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return <p className="p-8 text-red-500">Error loading venues</p>;
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div>
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                50+ partner venues · Nairobi
              </p>
              <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
                One membership.<br className="hidden sm:block" /> Every gym, studio &amp; spa in Nairobi.
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
                Lana Health gives you access to the full network — gyms, yoga studios, swimming pools,
                boxing gyms, spas and more. Walk in, train, and leave. No joining fees, no commitment.
              </p>
            </div>
        </div>
      </div>

      <VenuesClient gyms={gyms ?? []} />
    </div>
  );
}
