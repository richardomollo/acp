import { redirect } from "next/navigation";
import { resolveWorkspaceIdentity } from "../../../_shared/identity";
import { proContextFor } from "../../../_shared/pro-context";
import { WorkoutDetailClient } from "./WorkoutDetailClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workout" };

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");
  const pro = proContextFor(identity);
  if (!pro || pro.workspace === "business") redirect("/lana-pro/workouts");

  const { id } = await params;
  return (
    <WorkoutDetailClient
      templateId={id}
      workspace={pro.workspace === "employed" ? "employed" : "independent"}
    />
  );
}
