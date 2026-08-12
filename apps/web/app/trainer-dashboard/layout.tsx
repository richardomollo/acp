import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import TrainerDashboardLayout from "./TrainerDashboardLayout";

export default async function TrainerDashboardServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/partner-login?redirect=/trainer-dashboard");
  }

  const { data: trainer, error } = await supabase
    .from("gym_trainers")
    .select("id, full_name, status, gyms(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !trainer || trainer.status !== "active") {
    redirect("/partner-login");
  }

  const gymName = (trainer as any).gyms?.name ?? "Your gym";

  const { data: communityMembership } = await supabase
    .from("community_members")
    .select("communities(review_status)")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const communityStatus = (communityMembership?.communities as any)?.review_status as
    | "pending" | "approved" | "rejected" | undefined;

  return (
    <TrainerDashboardLayout trainerName={trainer.full_name} gymName={gymName} communityStatus={communityStatus}>
      {children}
    </TrainerDashboardLayout>
  );
}
