import { redirect } from "next/navigation";
import { resolveWorkspaceIdentity } from "../../_shared/identity";
import { proContextFor } from "../../_shared/pro-context";
import { WorkoutsClient } from "./WorkoutsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workouts" };

export default async function LanaProWorkoutsPage() {
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");

  const pro = proContextFor(identity);
  if (!pro || pro.workspace === "business") {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workouts</h1>
        <p className="text-gray-500 text-[15px] mt-2">
          The workout library is for personal trainers and coaches.
        </p>
      </div>
    );
  }

  return (
    <WorkoutsClient
      workspace={pro.workspace === "employed" ? "employed" : "independent"}
    />
  );
}
