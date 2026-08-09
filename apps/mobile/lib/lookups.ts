import { supabase } from "./supabase";

export async function fetchVenueTypes(): Promise<string[]> {
  const { data } = await supabase
    .from("venue_types")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r: any) => r.name) ?? [];
}

export async function fetchSessionCategories(): Promise<string[]> {
  const { data } = await supabase
    .from("session_categories")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r: any) => r.name) ?? [];
}

export async function fetchPTSpecialisations(): Promise<string[]> {
  const { data } = await supabase
    .from("pt_specialisations")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r: any) => r.name) ?? [];
}
