import { supabase } from "../lib/supabase";
import VenuesClient from "./VenuesClient";

export default async function GymsPage() {
  const { data: gyms, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return <p className="p-8 text-red-500">Error loading venues</p>;
  }

  return <VenuesClient gyms={gyms ?? []} />;
}
