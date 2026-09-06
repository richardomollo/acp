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

  return (
    <TrainerDashboardLayout trainerName={trainer.full_name} gymName={gymName}>
      {children}
    </TrainerDashboardLayout>
  );
}
