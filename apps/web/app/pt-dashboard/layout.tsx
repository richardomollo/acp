import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import PTDashboardLayout from "./PTDashboardLayout";

export default async function PTDashboardServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/partner-login");
  }

  const { data: pt, error } = await supabase
    .from("personal_trainers")
    .select("id, full_name, professional_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !pt) {
    redirect("/partner-login");
  }

  // Pending trainers can only view the pending page.
  // The pending/page.tsx renders its own full-page UI.
  if (pt.status === "pending") {
    redirect("/pt-pending");
  }

  const displayName = pt.professional_name || pt.full_name || "Trainer";

  const { data: gym } = await supabase
    .from("gyms")
    .select("id")
    .ilike("contact_email", user.email ?? "")
    .maybeSingle();

  return (
    <PTDashboardLayout ptId={pt.id} ptName={displayName} hasVenueRole={!!gym}>
      {children}
    </PTDashboardLayout>
  );
}
