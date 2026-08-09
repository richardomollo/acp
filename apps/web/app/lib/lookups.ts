import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function fetchVenueTypes(): Promise<string[]> {
  const { data } = await supabase
    .from("venue_types")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r) => r.name) ?? [];
}

export async function fetchSessionCategories(): Promise<string[]> {
  const { data } = await supabase
    .from("session_categories")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r) => r.name) ?? [];
}

export async function fetchPTSpecialisations(): Promise<string[]> {
  const { data } = await supabase
    .from("pt_specialisations")
    .select("name")
    .order("sort_order", { ascending: true });
  return data?.map((r) => r.name) ?? [];
}
