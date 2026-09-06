import { redirect } from "next/navigation";
import { resolveWorkspaceIdentity } from "../../_shared/identity";
import { TeamManager } from "./TeamManager";

export const dynamic = "force-dynamic";

export default async function LanaProTeamPage() {
  const identity = await resolveWorkspaceIdentity();
  if (!identity) redirect("/partner-login");

  // Team management belongs to a venue owner. Resolve the venue from the active
  // business context, else the first owned gym.
  const ctx = identity.activeContext;
  const gymId =
    ctx?.kind === "business" && ctx.gymId ? ctx.gymId : identity.gyms[0]?.id ?? null;
  const gym = identity.gyms.find((g) => g.id === gymId) ?? identity.gyms[0] ?? null;

  if (!gym) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Team</h1>
        <p className="text-gray-500 text-[15px] mt-2">
          Team management is for venue accounts. This workspace isn&apos;t linked to a venue.
        </p>
      </div>
    );
  }

  return (
    <TeamManager
      gymId={gym.id}
      gymName={gym.name ?? "your venue"}
      allGyms={identity.gyms.map((g) => ({ id: g.id, name: g.name ?? "Venue" }))}
    />
  );
}
